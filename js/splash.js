// Splash screen: gambar diambil dari endpoint server (/.netlify/functions/splash),
// yang membaca sumber splash HoYoLab. Kalau gagal, pakai icon app sebagai fallback.
const SPLASH_DURATION_MS = 3000;
const SPLASH_FALLBACK = 'icons/icon-512.png';

const Splash = {
  async fetchImageUrl() {
    try {
      const resp = await fetch('/.netlify/functions/splash', { cache: 'no-store' });
      const json = await resp.json();
      return json.url || SPLASH_FALLBACK;
    } catch {
      return SPLASH_FALLBACK;
    }
  },

  run(durationMs) {
    const el = document.getElementById('splash');
    const img = document.getElementById('splash-img');
    if (!el || !img) return Promise.resolve();
    const minWait = new Promise((r) => setTimeout(r, durationMs));
    const imgReady = this.fetchImageUrl().then((url) => {
      img.onerror = () => { img.onerror = null; img.src = SPLASH_FALLBACK; };
      img.src = url;
    });
    return Promise.all([minWait, imgReady]).then(() => {
      el.classList.add('fade-out');
      return new Promise((r) => setTimeout(() => { el.classList.add('hidden'); r(); }, 400));
    });
  },
};
