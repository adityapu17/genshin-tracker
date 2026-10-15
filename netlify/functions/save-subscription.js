// POST /.netlify/functions/save-subscription
// Menerima subscription push (JSON) dari klien, memvalidasi, rate-limit per-IP,
// dan menyimpan ke Netlify Blobs (persisten antar-invokasi). API: @netlify/blobs v11 (getStore).
const { getStore } = require("@netlify/blobs");
const MAX_BYTES = 1024;
const RL_WINDOW_MS = 60_000;
const RL_MAX = 5;

const SITE_ID = "710a0832-00e6-424d-b61e-8addac859f2a";
// Legacy V1 (Lambda-compat) handler: platform tidak men-inject token blob otomatis,
// jadi pakai token situs dikonfigurasi lewat env secret NETLIFY_BLOBS_TOKEN (scope blobs:write).
// Jika tidak tersedia, falls back ke konteks otomatis (hanya berfungsi bila fitur Blobs aktif).
function blobsStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (token) return getStore({ name: "genshin-push", siteID: SITE_ID, token });
  return getStore("genshin-push");
}

// Whitelist domain push service yang dikenal (Catatan @security-auditor #2).
const ALLOWED_ENDPOINTS = /^https:\/\/(fcm\.googleapis\.com\/fcm\/send\/|android\.googleapis\.com\/gcm\/send\/|fcm\.batch\.com\/|([a-z0-9-]+\.)?notify\.windows\.com\/|wns\.windows\.com\/|([a-z0-9-]+\.)?push\.services\.mozilla\.com\/|web\.push\.apple\.com\/)/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getSubscriptions() {
  try {
    const d = await blobsStore().get("subscriptions", { type: "json" });
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

// Baca store rate-limit dan bersihkan entri kadaluarsa (Catatan @security-auditor #1).
async function loadRateLimit() {
  let s;
  try {
    s = await blobsStore().get("ratelimit", { type: "json" });
  } catch {
    s = null;
  }
  if (!s || typeof s !== "object") s = {};
  const now = Date.now();
  for (const k of Object.keys(s)) {
    if (!s[k] || typeof s[k].t !== "number" || now - s[k].t >= RL_WINDOW_MS) delete s[k];
  }
  return s;
}

function rateLimited(ip, rl) {
  const now = Date.now();
  const entry = rl[ip];
  if (entry && now - entry.t < RL_WINDOW_MS) {
    if (entry.n >= RL_MAX) return true;
    entry.n += 1;
    return false;
  }
  rl[ip] = { t: now, n: 1 };
  return false;
}

async function main(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method tidak didukung." }) };

  const ctype = (event.headers["content-type"] || event.headers["Content-Type"] || "");
  if (!ctype.toLowerCase().startsWith("application/json")) {
    return { statusCode: 415, headers: cors, body: JSON.stringify({ error: "Content-Type harus application/json." }) };
  }

  // Validasi murni (tanpa storage) didahulukan supaya error input tetap tampil
  // walau blob store belum aktif; storage baru disentuh setelah payload sah.
  const raw = event.body || "";
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ error: "Payload melebihi 1 KB." }) };
  }

  let sub;
  try { sub = JSON.parse(raw); } catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Body bukan JSON yang valid." }) }; }

  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Schema subscription tidak valid: butuh endpoint + keys.p256dh + keys.auth." }) };
  }
  if (!ALLOWED_ENDPOINTS.test(endpoint)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Endpoint bukan layanan push yang dikenal." }) };
  }
  if (!/^[A-Za-z0-9\-_=]+$/.test(p256dh) || !/^[A-Za-z0-9\-_]+$/.test(auth)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "keys harus base64url." }) };
  }

  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const rl = await loadRateLimit();
  const limited = rateLimited(ip, rl);
  await blobsStore().setJSON("ratelimit", rl);
  if (limited) {
    return { statusCode: 429, headers: cors, body: JSON.stringify({ error: "Terlalu banyak permintaan (max 5/menit/IP)." }) };
  }

  const all = await getSubscriptions();
  const i = all.findIndex((s) => s.endpoint === endpoint);
  if (i >= 0) all[i] = sub; else all.push(sub);
  await blobsStore().setJSON("subscriptions", all);

  return { statusCode: 201, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, count: all.length }) };
}

exports.handler = async (event) => {
  try {
    return await main(event);
  } catch (e) {
    // Jangan pernah bocorkan stack trace / internal ke klien (Catatan @security-auditor).
    console.error("save-subscription error:", e && e.message);
    return { statusCode: 503, headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Penyimpanan server belum siap (Netlify Blobs aktifkan dulu di Site configuration → Blobs)." }) };
  }
};
