// POST /.netlify/functions/save-subscription
// Menerima subscription push (JSON) dari klien, memvalidasi, rate-limit per-IP,
// dan menyimpan ke Netlify Blobs (persisten antar-invokasi).
const { getBlob, setBlob } = require("@netlify/blobs");
const MAX_BYTES = 1024;
const RL_WINDOW_MS = 60_000;
const RL_MAX = 5;

async function getSubscriptions() {
  try {
    const data = await getBlob('subscriptions.json');
    return data ? JSON.parse(data.toString()) : [];
  } catch {
    return [];
  }
}

async function setSubscriptions(arr) {
  await setBlob('subscriptions.json', JSON.stringify(arr));
}

async function getRateLimitStore() {
  try {
    const data = await getBlob('ratelimit.json');
    return data ? JSON.parse(data.toString()) : {};
  } catch {
    return {};
  }
}

async function setRateLimitStore(store) {
  await setBlob('ratelimit.json', JSON.stringify(store));
}

function rateLimited(ip, store) {
  const now = Date.now();
  const entry = store[ip];
  if (entry && now - entry.t < RL_WINDOW_MS) {
    if (entry.n >= RL_MAX) return true;
    entry.n += 1;
    return false;
  } else {
    store[ip] = { t: now, n: 1 };
    return false;
  }
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method tidak didukung.' }) };

  const ctype = (event.headers['content-type'] || event.headers['Content-Type'] || '');
  if (!ctype.toLowerCase().startsWith('application/json')) {
    return { statusCode: 415, headers: cors, body: JSON.stringify({ error: 'Content-Type harus application/json.' }) };
  }

  const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  // Rate limit using blob store
  const rlStore = await getRateLimitStore();
  if (rateLimited(ip, rlStore)) {
    await setRateLimitStore(rlStore); // update store (though we already mutated)
    return { statusCode: 429, headers: cors, body: JSON.stringify({ error: 'Terlalu banyak permintaan (max 5/menit/IP).' }) };
  }
  await setRateLimitStore(rlStore); // persist updates

  const raw = event.body || '';
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ error: 'Payload melebihi 1 KB.' }) };
  }

  let sub;
  try { sub = JSON.parse(raw); } catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Body bukan JSON yang valid.' }) }; }

  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Schema subscription tidak valid: butuh endpoint + keys.p256dh + keys.auth.' }) };
  }
  if (!/^https:\/\/(android|web|ios)\.google\.com\/send\/|^https:\/\/fcm\.batch\.com\/|^https:\/\/wns\.windows\.com\/|^https:\/\/exp\.dot\.net\/|^https:\/\/.+/.test(endpoint)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Endpoint tidak dikenal.' }) };
  }
  if (!/^[A-Za-z0-9\-_=]*$/.test(p256dh) || !/^[A-Za-z0-9\-_]+$/.test(auth)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'keys.harus base64url.' }) };
  }

  const all = await getSubscriptions();
  const i = all.findIndex((s) => s.endpoint === endpoint);
  if (i >= 0) all[i] = sub; else all.push(sub);
  await setSubscriptions(all);

  return { statusCode: 201, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, count: all.length }) };
};
