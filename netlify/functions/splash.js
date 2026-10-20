// Mengembalikan URL gambar splash yang mengikuti halaman HoYoLab Battle Chronicle.
// Urutan: (1) env SPLASH_URL kalau diisi (override manual) -> (2) scrape halaman HoYoLab
// (HTML + bundle JS/CSS-nya) cari gambar yang namanya mirip splash/launch/loading/cover.
// Hasil di-cache di memori fungsi 1 jam + header CDN, jadi tiap ada update di HoYoLab
// gambar ikut berganti tanpa deploy ulang. Client menerima {url, source} atau {url:null}.
const PAGE = 'https://act.hoyolab.com/app/community-game-records-sea/index.html';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const IMG_RE = /(?:https?:)?\/\/[^"'\s)\\<>]+?\.(?:png|jpe?g|webp)(?:\?[^"'\s)\\<>]*)?/gi;
const HINT_RE = /splash|launch|loading|startup|start[-_]?page|open[-_]?screen|cover|poster|key[-_]?visual|kv/i;
const TTL_MS = 60 * 60 * 1000;
const MAX_ASSETS = 10;

let cache = { at: 0, url: null };

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctl.signal });
    if (!r.ok) return '';
    return await r.text();
  } catch { return ''; } finally { clearTimeout(t); }
}

function abs(u, base) {
  try { return new URL(u.startsWith('//') ? 'https:' + u : u, base).href; } catch { return null; }
}

async function scrape() {
  const html = await get(PAGE);
  if (!html) return null;

  const assets = [];
  for (const m of html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi)) {
    const u = abs(m[1], PAGE);
    if (u && !assets.includes(u)) assets.push(u);
  }
  const bodies = [html];
  const fetched = await Promise.all(assets.slice(0, MAX_ASSETS).map(get));
  bodies.push(...fetched);

  const seen = new Set();
  const hinted = [];
  const other = [];
  for (const body of bodies) {
    for (const m of body.matchAll(IMG_RE)) {
      const u = abs(m[0], PAGE);
      if (!u || seen.has(u)) continue;
      seen.add(u);
      const name = u.split('?')[0].split('/').pop();
      if (/icon|logo|avatar|emoji|sprite|favicon/i.test(name)) continue;
      (HINT_RE.test(name) ? hinted : other).push(u);
    }
  }
  return hinted[0] || null; // sengaja TIDAK menebak gambar acak kalau tidak ada petunjuk nama
}

exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300, s-maxage=3600',
  };
  const manual = (process.env.SPLASH_URL || '').trim();
  if (manual) return { statusCode: 200, headers, body: JSON.stringify({ url: manual, source: 'env' }) };

  if (cache.url && Date.now() - cache.at < TTL_MS) {
    return { statusCode: 200, headers, body: JSON.stringify({ url: cache.url, source: 'cache' }) };
  }
  let url = null;
  try { url = await scrape(); } catch { /* jatuh ke fallback client */ }
  if (url) cache = { at: Date.now(), url };
  else if (cache.url) url = cache.url; // scrape gagal -> pakai yang terakhir berhasil
  return { statusCode: 200, headers, body: JSON.stringify({ url, source: url ? 'hoyolab' : null }) };
};
