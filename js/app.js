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
  startTicker();
  loadHome();
}

document.getElementById('btn-connect').addEventListener('click', async () => {
  const server = document.getElementById('setup-server').value;
  const uid = document.getElementById('setup-uid').value.trim();
  const cookie = document.getElementById('setup-cookie').value.trim();
  const errEl = document.getElementById('setup-error');
  errEl.classList.add('hidden');

  if (!cookie) {
    errEl.textContent = 'Cookie wajib diisi.';
    errEl.classList.remove('hidden');
    return;
  }
  Storage.server = server; Storage.roleId = uid; Storage.cookie = cookie;
  resetIndexCache();

  const btn = document.getElementById('btn-connect');
  btn.disabled = true; btn.textContent = 'Menghubungkan...';
  try {
    if (!uid) {
      // UID kosong -> deteksi otomatis dari cookie
      btn.textContent = 'Mendeteksi UID...';
      const det = await Api.detectRoles();
      const roles = (det && det.roles) || [];
      const pick = roles.find((r) => r.region === server) || roles[0];
      if (!pick) throw new Error('Akun Genshin tidak ditemukan di cookie ini. Isi UID manual.');
      Storage.roleId = pick.uid;
      if (SERVER_OFFSET_H[pick.region] !== undefined) Storage.server = pick.region;
      document.getElementById('setup-uid').value = pick.uid;
      document.getElementById('setup-server').value = Storage.server;
      btn.textContent = 'Menghubungkan...';
    }
    await Api.getIndexCached(); // test call (hasilnya dipakai ulang oleh Home)
    showApp();
  } catch (e) {
    errEl.textContent = 'Gagal konek: ' + e.message + (uid ? '. Cek lagi cookie & UID kamu.' : '');
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
    resetIndexCache();
    charsLoaded = false;
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
    if (btn.dataset.tab === 'endgame') loadEndgame();
    if (btn.dataset.tab === 'farming') loadFarming();
  });
});

// ---------- Home tab ----------
async function loadHome() {
  const el = document.getElementById('tab-home');
  el.innerHTML = '<div class="spinner">Memuat data...</div>';
  try {
    const [note, index, signInfo, signHome] = await Promise.all([
      Api.getDailyNote(),
      Api.getIndexCached(),
      Api.getSignInfo().catch(() => null),
      Api.getSignHome().catch(() => null),
    ]);
    renderHome(el, note, index, signInfo, signHome);
  } catch (e) {
    el.innerHTML = `<div class="card"><p class="error">Gagal memuat: ${esc(e.message)}</p></div>`;
  }
}

// Tombol "To Teyvat": buka game Genshin Impact (versi global) lewat Android intent.
// Kalau game belum terpasang, Chrome membuka halaman Play Store (browser_fallback_url).
// iOS/desktop tidak punya cara resmi untuk membuka game dari web, jadi cuma kasih info.
const GENSHIN_PKG = 'com.miHoYo.GenshinImpact';
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${GENSHIN_PKG}`;
function genshinLaunchUrl() {
  const fallback = encodeURIComponent(PLAY_STORE_URL);
  return `intent://#Intent;package=${GENSHIN_PKG};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;S.browser_fallback_url=${fallback};end`;
}
function playGenshin() {
  // Di APK Genshin Tracker (WebView) ada jembatan native yang bisa membuka game langsung.
  if (window.AndroidApp && typeof window.AndroidApp.openGame === 'function') {
    if (!window.AndroidApp.openGame()) {
      toast('Genshin Impact belum terpasang. Membuka Play Store...');
      setTimeout(() => { location.href = PLAY_STORE_URL; }, 900);
    }
    return;
  }
  if (!/android/i.test(navigator.userAgent)) { toast('Tombol ini cuma bisa buka game di HP Android.'); return; }
  location.href = genshinLaunchUrl();
}

