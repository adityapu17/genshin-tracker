// Fitur tambahan Genshin Tracker: timer live, countdown reset, endgame, farming harian,
// Traveler's Diary, dan skor artefak (Crit Value). Dipakai oleh app.js (esc, Api, Storage).

// ---------- Waktu server & countdown ----------
const SERVER_OFFSET_H = { os_asia: 8, os_cht: 8, os_euro: 1, os_usa: -5 };
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function serverOffsetMs() {
  return (SERVER_OFFSET_H[Storage.server] ?? 8) * 3600 * 1000;
}
// Epoch ms dari wall-clock waktu server (y, m 0-based, d, jam, menit)
function serverWallToEpoch(y, m, d, h = 0, min = 0) {
  return Date.UTC(y, m, d, h, min) - serverOffsetMs();
}
// Komponen kalender "sekarang" di zona server (baca pakai getUTC*)
function serverNowParts(nowMs = Date.now()) {
  return new Date(nowMs + serverOffsetMs());
}
// Hari efektif game (reset harian jam 04:00 server): 0 = Minggu ... 6 = Sabtu
function gameDayOfWeek(nowMs = Date.now()) {
  return new Date(nowMs + serverOffsetMs() - 4 * 3600 * 1000).getUTCDay();
}

function fmtCountdown(ms) {
  if (ms <= 0) return 'sekarang';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} hari ${h}j ${m}m`;
  if (h > 0) return `${h}j ${m}m ${String(sec).padStart(2, '0')}s`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

// Jam lokal HP untuk target waktu (tambah "besok"/tanggal kalau bukan hari ini)
function fmtClock(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === today.toDateString()) return time;
  if (d.toDateString() === tomorrow.toDateString()) return `besok ${time}`;
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${time}`;
}

// Satu ticker global: update semua elemen [data-end] tiap detik
let _tickerStarted = false;
function startTicker() {
  if (_tickerStarted) return;
  _tickerStarted = true;
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-end]').forEach((el) => {
      const end = Number(el.dataset.end);
      const left = end - now;
      el.textContent = left <= 0 ? (el.dataset.done || 'sekarang') : fmtCountdown(left);
    });
  }, 1000);
}
function cd(endTs, doneText) {
  return `<span class="cd" data-end="${esc(endTs)}"${doneText ? ` data-done="${esc(doneText)}"` : ''}>${esc(fmtCountdown(endTs - Date.now()))}</span>`;
}

