const Storage = {
  get cookie() { return localStorage.getItem('gt_cookie') || ''; },
  set cookie(v) { localStorage.setItem('gt_cookie', v); },
  get roleId() { return localStorage.getItem('gt_role_id') || ''; },
  set roleId(v) { localStorage.setItem('gt_role_id', v); },
  get server() { return localStorage.getItem('gt_server') || 'os_asia'; },
  set server(v) { localStorage.setItem('gt_server', v); },
  clear() { localStorage.removeItem('gt_cookie'); localStorage.removeItem('gt_role_id'); localStorage.removeItem('gt_server'); },
};

// Pakai Cloudflare Pages Function di domain yang sama (same-origin), jadi nggak butuh CORS
// dan nggak gantung ke Worker eksternal. Kode: functions/api/proxy.js
const PROXY_URL = '/api/proxy';

async function callProxy(action, extra = {}) {
  const params = new URLSearchParams({ action, role_id: Storage.roleId, server: Storage.server, ...extra });
  const resp = await fetch(`${PROXY_URL}?${params.toString()}`, {
    headers: { 'x-cookie': Storage.cookie },
  });
  const json = await resp.json();
    if (json.retcode !== undefined && json.retcode !== 0) {
    const detail = json.message && json.message.trim() ? json.message : JSON.stringify(json);
    throw new Error(`${detail} (retcode ${json.retcode})`);
  }
  if (json.error) throw new Error(json.error);
  return json.data !== undefined ? json.data : json;
}

// Cache ringan 60 detik untuk index (dipakai Home, Endgame, Farming, Karakter) supaya nggak spam HoyoLab.
let _indexCache = { at: 0, data: null, promise: null };
function getIndexCached() {
  const now = Date.now();
  if (_indexCache.data && now - _indexCache.at < 60000) return Promise.resolve(_indexCache.data);
  if (_indexCache.promise) return _indexCache.promise;
  _indexCache.promise = callProxy('index')
    .then((d) => { _indexCache = { at: Date.now(), data: d, promise: null }; return d; })
    .catch((e) => { _indexCache.promise = null; throw e; });
  return _indexCache.promise;
}

function resetIndexCache() { _indexCache = { at: 0, data: null, promise: null }; resetDetailCache(); }

// Cache detail karakter (senjata, artefak, stat). Dipakai tab Farming (material senjata) dan modal detail
// karakter. Daftar karakter dari endpoint "index" TIDAK membawa data senjata, jadi senjata harus diambil dari
// character/detail. Dikirim per 20 ID supaya request tetap kecil.
const DETAIL_TTL_MS = 10 * 60 * 1000;
let _detail = { at: 0, map: {}, props: {} };
function resetDetailCache() { _detail = { at: 0, map: {}, props: {} }; }

async function ensureDetails(ids) {
  if (Date.now() - _detail.at > DETAIL_TTL_MS) resetDetailCache();
  const need = [...new Set(ids)].filter((id) => !_detail.map[id]);
  for (let i = 0; i < need.length; i += 20) {
    const chunk = need.slice(i, i + 20);
    const data = await callProxy('characterDetail', { character_ids: JSON.stringify(chunk) });
    const list = data.list || data.avatars || [];
    Object.assign(_detail.props, data.property_map || {});
    list.forEach((c) => {
      const id = (c.base || c).id;
      if (id !== undefined) _detail.map[id] = c;
    });
    // satu ID diminta, satu data balik: pakai itu walau tipe ID-nya beda (string/angka)
    if (chunk.length === 1 && list.length === 1 && !_detail.map[chunk[0]]) _detail.map[chunk[0]] = list[0];
    _detail.at = Date.now();
  }
  return _detail;
}

// Senjata per karakter: {idKarakter: weapon}. Pakai data index kalau sudah ada, sisanya dari detail.
async function getAvatarWeapons(avatars) {
  const out = {};
  const missing = [];
  for (const a of avatars) {
    if (a.weapon && a.weapon.id !== undefined) out[a.id] = a.weapon;
    else missing.push(a.id);
  }
  if (missing.length) {
    const d = await ensureDetails(missing);
    for (const id of missing) {
      const w = d.map[id] && d.map[id].weapon;
      if (w && w.id !== undefined) out[id] = w;
    }
  }
  return out;
}

const Api = {
  getIndex: () => callProxy('index'),
  getIndexCached,
  detectRoles: () => callProxy('gameRoles'),
  getSpiralAbyss: (previous = false) => callProxy('spiralAbyss', { schedule_type: previous ? '2' : '1' }),
  getDiary: (month = 0) => callProxy('diary', { month: String(month) }),
  getDailyNote: () => callProxy('dailynote'),
  getCharacters: () => callProxy('characters'),
  getCharacterDetail: (ids) => callProxy('characterDetail', { character_ids: JSON.stringify(ids) }),
  getDetails: ensureDetails,
  getWeapons: getAvatarWeapons,
  getSignInfo: () => callProxy('signInfo'),
  getSignHome: () => callProxy('signHome'),
  doSignIn: () => callProxy('signDo'),
  redeemCode: (code) => callProxy('redeemCode', { cdkey: code }),
};