function renderHome(el, note, index, signInfo, signHome) {
  const fetchedAt = Date.now();
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
    <button class="btn-play" id="btn-play">🌍 To Teyvat</button>
    <div class="card">
      <div class="row">
        <div class="card-title">Resin</div>
        <div>${resinCountdownHtml(note, fetchedAt)}</div>
      </div>
      <div class="big-stat"><b data-count="${esc(note.current_resin)}">${esc(note.current_resin)}</b> <span class="muted" style="font-size:16px">/ ${esc(note.max_resin)}</span></div>
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

    ${renderTimersCard(note, fetchedAt)}

    <div id="reset-card"></div>

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

    <div id="diary-card"></div>

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
      <p class="muted" style="margin-top:10px">Catatan: jumlah Mora yang kamu punya tidak tersedia lewat API HoyoLab. Pemasukan Mora per bulan ada di kartu Traveler's Diary.</p>
    </div>
  `;

  wireImgFallback(el);
  animateCounts(el);
  document.getElementById('btn-play').addEventListener('click', playGenshin);
  document.getElementById('btn-checkin')?.addEventListener('click', doCheckin);
  document.getElementById('btn-redeem')?.addEventListener('click', doRedeem);

  // Kartu async (jadwal reset & Traveler's Diary) diisi setelah halaman tampil
  renderResetCard().then((h) => { const t = document.getElementById('reset-card'); if (t) t.innerHTML = h; });
  loadDiaryCard(document.getElementById('diary-card'));
}

async function doCheckin() {
  const btn = document.getElementById('btn-checkin');
  btn.disabled = true; btn.textContent = 'Memproses...';
  try {
    await Api.doSignIn();
    toast('Check-in berhasil! 🎉');
    burst(btn);
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
    burst(btn);
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
    const data = await Api.getIndexCached();
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
  el.innerHTML = `<div class="char-grid">${chars.map((c, i) => `
    <div class="char-card" data-id="${esc(c.id)}" style="--i:${Math.min(i, 14)}">
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

// Modal detail karakter ikut riwayat browser: gesture/tombol back menutup modal (balik ke daftar karakter)
// dan tidak keluar dari app.
const charModal = document.getElementById('char-modal');
let modalPushed = false;
function showCharModal() {
  charModal.classList.remove('hidden');
  if (!modalPushed) { history.pushState({ charModal: 1 }, ''); modalPushed = true; }
}
function closeCharModal() {
  if (modalPushed) history.back(); // popstate di bawah yang menyembunyikan modal
  else charModal.classList.add('hidden');
}
window.addEventListener('popstate', () => { modalPushed = false; charModal.classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !charModal.classList.contains('hidden')) closeCharModal(); });

async function openCharacterDetail(id) {
  const modal = charModal;
  const content = document.getElementById('char-modal-content');
  showCharModal();
  content.className = 'modal-content';
  content.innerHTML = '<div class="spinner">Memuat detail...</div>';
  try {
    // Dari cache kalau sudah pernah diambil (mis. lewat tab Farming), jadi terbuka instan
    const d = await Api.getDetails([id]);
    const c = d.map[id];
    let fromIndex = null;
    try { fromIndex = ((await Api.getIndexCached()).avatars || []).find((a) => a.id === id) || null; } catch (e) { /* element cadangan saja */ }
    renderCharacterDetail(content, c, d.props || {}, fromIndex);
  } catch (e) {
    content.className = 'modal-content';
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

function renderCharacterDetail(el, c, propertyMap, fromIndex) {
  if (!c) { el.className = 'modal-content'; el.innerHTML = '<p class="error">Data tidak ditemukan.</p>'; return; }
  const base = c.base || c;
  const elemKey = normElement(base.element) || normElement(fromIndex && fromIndex.element);
  const elemInfo = elemKey ? ELEMENTS[elemKey] : null;
  el.className = `modal-content has-detail${elemKey ? ` has-el el-${elemKey}` : ''}`;
  // Gambar besar (base.image) seperti di HoyoLab; avatar kecil jadi cadangan kalau tidak ada / gagal dimuat
  const icon = charIcon(base);
  const art = [base.image, base.card_image, fromIndex && fromIndex.image, fromIndex && fromIndex.card_image]
    .find((u) => typeof u === 'string' && u && u !== base.icon) || '';
  const weapon = c.weapon || {};
  const relics = c.relics || c.reliquaries || [];
  const stats = c.selected_properties || c.base_properties || [];
  const cvs = relics.map((r) => relicCV(r, propertyMap));
  const totalCV = Math.round(cvs.reduce((a, b) => a + b, 0) * 10) / 10;
  el.innerHTML = `${elementFxHtml(elemKey)}<button class="detail-close" id="detail-close" aria-label="Tutup">✕</button><div class="detail-scroll">
    <div class="detail-hero${art ? ' with-art' : ''}">
      ${art ? `<div class="art-wrap"><img class="detail-art" src="${esc(art)}" alt="${esc(base.name)}" id="detail-art"></div>` : ''}
      <div class="detail-header">
      <div class="avatar-wrap"><img src="${esc(icon)}" alt="${esc(base.name)}" data-fallback-hide></div>
      <div>
        <div class="name">${esc(base.name)}</div>
        <div class="muted">Lv.${esc(base.level)} · C${esc(base.actived_constellation_num ?? 0)}</div>
        ${elemInfo ? `<span class="el-chip">${elemInfo.icon} ${esc(elemInfo.label)}</span>` : ''}
      </div>
    </div></div>

    <div class="section-label">Senjata</div>
    <div class="equip-item">
      <img src="${esc(weapon.icon ?? '')}" alt="" data-fallback-hide>
      <div>
        <div class="name">${esc(weapon.name ?? '-')}</div>
        <div class="sub">Lv.${esc(weapon.level ?? '-')} · R${esc(weapon.affix_level ?? '-')} · ★${esc(weapon.rarity ?? '-')}</div>
      </div>
    </div>

    <div class="section-label">Artefak${relics.length ? ` · CV total <span class="cv ${cvClass(totalCV / Math.max(relics.length, 1))}">${esc(totalCV)}</span>` : ''}</div>
    ${relics.length ? relics.map((r, i) => `
      <div class="equip-item-wrap">
        <div class="equip-item equip-clickable" data-relic-idx="${i}">
          <img src="${esc(r.icon ?? '')}" alt="" data-fallback-hide>
          <div style="flex:1">
            <div class="name">${esc(r.name ?? r.pos_name ?? '-')}</div>
            <div class="sub">+${esc(r.level ?? 0)} · ★${esc(r.rarity ?? '-')} · ${esc(r.set?.name ?? '')} · <span class="cv ${cvClass(cvs[i])}">CV ${esc(cvs[i])}</span></div>
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
  </div>`;

  startElementFx(el.querySelector('.fx-layer'));
  document.getElementById('detail-close').addEventListener('click', closeCharModal);
  const artImg = document.getElementById('detail-art');
  if (artImg) artImg.addEventListener('error', () => el.querySelector('.detail-hero').classList.add('art-failed'), { once: true });

  // gambar gagal load di detail → sembunyikan saja (bukan placeholder)
  el.querySelectorAll('img[data-fallback-hide]').forEach((img) => {
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
  });

  el.querySelectorAll('.equip-clickable').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = row.dataset.relicIdx;
      const panel = document.getElementById(`relic-stats-${idx}`);
      panel.classList.toggle('hidden');
      row.classList.toggle('open', !panel.classList.contains('hidden'));
    });
  });
}

charModal.addEventListener('click', (e) => {
  if (e.target.id === 'char-modal') closeCharModal();
});

boot();
