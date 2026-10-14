// Netlify Function: proxy ke HoyoLab API.
// Cookie DIKIRIM oleh client di header "x-cookie" per-request, TIDAK pernah disimpan di server ini.
// Fungsi ini cuma nerusin request supaya browser nggak kena blokir CORS.

const BASE_RECORD = 'https://bbs-api-os.hoyolab.com/game_record/genshin/api';
const BASE_SIGN = 'https://sg-hk4e-api.hoyolab.com/event/sol';
const ACT_ID = 'e202102251931481'; // act_id daily check-in Genshin (Global/OS), stabil dari 2021

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

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-cookie, x-authkey',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const noStore = { 'Cache-Control': 'no-store' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const cookie = event.headers['x-cookie'] || event.headers['X-Cookie'];
    const params = event.queryStringParameters || {};
    const action = params.action;

    // 'wish' pakai authkey (bukan cookie) — sisanya wajib cookie.
    if (!cookie && action !== 'wish') {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Cookie belum diisi.' }) };
    }

    const headers = { ...buildHeaders(), Cookie: cookie };

    let url, method = 'GET', body, reqHeaders = headers;

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
        if (!params.cdkey) {
          return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Kode belum diisi.' }) };
        }
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
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Action tidak dikenal.' }) };
    }

    // 'wish' pakai authkey, tidak pakai cookie/HoyoLab web headers yang sama.
    if (action === 'wish') {
      const authkey = (event.headers['x-authkey'] || event.headers['X-Authkey'] || '').trim();
      if (!authkey) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Authkey belum diisi.' }) };
      }
      const region = params.server || '';
      const gachaType = parseInt(params.gacha_type, 10);
      const validTypes = [100, 200, 301, 302, 400];
      if (!validTypes.includes(gachaType) || Number.isNaN(gachaType)) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'gacha_type tidak valid.' }) };
      }
      const size = Math.min(50, Math.max(1, parseInt(params.size || '25', 10)));
      const page = Math.min(1000, Math.max(1, parseInt(params.page || '1', 10)));
      const endId = String(params.end_id ?? '0').replace(/[^\d]/g, '').slice(0, 20) || '0';

      const q = new URLSearchParams({
        authkey_ver: '1', sign_type: '2', auth_appid: 'webview_gacha',
        init_type: String(gachaType), gacha_type: String(gachaType),
        lang: 'id', page: String(page), size: String(size), end_id: endId,
        region: region || 'os_asia', game_biz: 'hk4e_global', device_type: 'mobile',
      });
      // authkey dikirim masih ter-encode URL (apa adanya dari client), cukup encode ulang biar aman.
      q.set('authkey', encodeURIComponent(authkey));
      // host utama OS (SG/TW region) + fallback host lama.
      const hosts = [
        'https://public-operation-hk4e-sg.hoyoverse.com',
        'https://hk4e-api-os.hoyoverse.com',
      ];
      let data, raw;
      for (const host of hosts) {
        const attempt = `${host}/gacha_info/api/getGachaLog?${q.toString()}`;
        // authkey tidak pakai cookie web — pakai header HoyoLab mobile standar.
        const hkHeaders = { ...buildHeaders(), Origin: 'https://webstatic.hoyoverse.com', Referer: 'https://webstatic.hoyoverse.com/' };
        delete hkHeaders.Cookie;
        const resp = await fetch(attempt, { method, headers: hkHeaders });
        raw = await resp.text();
        try { data = JSON.parse(raw); } catch { data = null; }
        // retry ke host lain kalau WAF/block atau retcode tak valid.
        if (data && data.retcode !== undefined) {
          return { statusCode: 200, headers: { ...cors, ...noStore, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        }
      }
      // tidak dapat JSON valid → terakhir sebagai error (tidak pernah expose authkey di sini).
      return {
        statusCode: 200, headers: { ...cors, ...noStore, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `HoyoLab menolak request wish (bukan JSON). Coba buka History di game & paste URL kembali.`, raw: raw.slice(0, 200) }),
      };
    }

    const resp = await fetch(url, { method, headers: reqHeaders, body });
    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // HoyoLab/WAF balikin non-JSON (biasanya kena block bot-protection) — kirim balik apa adanya biar kelihatan di app
      return {
        statusCode: 200,
        headers: { ...cors, ...noStore, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `HoyoLab menolak request (status ${resp.status}): ${raw.slice(0, 200)}` }),
      };
    }
    return { statusCode: 200, headers: { ...cors, ...noStore, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: String(err) }) };
  }
};
