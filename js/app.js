// ---------- Utilities ----------
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
  if (Storage.cookie && Storage.roleId) {
    showApp();
  } else {
    showSetup();
  }
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
    const [note, index, signInfo] = await Promise.all([
      Api.getDailyNote(),
      Api.getIndex(),
      Api.getSignInfo().catch(() => null),
    ]);
    renderHome(el, note, index, signInfo);
  } catch (e) {
    el.innerHTML = `<div class="card"><p class="error">Gagal memuat: ${e.message}</p></div>`;
  }
}

function renderHome(el, note, index, signInfo) {
  const resinPct = Math.min(100, Math.round((note.current_resin / note.max_resin) * 100));
  const role = index.role || {};
  const stats = index.stats || {};

  const alreadySigned = signInfo && signInfo.is_sign;

  el.innerHTML = `
    <div class="card">
      <div class="row">
        <div class="card-title">Resin</div>
        <div class="muted">${fmtTime(note.resin_recovery_time)}</div>
      </div>
      <div class="big-stat">${note.current_resin} <span class="muted" style="font-size:16px">/ ${note.max_resin}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${resinPct}%"></div></div>
    </div>

    <div class="grid-2">
      <div class="mini-stat">
        <div class="label">Misi Harian</div>
        <div class="val">${note.finished_task_num}/${note.total_task_num}</div>
      </div>
      <div class="mini-stat">
        <div class="label">Ekspedisi</div>
        <div class="val">${note.current_expedition_num}/${note.max_expedition_num}</div>
      </div>
      <div class="mini-stat">
        <div class="label">Realm Currency</div>
        <div class="val">${note.current_home_coin ?? '-'}/${note.max_home_coin ?? '-'}</div>
      </div>
      <div class="mini-stat">
        <div class="label">AR / World Level</div>
        <div class="val">${role.level ?? '-'} / WL${stats.world_level ?? '-'}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Check-in Harian</div>
      <div class="row">
        <span>${alreadySigned ? '✅ Sudah check-in hari ini' : '⏳ Belum check-in hari ini'}</span>
      </div>
      <button class="btn-primary" id="btn-checkin" ${alreadySigned ? 'disabled' : ''}>
        ${alreadySigned ? 'Sudah Check-in' : 'Check-in Sekarang'}
      </button>
    </div>

    <div class="card">
      <div class="card-title">Ringkasan Akun</div>
      <div class="stat-row"><span>Nickname</span><span>${role.nickname ?? '-'}</span></div>
      <div class="stat-row"><span>Jumlah Karakter</span><span>${stats.avatar_number ?? '-'}</span></div>
      <div class="stat-row"><span>Achievement</span><span>${stats.achievement_number ?? '-'}</span></div>
      <div class="stat-row"><span>Spiral Abyss</span><span>${stats.spiral_abyss ?? '-'}</span></div>
      <div class="stat-row"><span>Peti Terbuka</span><span>${stats.way_point_number ?? '-'}</span></div>
      <p class="muted" style="margin-top:10px">Catatan: Mora tidak tersedia lewat API publik HoyoLab, jadi tidak bisa ditampilkan real-time di sini.</p>
    </div>
  `;

  document.getElementById('btn-checkin')?.addEventListener('click', doCheckin);
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

// ---------- Characters tab ----------
let charsLoaded = false;
async function loadCharacters(force = false) {
  const el = document.getElementById('tab-characters');
  if (charsLoaded && !force) return;
  el.innerHTML = '<div class="spinner">Memuat karakter...</div>';
  try {
    const data = await Api.getCharacters();
    renderCharacterGrid(el, data.avatars || data.list || []);
    charsLoaded = true;
  } catch (e) {
    el.innerHTML = `<div class="card"><p class="error">Gagal memuat: ${e.message}</p></div>`;
  }
}

function renderCharacterGrid(el, chars) {
  el.innerHTML = `<div class="char-grid">${chars.map((c) => `
    <div class="char-card" data-id="${c.id}">
      <img src="${c.icon}" loading="lazy" alt="${c.name}">
      <div class="name">${c.name}</div>
      <div class="lv">Lv.${c.level}</div>
      <div class="const">C${c.actived_constellation_num ?? 0}</div>
    </div>
  `).join('')}</div>`;

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
    renderCharacterDetail(content, c);
  } catch (e) {
    content.innerHTML = `<p class="error">Gagal memuat detail: ${e.message}</p>`;
  }
}

function renderCharacterDetail(el, c) {
  if (!c) { el.innerHTML = '<p class="error">Data tidak ditemukan.</p>'; return; }
  const base = c.base || c;
  const weapon = c.weapon || {};
  const relics = c.relics || c.reliquaries || [];
  const stats = c.selected_properties || c.base_properties || [];
  el.innerHTML = `
    <div class="detail-header">
      <img src="${base.icon}" alt="${base.name}">
      <div>
        <div class="name">${base.name}</div>
        <div class="muted">Lv.${base.level} · C${base.actived_constellation_num ?? 0}</div>
      </div>
    </div>

    <div class="section-label">Senjata</div>
    <div class="equip-item">
      <img src="${weapon.icon ?? ''}" alt="">
      <div>
        <div class="name">${weapon.name ?? '-'}</div>
        <div class="sub">Lv.${weapon.level ?? '-'} · R${weapon.affix_level ?? '-'} · ★${weapon.rarity ?? '-'}</div>
      </div>
    </div>

    <div class="section-label">Artefak</div>
    ${relics.length ? relics.map((r, i) => `
      <div class="equip-item-wrap">
        <div class="equip-item equip-clickable" data-relic-idx="${i}">
          <img src="${r.icon ?? ''}" alt="">
          <div style="flex:1">
            <div class="name">${r.name ?? r.pos_name ?? '-'}</div>
            <div class="sub">+${r.level ?? 0} · ★${r.rarity ?? '-'} · ${r.set?.name ?? ''}</div>
          </div>
          <span class="chevron">▾</span>
        </div>
        <div class="relic-stats hidden" id="relic-stats-${i}">
          ${r.main_property ? `<div class="stat-row main-stat"><span>${r.main_property.info?.name ?? 'Main Stat'}</span><span>${r.main_property.final}</span></div>` : ''}
          ${(r.sub_property_list || []).map((s) => `<div class="stat-row sub-stat"><span>${s.info?.name ?? 'Sub Stat'}</span><span>${s.final}</span></div>`).join('')}
        </div>
      </div>
    `).join('') : '<p class="muted">Tidak ada data artefak.</p>'}

    <div class="section-label">Stat</div>
    <div class="stat-list">
      ${stats.length ? stats.map((s) => `<div class="stat-row"><span>${s.info?.name ?? 'Stat'}</span><span>${s.final}</span></div>`).join('')
        : '<p class="muted">Stat detail tidak tersedia dari API.</p>'}
    </div>
  `;

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