// ---------- Data statis (farming + reset) ----------
let _farming = null, _resets = null;
async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} gagal dimuat (${r.status})`);
  return r.json();
}
async function getFarming() { return _farming || (_farming = await loadJson('data/farming.json')); }
async function getResets() { return _resets || (_resets = await loadJson('data/resets.json')); }

// ---------- Timer Home (resin, realm currency, transformer, ekspedisi, boss) ----------
function secs(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resinCountdownHtml(note, fetchedAt) {
  const left = secs(note.resin_recovery_time);
  if (!left) return '<span class="muted">Penuh</span>';
  const end = fetchedAt + left * 1000;
  return `<span class="muted">penuh ${cd(end, 'Penuh')} · jam ${esc(fmtClock(end))}</span>`;
}

function renderTimersCard(note, fetchedAt) {
  const rows = [];

  // Realm currency
  if (note.max_home_coin !== undefined && Number(note.max_home_coin) > 0) {
    const left = secs(note.home_coin_recovery_time);
    rows.push(`<div class="stat-row"><span>🏠 Realm Currency</span><span>${esc(note.current_home_coin)}/${esc(note.max_home_coin)} · ${
      left ? cd(fetchedAt + left * 1000, 'Penuh') : 'Penuh'}</span></div>`);
  }

  // Parametric Transformer
  const tf = note.transformer;
  if (tf && tf.obtained) {
    const rt = tf.recovery_time || {};
    const left = ((rt.Day || 0) * 86400 + (rt.Hour || 0) * 3600 + (rt.Minute || 0) * 60 + (rt.Second || 0));
    const ready = rt.reached || left <= 0;
    rows.push(`<div class="stat-row"><span>🔬 Parametric Transformer</span><span>${
      ready ? '<b class="good">Siap dipakai</b>' : cd(fetchedAt + left * 1000, 'Siap dipakai')}</span></div>`);
  }

  // Ekspedisi
  const exps = Array.isArray(note.expeditions) ? note.expeditions : [];
  exps.forEach((e, i) => {
    const left = secs(e.remained_time);
    const done = String(e.status).toLowerCase() === 'finished' || left <= 0;
    rows.push(`<div class="stat-row"><span>🧭 Ekspedisi ${i + 1}</span><span>${
      done ? '<b class="good">Selesai</b>' : cd(fetchedAt + left * 1000, 'Selesai')}</span></div>`);
  });

  // Weekly boss discount
  if (note.resin_discount_num_limit !== undefined) {
    const remain = note.remain_resin_discount_num ?? 0;
    rows.push(`<div class="stat-row"><span>👹 Weekly Boss (resin 1/2)</span><span>${esc(remain)}/${esc(note.resin_discount_num_limit)} tersisa</span></div>`);
  }

  // Misi harian: hadiah Encounter Points
  if (Number(note.total_task_num) > 0 && Number(note.finished_task_num) >= Number(note.total_task_num) && note.is_extra_task_reward_received === false) {
    rows.push('<div class="stat-row"><span>📜 Hadiah misi harian</span><span><b class="warn">Belum diambil</b></span></div>');
  }

  if (!rows.length) return '';
  return `<div class="card"><div class="card-title">Timer</div>${rows.join('')}</div>`;
}

// ---------- Countdown reset (harian, mingguan, Abyss, Theater, Stygian) ----------
function nextMonthlyReset(day, hour, nowMs) {
  const p = serverNowParts(nowMs);
  let y = p.getUTCFullYear(), m = p.getUTCMonth();
  let t = serverWallToEpoch(y, m, day, hour);
  if (t <= nowMs) { m += 1; t = serverWallToEpoch(y, m, day, hour); } // Date.UTC menormalkan bulan > 11
  return t;
}
function nextDailyReset(hour, nowMs) {
  const p = serverNowParts(nowMs);
  let t = serverWallToEpoch(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate(), hour);
  if (t <= nowMs) t += 86400000;
  return t;
}
function nextWeeklyReset(weekday, hour, nowMs) {
  let t = nextDailyReset(hour, nowMs);
  // majukan per hari sampai hari server (setelah reset 04:00) = weekday yang dimaksud
  for (let i = 0; i < 8; i++) {
    const dow = new Date(t + serverOffsetMs()).getUTCDay();
    if (dow === weekday) return t;
    t += 86400000;
  }
  return t;
}
// Stygian: jendela buka berulang tiap periodDays dari anchor; di luar jendela = tutup
function stygianState(cfg, nowMs) {
  const [dPart, tPart] = cfg.anchorLocal.split('T');
  const [y, mo, d] = dPart.split('-').map(Number);
  const [h, mi] = tPart.split(':').map(Number);
  const anchor = serverWallToEpoch(y, mo - 1, d, h, mi);
  const period = cfg.periodDays * 86400000;
  const open = cfg.openHours * 3600000;
  const k = Math.floor((nowMs - anchor) / period);
  const start = anchor + k * period;
  if (nowMs < start + open) return { open: true, end: start + open };
  return { open: false, next: start + period };
}

async function renderResetCard() {
  let cfg;
  try { cfg = await getResets(); } catch (e) { return `<div class="card"><div class="card-title">Reset</div><p class="muted">Gagal memuat jadwal: ${esc(e.message)}</p></div>`; }
  const now = Date.now();
  const rows = [];
  rows.push(['🌅 Reset harian', cd(nextDailyReset(cfg.dailyHour, now))]);
  rows.push(['📅 Reset mingguan (Sen)', cd(nextWeeklyReset(cfg.weeklyDay, cfg.dailyHour, now))]);
  rows.push(['🌀 Spiral Abyss', cd(nextMonthlyReset(cfg.abyss.day, cfg.abyss.hour, now))]);
  rows.push(['🎭 Imaginarium Theater', cd(nextMonthlyReset(cfg.theater.day, cfg.theater.hour, now))]);
  const sg = stygianState(cfg.stygian, now);
  rows.push(sg.open
    ? ['⚔️ Stygian Onslaught (berakhir)', cd(sg.end)]
    : ['⚔️ Stygian Onslaught (buka lagi)', cd(sg.next)]);
  return `<div class="card">
    <div class="card-title">Reset &amp; Jadwal (waktu server)</div>
    ${rows.map(([l, v]) => `<div class="stat-row"><span>${l}</span><span>${v}</span></div>`).join('')}
    <p class="muted" style="margin-top:8px;font-size:12px">Jadwal Abyss/Theater/Stygian mengikuti pola 2026 dan bisa berubah. Edit <code>data/resets.json</code> kalau HoYoverse ganti siklus.</p>
  </div>`;
}

// ---------- Traveler's Diary ----------
function fmtNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('id-ID') : '-';
}

async function renderDiaryCard() {
  try {
    const data = await Api.getDiary(0);
    const md = data.month_data || {};
    const dd = data.day_data || {};
    const groups = (md.group_by || []).slice().sort((a, b) => (b.num || 0) - (a.num || 0)).slice(0, 5);
    return `<div class="card">
      <div class="card-title">Traveler's Diary · bulan ${esc(data.data_month ?? '')}</div>
      <div class="grid-2" style="margin-bottom:8px">
        <div class="mini-stat"><div class="label">Primogem bulan ini</div><div class="val">${esc(fmtNum(md.current_primogems))}</div></div>
        <div class="mini-stat"><div class="label">Mora bulan ini</div><div class="val">${esc(fmtNum(md.current_mora))}</div></div>
      </div>
      <div class="stat-row"><span>Primogem hari ini</span><span>${esc(fmtNum(dd.current_primogems))}</span></div>
      <div class="stat-row"><span>Primogem bulan lalu</span><span>${esc(fmtNum(md.last_primogems))}</span></div>
      ${groups.length ? `<div class="section-label">Sumber primogem terbesar</div>${groups.map((g) =>
        `<div class="stat-row"><span>${esc(g.action ?? '-')}</span><span>${esc(fmtNum(g.num))} (${esc(g.percent ?? 0)}%)</span></div>`).join('')}` : ''}
    </div>`;
  } catch (e) {
    return `<div class="card"><div class="card-title">Traveler's Diary</div><p class="muted">Tidak tersedia: ${esc(e.message)}</p></div>`;
  }
}

