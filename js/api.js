const Storage = {
  get cookie() { return localStorage.getItem('gt_cookie') || ''; },
  set cookie(v) { localStorage.setItem('gt_cookie', v); },
  get roleId() { return localStorage.getItem('gt_role_id') || ''; },
  set roleId(v) { localStorage.setItem('gt_role_id', v); },
  get server() { return localStorage.getItem('gt_server') || 'os_asia'; },
  set server(v) { localStorage.setItem('gt_server', v); },
  clear() { localStorage.removeItem('gt_cookie'); localStorage.removeItem('gt_role_id'); localStorage.removeItem('gt_server'); },
};

async function callProxy(action, extra = {}) {
  const params = new URLSearchParams({ action, role_id: Storage.roleId, server: Storage.server, ...extra });
  const resp = await fetch(`/.netlify/functions/proxy?${params.toString()}`, {
    headers: { 'x-cookie': Storage.cookie },
  });
  const json = await resp.json();
  if (json.retcode !== undefined && json.retcode !== 0) {
    throw new Error(json.message || 'HoyoLab API error');
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
};
