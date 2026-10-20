// Splash screen: gambar terakhir yang berhasil diambil disimpan di localStorage, jadi
// app langsung menampilkan splash di pembukaan berikutnya, sambil mengecek gambar terbaru
// dari /.netlify/functions/splash (yang mengikuti halaman HoYoLab). Kalau belum ada
// cache dan fetch gagal/lambat, pakai icon app sebagai fallback.
const SPLASH_DURATION_MS = 3000;
const SPLASH_FALLBACK = 'icons/icon-512.png';
const SPLASH_CACHE_KEY = 'gt_splash_url';
const SPLASH_FETCH_TIMEOUT_MS = 2500;

const Splash = {
  cached() {
    try { return localStorage.getItem(SPLASH_CACHE_KEY) || ''; } catch { return ''; }
  },

  async fetchLatest() {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), SPLASH_FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch('/.netlify/functions/splash', { cache: 'no-store', signal: ctl.signal });
      const json = await resp.json();
      if (json.url) {
        try { localStorage.setItem(SPLASH_CACHE_KEY, json.url); } catch { /* storage penuh/diblok */ }
        return json.url;
      }
    } catch { /* offline / timeout */ } finally { clearTimeout(t); }
    return '';
  },

  run(durationMs) {
    const el = document.getElementById('splash');
    const img = document.getElementById('splash-img');
    if (!el || !img) return Promise.resolve();

    img.onerror = () => { img.onerror = null; img.src = SPLASH_FALLBACK; };
    const cached = this.cached();
    if (cached) img.src = cached;

    // Ambil yang terbaru; kalau beda dari cache, tukar gambar saat itu juga.
    const latest = this.fetchLatest().then((url) => {
      if (url && url !== cached) img.src = url;
      else if (!url && !cached) img.src = SPLASH_FALLBACK;
    });

    const minWait = new Promise((r) => setTimeout(r, durationMs));
    // Tanpa cache, tunggu fetch (maks 2,5 dtk) supaya gambar tidak kosong; dengan cache tidak perlu nunggu.
    const ready = cached ? Promise.resolve() : latest;
    return Promise.all([minWait, ready]).then(() => {
      el.classList.add('fade-out');
      return new Promise((r) => setTimeout(() => { el.classList.add('hidden'); r(); }, 400));
    });
  },
};
