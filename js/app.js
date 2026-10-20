// ---------- Utilities ----------
// Escape SEMUA string dari API/user sebelum masuk innerHTML (mitigasi XSS —
// nickname, nama karakter/senjata/artefak, pesan error, dst. bisa mengandung < > " ' &).
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%232a2a3a%22/%3E%3C/svg%3E";

// Ganti onerror inline (diblokir CSP script-src 'self') dengan listener JS setelah render.
function wireImgFallback(root) {
  (root || document).querySelectorAll('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      img.removeAttribute('data-fallback');
      img.src = IMG_FALLBACK;
    }, { once: true });
  });
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}
function fmtTime(seconds) {
  if (!seconds || seconds <= 0) return 'Penuh';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}j ${m}m lagi`;
}

// ---------- Boot ----------
function boot() {
  // Splash dulu (3 detik), baru tampilkan setup/app.
  Splash.run(SPLASH_DURATION_MS).then(() => {
    if (Storage.cookie && Storage.roleId) {
      showApp();
    } else {
      showSetup();
    }
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function showSetup() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('setup-server').value = Storage.server;
  document.getElementById('setup-uid').value = Storage.roleId;
  document.getElementById('setup-cookie').value = Storage.cookie;
}

function showApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  loadHome();
  if (typeof window.initPush === 'function') window.initPush();
}

document.getElementById('btn-connect').addEventListener('click', async () => {
  const server = document.getElementById('setup-server').value;
  const uid = document.getElementById('setup-uid').value.trim();
  const cookie = document.getElementById('setup-cookie').value.trim();
  const errEl = document.getElementById('setup-error');
  errEl.classList.add('hidden');

  if (!uid || !cookie) {
    errEl.textContent = 'UID dan Cookie wajib diisi.';
    errEl.classList.remove('hidden');
    return;
  }
  Storage.server = server; Storage.roleId = uid; Storage.cookie = cookie;

  const btn = document.getElementById('btn-connect');
  btn.disabled = true; btn.textContent = 'Menghubungkan...';
  try {
    await Api.getIndex(); // test call
    showApp();
  } catch (e) {
    errEl.textContent = 'Gagal konek: ' + e.message + '. Cek lagi cookie & UID kamu.';
    errEl.classList.remove('hidden');
    Storage.clear();
  } finally {
    btn.disabled = false; btn.textContent = 'Hubungkan';
  }
});

document.getElementById('btn-howto').addEventListener('click', () => document.getElementById('howto-modal').classList.remove('hidden'));
document.getElementById('btn-close-howto').addEventListener('click', () => document.getElementById('howto-modal').classList.add('hidden'));

document.getElementById('btn-settings').addEventListener('click', () => {
  if (confirm('Putus koneksi akun HoyoLab dari HP ini?')) {
    Storage.clear();
    showSetup();
  }
});

// ---------- Nav ----------
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    if (btn.dataset.tab === 'characters') loadCharacters();
  });
});

// ---------- Home tab ----------
async function loadHome() {
  const el = document.getElementById('tab-home');
  el.innerHTML = '<div class="spinner">Memuat data...</div>';
  try {
    const [note, index, signInfo, signHome] = await Promise.all([
      Api.getDailyNote(),
      Api.getIndex(),
      Api.getSignInfo().catch(() => null),
      Api.getSignHome().catch(() => null),
    ]);
    renderHome(el, note, index, signInfo, signHome);
  } catch (e) {
    el.innerHTML = `<div class="card"><p class="error">Gagal memuat: ${esc(e.message)}</p></div>`;
  }
}

function renderHome(el, note, index, signInfo, signHome) {
  const resinPct = Math.min(100, Math.round((note.current_resin / note.max_resin) * 100));
  const role = index.role || {};
  const stats = index.stats || {};

  const alreadySigned = signInfo && signInfo.is_sign;

  // Hitung reward hari ini dari kalender bulanan (awards[0] = tanggal 1, dst),
  // pakai tanggal dari signInfo.today biar akurat sesuai server HoyoLab.
  let todayReward = null;
  if (signHome && Array.isArray(signHome.awards) && signInfo && signInfo.today) {
    const dayOfMonth = parseInt(signInfo.today.split('-')[2], 10);
    todayReward = signHome.awards[dayOfMonth - 1] || null;
  }

  el.innerHTML = `
    <div class="card">
      <div class="row">
        <div class="card-title">Resin</div>
        <div class="muted">${esc(fmtTime(note.resin_recovery_time))}</div>
      </div>
      <div class="big-stat">${esc(note.current_resin)} <span class="muted" style="font-size:16px">/ ${esc(note.max_resin)}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${resinPct}%"></div></div>
    </div>

    <div class="grid-2">
      <div class="mini-stat">
        <div class="label">Misi Harian</div>
        <div class="val">${esc(note.finished_task_num)}/${esc(note.total_task_num)}</div>
      </div>
      <div class="mini-stat">
        <div class="label">Ekspedisi</div>
        <div class="val">${esc(note.current_expedition_num)}/${esc(note.max_expedition_num)}</div>
      </div>
      <div class="mini-stat">
        <div class="label">Realm Currency</div>
        <div class="val">${esc(note.current_home_coin ?? '-')}/${esc(note.max_home_coin ?? '-')}</div>
      </div>
      <div class="mini-stat">
        <div class="label">AR / World Level</div>
        <div class="val">${esc(role.level ?? '-')} / WL${esc(stats.world_level ?? '-')}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Check-in Harian</div>
      <div class="row">
        <span>${alreadySigned ? '✅ Sudah check-in hari ini' : '⏳ Belum check-in hari ini'}</span>
      </div>
      ${todayReward ? `
        <div class="today-reward">
          <img src="${esc(todayReward.icon ?? '')}" alt="${esc(todayReward.name ?? '')}" data-fallback>
          <div>
            <div class="name">${esc(todayReward.name ?? 'Reward hari ini')}</div>
            <div class="cnt">x${esc(todayReward.cnt ?? '-')}</div>
          </div>
        </div>
      ` : ''}
      <button class="btn-primary" id="btn-checkin" ${alreadySigned ? 'disabled' : ''}>
        ${alreadySigned ? 'Sudah Check-in' : 'Check-in Sekarang'}
      </button>
    </div>

    <div class="card" id="push-card"></div>

    <div class="card">
      <div class="card-title">Redeem Code</div>
      <input id="redeem-input" class="redeem-input" type="text" placeholder="Masukkan kode redeem" maxlength="20">
      <button class="btn-primary" id="btn-redeem">Redeem</button>
      <p id="redeem-result" class="muted" style="margin-top:8px"></p>
    </div>

    <div class="card">
      <div class="card-title">Ringkasan Akun</div>
      <div class="stat-row"><span>Nickname</span><span>${esc(role.nickname ?? '-')}</span></div>
      <div class="stat-row"><span>Jumlah Karakter</span><span>${esc(stats.avatar_number ?? '-')}</span></div>
      <div class="stat-row"><span>Achievement</span><span>${esc(stats.achievement_number ?? '-')}</span></div>
      <div class="stat-row"><span>Spiral Abyss</span><span>${esc(stats.spiral_abyss ?? '-')}</span></div>
      <div class="stat-row"><span>Peti Terbuka</span><span>${esc(stats.way_point_number ?? '-')}</span></div>
      <p class="muted" style="margin-top:10px">Catatan: Mora tidak tersedia lewat API publik HoyoLab, jadi tidak bisa ditampilkan real-time di sini.</p>
    </div>
  `;

  wireImgFallback(el);
  document.getElementById('btn-checkin')?.addEventListener('click', doCheckin);
  document.getElementById('btn-redeem')?.addEventListener('click', doRedeem);
  // push.js mengisi kartu notifikasi + mulai polling resin kalau tersedia
  if (typeof window.renderPushCard === 'function') window.renderPushCard();
}

async function doCheckin() {
  const btn = document.getElementById('btn-checkin');
  btn.disabled = true; btn.textContent = 'Memproses...';
  try {
    await Api.doSignIn();
    toast('Check-in berhasil! 🎉');
    loadHome();
  } catch (e) {
    toast('Gagal check-in: ' + e.message);
    btn.disabled = false; btn.textContent = 'Check-in Sekarang';
  }
}

async function doRedeem() {
  const input = document.getElementById('redeem-input');
  const resultEl = document.getElementById('redeem-result');
  const btn = document.getElementById('btn-redeem');
  const code = input.value.trim().toUpperCase();

  if (!code) {
    resultEl.textContent = 'Masukkan kode dulu.';
    resultEl.className = 'error';
    return;
  }

  btn.disabled = true; btn.textContent = 'Memproses...';
  resultEl.textContent = ''; resultEl.className = 'muted';
  try {
    await Api.redeemCode(code);
    resultEl.textContent = `Kode "${code}" berhasil di-redeem! 🎉`;
    resultEl.className = 'muted';
    toast('Redeem berhasil! 🎉');
    input.value = '';
  } catch (e) {
    resultEl.textContent = `Gagal redeem "${code}": ${e.message}`;
    resultEl.className = 'error';
  } finally {
    btn.disabled = false; btn.textContent = 'Redeem';
  }
}

// ---------- Characters tab ----------
let charsLoaded = false;
async function loadCharacters(force = false) {
  const el = document.getElementById('tab-characters');
  if (charsLoaded && !force) return;
  el.innerHTML = '<div class="spinner">Memuat karakter...</div>';
  try {
    const data = await Api.getIndex();
    renderCharacterGrid(el, data.avatars || data.list || []);
    charsLoaded = true;
  } catch (e) {
    el.innerHTML = `<div class="card"><p class="error">Gagal memuat: ${esc(e.message)}</p></div>`;
  }
}

// API HoyoLab kadang balikin field gambar beda-beda tergantung endpoint (icon / image / side_icon / card_image).
// Coba semua kemungkinan biar avatar gak blank.
function charIcon(c) {
  return c.icon || c.image || c.side_icon || c.card_image || '';
}

function renderCharacterGrid(el, chars) {
  el.innerHTML = `<div class="char-grid">${chars.map((c) => `
    <div class="char-card" data-id="${esc(c.id)}">
      <img src="${esc(charIcon(c))}" loading="lazy" alt="${esc(c.name)}" data-fallback>
      <div class="name">${esc(c.name)}</div>
      <div class="lv">Lv.${esc(c.level)}</div>
      <div class="const">C${esc(c.actived_constellation_num ?? 0)}</div>
    </div>
  `).join('')}</div>`;

  wireImgFallback(el);
  el.querySelectorAll('.char-card').forEach((card) => {
    card.addEventListener('click', () => openCharacterDetail(Number(card.dataset.id)));
  });
}

async function openCharacterDetail(id) {
  const modal = document.getElementById('char-modal');
  const content = document.getElementById('char-modal-content');
  modal.classList.remove('hidden');
  content.innerHTML = '<div class="spinner">Memuat detail...</div>';
  try {
    const data = await Api.getCharacterDetail([id]);
    const c = (data.list || data.avatars || [])[0];
    renderCharacterDetail(content, c, data.property_map || {});
  } catch (e) {
    content.innerHTML = `<p class="error">Gagal memuat detail: ${esc(e.message)}</p>`;
  }
}

// HoyoLab API kadang balikin nilai stat di field yang beda (final / value / num),
// tergantung endpoint & versi. Coba semua kemungkinan biar gak muncul "undefined".
function statVal(s) {
  if (!s) return '-';
  const v = s.final ?? s.value ?? s.num ?? s.info?.value ?? s.info?.final;
  return v !== undefined && v !== null && v !== '' ? v : '-';
}

// Nama stat (HP%, CRIT DMG, dll) TIDAK selalu ikut nempel di tiap objek stat.
// Raw API cuma ngirim "property_type" (angka ID) dan naruh nama aslinya di object
// terpisah "property_map" (dikirim bareng characterDetail). Makanya sebelumnya selalu
// jatuh ke fallback teks generik "Main Stat"/"Sub Stat". Sekarang di-lookup ke situ dulu.
function statName(s, propertyMap, fallback) {
  if (!s) return fallback;
  const fromMap = propertyMap?.[s.property_type]?.name;
  return fromMap ?? s.info?.name ?? s.name ?? fallback;
}

function renderCharacterDetail(el, c, propertyMap) {
  if (!c) { el.innerHTML = '<p class="error">Data tidak ditemukan.</p>'; return; }
  const base = c.base || c;
  const weapon = c.weapon || {};
  const relics = c.relics || c.reliquaries || [];
  const stats = c.selected_properties || c.base_properties || [];
  el.innerHTML = `
    <div class="detail-header">
      <img src="${esc(charIcon(base))}" alt="${esc(base.name)}" data-fallback-hide>
      <div>
        <div class="name">${esc(base.name)}</div>
        <div class="muted">Lv.${esc(base.level)} · C${esc(base.actived_constellation_num ?? 0)}</div>
      </div>
    </div>

    <div class="section-label">Senjata</div>
    <div class="equip-item">
      <img src="${esc(weapon.icon ?? '')}" alt="" data-fallback-hide>
      <div>
        <div class="name">${esc(weapon.name ?? '-')}</div>
        <div class="sub">Lv.${esc(weapon.level ?? '-')} · R${esc(weapon.affix_level ?? '-')} · ★${esc(weapon.rarity ?? '-')}</div>
      </div>
    </div>

    <div class="section-label">Artefak</div>
    ${relics.length ? relics.map((r, i) => `
      <div class="equip-item-wrap">
        <div class="equip-item equip-clickable" data-relic-idx="${i}">
          <img src="${esc(r.icon ?? '')}" alt="" data-fallback-hide>
          <div style="flex:1">
            <div class="name">${esc(r.name ?? r.pos_name ?? '-')}</div>
            <div class="sub">+${esc(r.level ?? 0)} · ★${esc(r.rarity ?? '-')} · ${esc(r.set?.name ?? '')}</div>
          </div>
          <span class="chevron">▾</span>
        </div>
        <div class="relic-stats hidden" id="relic-stats-${i}">
          ${r.main_property ? `<div class="stat-row main-stat"><span>${esc(statName(r.main_property, propertyMap, 'Main Stat'))}</span><span>${esc(statVal(r.main_property))}</span></div>` : ''}
          ${(r.sub_property_list || []).map((s) => `<div class="stat-row sub-stat"><span>${esc(statName(s, propertyMap, 'Sub Stat'))}</span><span>${esc(statVal(s))}</span></div>`).join('')}
        </div>
      </div>
    `).join('') : '<p class="muted">Tidak ada data artefak.</p>'}

    <div class="section-label">Stat</div>
    <div class="stat-list">
      ${stats.length ? stats.map((s) => `<div class="stat-row"><span>${esc(statName(s, propertyMap, 'Stat'))}</span><span>${esc(statVal(s))}</span></div>`).join('')
        : '<p class="muted">Stat detail tidak tersedia dari API.</p>'}
    </div>
  `;

  // gambar gagal load di detail → sembunyikan saja (bukan placeholder)
  el.querySelectorAll('img[data-fallback-hide]').forEach((img) => {
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
  });

  el.querySelectorAll('.equip-clickable').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = row.dataset.relicIdx;
      const panel = document.getElementById(`relic-stats-${idx}`);
      const chevron = row.querySelector('.chevron');
      panel.classList.toggle('hidden');
      chevron.textContent = panel.classList.contains('hidden') ? '▾' : '▴';
    });
  });
}

document.getElementById('char-modal').addEventListener('click', (e) => {
  if (e.target.id === 'char-modal') e.target.classList.add('hidden');
});

boot();
