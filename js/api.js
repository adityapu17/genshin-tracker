const Storage = {
  get cookie() { return localStorage.getItem('gt_cookie') || ''; },
  set cookie(v) { localStorage.setItem('gt_cookie', v); },
  get roleId() { return localStorage.getItem('gt_role_id') || ''; },
  set roleId(v) { localStorage.setItem('gt_role_id', v); },
  get server() { return localStorage.getItem('gt_server') || 'os_asia'; },
  set server(v) { localStorage.setItem('gt_server', v); },
  clear() { localStorage.removeItem('gt_cookie'); localStorage.removeItem('gt_role_id'); localStorage.removeItem('gt_server'); },
};

// Pakai Netlify Function di domain yang sama (same-origin), jadi nggak butuh CORS
// dan nggak gantung ke Cloudflare Worker eksternal (hoyoassist.gabel.workers.dev).
const PROXY_URL = '/.netlify/functions/proxy';

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

const Api = {
  getIndex: () => callProxy('index'),
  getDailyNote: () => callProxy('dailynote'),
  getCharacters: () => callProxy('characters'),
  getCharacterDetail: (ids) => callProxy('characterDetail', { character_ids: JSON.stringify(ids) }),
  getSignInfo: () => callProxy('signInfo'),
  getSignHome: () => callProxy('signHome'),
  doSignIn: () => callProxy('signDo'),
  redeemCode: (code) => callProxy('redeemCode', { cdkey: code }),
};