// ---------- Skor artefak (Crit Value) ----------
// property_type 20 = CRIT Rate, 22 = CRIT DMG (ID bawaan API); fallback ke nama stat.
function critKind(sub, propertyMap) {
  const t = Number(sub?.property_type);
  if (t === 20) return 'rate';
  if (t === 22) return 'dmg';
  const name = String(propertyMap?.[sub?.property_type]?.name ?? sub?.info?.name ?? sub?.name ?? '').toLowerCase();
  if (/crit|kritis/.test(name)) {
    if (/dmg|damage|dmg/.test(name)) return 'dmg';
    if (/rate|rasio|laju|tingkat/.test(name)) return 'rate';
  }
  return null;
}
function numFromStat(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
// CV = CRIT Rate × 2 + CRIT DMG (hanya substat)
function relicCV(relic, propertyMap) {
  let cv = 0;
  for (const s of relic.sub_property_list || []) {
    const kind = critKind(s, propertyMap);
    const val = numFromStat(s.final ?? s.value ?? s.num ?? s.info?.value);
    if (kind === 'rate') cv += val * 2;
    else if (kind === 'dmg') cv += val;
  }
  return Math.round(cv * 10) / 10;
}
function cvClass(cv) {
  if (cv >= 35) return 'cv-high';
  if (cv >= 20) return 'cv-mid';
  return 'cv-low';
}

// ---------- Tab Endgame ----------
function starsText(star, max) {
  return `★ ${esc(star ?? 0)}/${esc(max ?? 0)}`;
}

function renderAvatarRow(avatars) {
  if (!Array.isArray(avatars) || !avatars.length) return '';
  return `<div class="avatars-row">${avatars.map((a) =>
    `<img src="${esc(a.icon ?? a.image ?? '')}" alt="" title="Lv.${esc(a.level ?? '')}" data-fallback>`).join('')}</div>`;
}

function renderAbyss(data) {
  if (!data || !Array.isArray(data.floors) || !data.floors.length) {
    return '<p class="muted">Belum ada data Spiral Abyss untuk periode ini (atau belum dibuka).</p>';
  }
  const floors = data.floors.slice().sort((a, b) => (b.index || 0) - (a.index || 0));
  return `
    <div class="grid-2" style="margin-bottom:10px">
      <div class="mini-stat"><div class="label">Total bintang</div><div class="val">★ ${esc(data.total_star ?? 0)}</div></div>
      <div class="mini-stat"><div class="label">Lantai tertinggi</div><div class="val">${esc(data.max_floor ?? '-')}</div></div>
      <div class="mini-stat"><div class="label">Pertarungan</div><div class="val">${esc(data.total_battle_times ?? 0)}</div></div>
      <div class="mini-stat"><div class="label">Menang</div><div class="val">${esc(data.total_win_times ?? 0)}</div></div>
    </div>
    ${floors.map((f) => `
      <div class="floor">
        <div class="row"><b>Lantai ${esc(f.index)}</b><span class="stars">${starsText(f.star, f.max_star)}</span></div>
        ${(f.levels || []).map((lv) => `
          <div class="chamber">
            <div class="row"><span class="muted">Chamber ${esc(lv.index)}</span><span class="stars">${starsText(lv.star, lv.max_star)}</span></div>
            ${(lv.battles || []).map((b) => renderAvatarRow(b.avatars)).join('')}
          </div>`).join('')}
      </div>`).join('')}`;
}

function endgameSummaryRows(stats) {
  const rows = [];
  rows.push(['🌀 Spiral Abyss', stats.spiral_abyss ?? '-']);

  const rc = stats.role_combat;
  if (rc && typeof rc === 'object') {
    const parts = [];
    if (rc.max_round_id !== undefined) parts.push(`Act ${rc.max_round_id}`);
    if (rc.difficulty_id !== undefined) parts.push(`tingkat ${rc.difficulty_id}`);
    rows.push(['🎭 Imaginarium Theater', parts.length ? parts.join(' · ') : (rc.has_data === false ? 'belum ikut' : '-')]);
  } else {
    rows.push(['🎭 Imaginarium Theater', '-']);
  }

  const hc = stats.hard_challenge;
  if (hc && typeof hc === 'object') {
    const parts = [];
    if (hc.name) parts.push(hc.name);
    if (hc.difficulty !== undefined) parts.push(`tingkat ${hc.difficulty}`);
    rows.push(['⚔️ Stygian Onslaught', parts.length ? parts.join(' · ') : (hc.has_data === false ? 'belum ikut' : '-')]);
  } else {
    rows.push(['⚔️ Stygian Onslaught', '-']);
  }
  return rows;
}

let _abyssPrev = false;
async function loadEndgame() {
  const el = document.getElementById('tab-endgame');
  el.innerHTML = '<div class="spinner">Memuat endgame...</div>';
  try {
    const index = await Api.getIndexCached();
    const stats = index.stats || {};
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Progres Endgame</div>
        ${endgameSummaryRows(stats).map(([l, v]) => `<div class="stat-row"><span>${l}</span><span>${esc(v)}</span></div>`).join('')}
      </div>
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <div class="card-title" style="margin:0">Spiral Abyss</div>
          <div class="seg">
            <button class="seg-btn ${_abyssPrev ? '' : 'active'}" data-prev="0">Periode ini</button>
            <button class="seg-btn ${_abyssPrev ? 'active' : ''}" data-prev="1">Sebelumnya</button>
          </div>
        </div>
        <div id="abyss-body"><div class="spinner">Memuat Abyss...</div></div>
      </div>`;
    el.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      _abyssPrev = b.dataset.prev === '1';
      loadEndgame();
    }));
    loadAbyssBody();
  } catch (e) {
    el.innerHTML = `<div class="card"><p class="error">Gagal memuat: ${esc(e.message)}</p></div>`;
  }
}

async function loadAbyssBody() {
  const body = document.getElementById('abyss-body');
  if (!body) return;
  try {
    const data = await Api.getSpiralAbyss(_abyssPrev);
    body.innerHTML = renderAbyss(data);
    wireImgFallback(body);
  } catch (e) {
    body.innerHTML = `<p class="error">Gagal memuat Abyss: ${esc(e.message)}</p>`;
  }
}

// ---------- Tab Farming ----------
function isOpenToday(cfg, day) {
  return cfg.d.includes(day) || day === 0;
}

async function loadFarming() {
  const el = document.getElementById('tab-farming');
  el.innerHTML = '<div class="spinner">Memuat jadwal farming...</div>';
  try {
    const [farm, index] = await Promise.all([getFarming(), Api.getIndexCached()]);
    const day = gameDayOfWeek();
    const avatars = index.avatars || index.list || [];

    // Talent book: karakter yang dimiliki dikelompokkan per book yang buka hari ini
    const byBook = {};
    for (const a of avatars) {
      const info = farm.characters[String(a.id)];
      if (!info) continue;
      (byBook[info[1]] = byBook[info[1]] || []).push(a);
    }
    const bookKeys = Object.keys(byBook).filter((k) => farm.books[k] && isOpenToday(farm.books[k], day)).sort();

    // Material senjata: senjata yang dipakai karakter, dikelompokkan per family
    const byFam = {};
    for (const a of avatars) {
      const wid = a.weapon && a.weapon.id;
      const fam = wid !== undefined ? farm.weapons[String(wid)] : undefined;
      if (fam === undefined) continue;
      (byFam[fam] = byFam[fam] || []).push(a);
    }
    const famKeys = Object.keys(byFam).filter((k) => isOpenToday(farm.wfam[k], day)).sort((x, y) => Number(x) - Number(y));

    const isSunday = day === 0;
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Hari ini · ${esc(DAY_NAMES[day])} (waktu server)</div>
        <p class="muted">${isSunday ? 'Hari Minggu: semua domain terbuka.' : 'Domain yang terbuka hari ini ditampilkan di bawah.'} Daftar mencakup semua karakter yang kamu punya, termasuk yang talent-nya sudah maksimal (level talent tidak tersedia dari API).</p>
      </div>

      <div class="card">
        <div class="card-title">Talent Book</div>
        ${bookKeys.length ? bookKeys.map((k) => `
          <div class="farm-group">
            <div class="row"><b>Teachings of ${esc(k)}</b><span class="muted">${esc(farm.books[k].dom)}</span></div>
            <div class="farm-chars">${byBook[k].map((a) => `
              <div class="farm-char"><img src="${esc(charIcon(a))}" alt="" data-fallback><span>${esc(a.name)}</span></div>`).join('')}</div>
          </div>`).join('') : '<p class="muted">Tidak ada karakter kamu yang butuh book dari domain yang buka hari ini.</p>'}
      </div>

      <div class="card">
        <div class="card-title">Material Senjata</div>
        ${famKeys.length ? famKeys.map((k) => `
          <div class="farm-group">
            <div class="row"><b>${esc(farm.wfam[k].n)}</b><span class="muted">${esc(farm.wfam[k].dom)}</span></div>
            <div class="farm-chars">${byFam[k].map((a) => `
              <div class="farm-char"><img src="${esc(a.weapon.icon ?? '')}" alt="" data-fallback><span>${esc(a.weapon.name ?? '-')}</span><span class="muted" style="font-size:10px">${esc(a.name)}</span></div>`).join('')}</div>
          </div>`).join('') : '<p class="muted">Tidak ada senjata terpakai yang butuh material dari domain yang buka hari ini.</p>'}
      </div>
      <p class="muted" style="font-size:12px">Sumber data: ${esc(farm.source)}. Karakter/senjata yang baru rilis bisa belum ada di tabel ini.</p>`;
    wireImgFallback(el);
  } catch (e) {
    el.innerHTML = `<div class="card"><p class="error">Gagal memuat: ${esc(e.message)}</p></div>`;
  }
}
