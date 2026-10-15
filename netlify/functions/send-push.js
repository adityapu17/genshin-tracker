// POST /.netlify/functions/send-push
// Trigger manual push ke semua subscription tersimpan (uji dev / admin).
// Menggunakan library web-push + VAPID key dari env var (JANGAN hardcode).
const webpush = (() => { try { return require("web-push"); } catch { return null; } })();
const { getStore } = require("@netlify/blobs");

const SITE_ID = "710a0832-00e6-424d-b61e-8addac859f2a";
// Mode auto (kalau toggle Blobs site sudah aktif -> NETLIFY_BLOBS_CONTEXT di-inject platform).
function blobsStore() {
  if (process.env.NETLIFY_BLOBS_CONTEXT) return getStore("genshin-push");
  return getStore({ name: "genshin-push", siteID: SITE_ID, token: process.env.NETLIFY_FUNCTIONS_TOKEN, context: "production" });
}

async function listSubs() {
  try {
    const d = await blobsStore().getJSON("subscriptions");
    return Array.isArray(d) ? d : [];
  } catch (e) {
    console.error("subscriptions read error:", e && e.message);
    return null; // null = storage gagal; bedakan dari array kosong
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function main(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "POST only." }) };

  // otentikasi admin via env var (constant-time compare sederhana)
  const wanted = (process.env.PUSH_ADMIN_KEY || "").trim();
  const got = (event.headers["x-admin-key"] || event.headers["X-Admin-Key"] || "");
  let ok = false;
  if (wanted && got && Buffer.byteLength(wanted) === Buffer.byteLength(got)) {
    ok = true;
    for (let i = 0; i < wanted.length; i++) ok = ok && (wanted.charCodeAt(i) === got.charCodeAt(i));
  }
  if (!ok) return { statusCode: 401, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Unauthorized." }) };

  if (!webpush) return { statusCode: 501, headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify({ error: "web-push belum terpasang di server." }) };

  const pub = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const mail = (process.env.VAPID_MAILTO || "mailto:admin@gt");
  if (!pub || !priv) {
    return { statusCode: 501, headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY belum di-set di env var Netlify." }) };
  }

  webpush.setVapidDetails(mail, pub, priv);
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
  const title = String(body.title || "Genshin Tracker").slice(0, 80);
  const payloadBody = String(body.body || "").slice(0, 200);
  const icon = body.icon || "/icons/icon-192.png";
  const payload = JSON.stringify({ title, body: payloadBody, icon });

  const subs = await listSubs();
  if (subs === null) {
    return { statusCode: 503, headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Penyimpanan server belum siap (Netlify Blobs aktifkan dulu di Site configuration → Blobs)." }) };
  }
  const results = { total: subs.length, ok: 0, fail: 0, errors: [] };
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 });
      results.ok += 1;
    } catch (e) {
      results.fail += 1;
      // jangan pernah log endpoint/subscription lengkap (Catatan @security-auditor)
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        results.expired = (results.expired || 0) + 1;
      }
      results.errors.push({ err: String((e && e.message) || e).slice(0, 120) });
    }
  }
  return { statusCode: 200, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(results) };
}

exports.handler = async (event) => {
  try {
    return await main(event);
  } catch (e) {
    // Jangan pernah bocorkan stack trace / internal ke klien.
    console.error("send-push error:", e && e.message);
    return { statusCode: 500, headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Terjadi kesalahan internal." }) };
  }
};
