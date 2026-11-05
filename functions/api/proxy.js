// Cloudflare Pages Function: proxy ke HoyoLab API (pengganti netlify/functions/proxy.js).
// Route: /api/proxy
// Cookie DIKIRIM oleh client di header "x-cookie" per-request, TIDAK pernah disimpan di server ini.
// Fungsi ini cuma nerusin request supaya browser nggak kena blokir CORS.

const BASE_RECORD = 'https://bbs-api-os.hoyolab.com/game_record/genshin/api';
const BASE_SIGN = 'https://sg-hk4e-api.hoyolab.com/event/sol';
const ACT_ID = 'e202102251931481'; // act_id daily check-in Genshin (Global/OS), stabil dari 2021

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-cookie',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function buildHeaders() {
  return {
    'x-rpc-app_version': '2.71.1',
    'x-rpc-client_type': '5',
    'x-rpc-language': 'id-id',
    'x-rpc-device_id': crypto.randomUUID(),
    'x-rpc-platform': 'ios',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120 Mobile Safari/537.36 miHoYoBBS/2.71.1',
    'Content-Type': 'application/json',
    'Origin': 'https://act.hoyolab.com',
    'Referer': 'https://act.hoyolab.com/',
  };
}

function json(status, obj, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  });
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const cookie = request.headers.get('x-cookie');
    const sp = new URL(request.url).searchParams;
    const params = Object.fromEntries(sp.entries());
    const action = params.action;

    if (!cookie) return json(400, { error: 'Cookie belum diisi.' });

    const headers = { ...buildHeaders(), Cookie: cookie };
    let url, method = 'GET', body;

    switch (action) {
      case 'index': // profil ringkas (level AR, achievement, spiral abyss dsb)
        url = `${BASE_RECORD}/index?role_id=${params.role_id}&server=${params.server}`;
        break;
      case 'dailynote': // resin, misi harian, teapot, ekspedisi, transformer real-time
        url = `${BASE_RECORD}/dailyNote?role_id=${params.role_id}&server=${params.server}`;
        break;
      case 'characters': // daftar semua karakter (ringkas)
        url = `${BASE_RECORD}/character?role_id=${params.role_id}&server=${params.server}`;
        method = 'POST';
        body = JSON.stringify({ role_id: params.role_id, server: params.server });
        break;
      case 'characterDetail': // detail per karakter: artefak, senjata, konstelasi, stat
        url = `${BASE_RECORD}/character/detail`;
        method = 'POST';
        body = JSON.stringify({
          role_id: params.role_id,
          server: params.server,
          character_ids: JSON.parse(params.character_ids || '[]'),
        });
        break;
      case 'signInfo': // status check-in hari ini (sudah/belum, total hari)
        url = `${BASE_SIGN}/info?act_id=${ACT_ID}&region=${params.server}&uid=${params.role_id}`;
        break;
      case 'signHome': // reward kalender check-in bulan ini
        url = `${BASE_SIGN}/home?act_id=${ACT_ID}&region=${params.server}&uid=${params.role_id}`;
        break;
      case 'signDo': // eksekusi check-in harian
        url = `${BASE_SIGN}/sign`;
        method = 'POST';
        body = JSON.stringify({ act_id: ACT_ID, region: params.server, uid: params.role_id });
        break;
      case 'redeemCode': { // redeem kode giveaway (primogem code dsb)
        if (!params.cdkey) return json(400, { error: 'Kode belum diisi.' });
        const q = new URLSearchParams({
          uid: params.role_id,
          region: params.server,
          lang: 'en',
          cdkey: params.cdkey,
          game_biz: 'hk4e_global',
        });
        url = `https://sg-hk4e-api.hoyoverse.com/common/apicdkey/api/webExchangeCdkey?${q.toString()}`;
        break;
      }
      default:
        return json(400, { error: 'Action tidak dikenal.' });
    }

    const resp = await fetch(url, { method, headers, body });
    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // HoyoLab/WAF balikin non-JSON (biasanya kena block bot-protection) — kirim balik apa adanya biar kelihatan di app
      return json(200, { error: `HoyoLab menolak request (status ${resp.status}): ${raw.slice(0, 200)}` }, { 'Cache-Control': 'no-store' });
    }
    return json(200, data, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return json(500, { error: String(err) });
  }
}
