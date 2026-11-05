// Splash screen: gambar statis icons/splash.webp, tampil 3 detik saat app dibuka.
// Kalau gambar gagal dimuat, pakai icon app sebagai fallback.
const SPLASH_DURATION_MS = 3000;
const SPLASH_IMAGE = 'icons/splash.webp';
const SPLASH_FALLBACK = 'icons/icon-512.png';

const Splash = {
  run(durationMs) {
    const el = document.getElementById('splash');
    const img = document.getElementById('splash-img');
    if (!el || !img) return Promise.resolve();

    img.onerror = () => { img.onerror = null; img.src = SPLASH_FALLBACK; };
    img.src = SPLASH_IMAGE;

    return new Promise((r) => setTimeout(r, durationMs)).then(() => {
      el.classList.add('fade-out');
      return new Promise((r) => setTimeout(() => { el.classList.add('hidden'); r(); }, 400));
    });
  },
};
