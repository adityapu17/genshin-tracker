// Animasi ringan & efek elemen karakter.
// Aturan biar nggak lag: cuma animasi transform/opacity (jalan di GPU), partikel sedikit,
// HP low-end dapat partikel lebih sedikit, dan semuanya mati kalau "reduce motion" aktif.

const FX_REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const FX_LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 4) <= 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- Hitung naik (resin, primogem, dst) ----------
// Elemen bertanda data-count="angka" dihitung naik dari 0 dalam satu requestAnimationFrame loop.
function animateCounts(root) {
  const items = [...(root || document).querySelectorAll('[data-count]')]
    .map((el) => ({ el, to: Number(el.dataset.count) }))
    .filter((i) => Number.isFinite(i.to) && i.to > 0);
  if (!items.length || FX_REDUCED) return;
  const t0 = performance.now(), dur = 800;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    items.forEach((i) => { i.el.textContent = Math.round(i.to * e).toLocaleString('id-ID'); });
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- Ledakan partikel kecil (check-in / redeem berhasil) ----------
function burst(target, colors = ['#ffcb5a', '#5aa3ff', '#5ad19e', '#ff6b6b']) {
  if (FX_REDUCED || !target) return;
  const r = target.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'burst';
  box.style.left = (r.left + r.width / 2) + 'px';
  box.style.top = (r.top + r.height / 2) + 'px';
  const n = FX_LOW_END ? 10 : 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(-0.25, 0.25), dist = rnd(50, 120);
    const p = document.createElement('i');
    p.style.cssText = `--dx:${(Math.cos(a) * dist).toFixed(0)}px;--dy:${(Math.sin(a) * dist).toFixed(0)}px;background:${colors[i % colors.length]}`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 900);
}

// ---------- Efek elemen di detail karakter ----------
const ELEMENTS = {
  pyro:    { label: 'Pyro',    icon: '🔥', alias: ['pyro', '火'] },
  hydro:   { label: 'Hydro',   icon: '💧', alias: ['hydro', '水'] },
  cryo:    { label: 'Cryo',    icon: '❄️', alias: ['cryo', '冰'] },
  dendro:  { label: 'Dendro',  icon: '🌿', alias: ['dendro', '草'] },
  geo:     { label: 'Geo',     icon: '🪨', alias: ['geo', '岩'] },
  electro: { label: 'Electro', icon: '⚡', alias: ['electro', '雷'] },
  anemo:   { label: 'Anemo',   icon: '🍃', alias: ['anemo', '风', '風'] },
};

// Nama elemen dari API ("Pyro", dst). Return kunci ELEMENTS, atau null kalau tidak dikenali.
function normElement(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (!s) return null;
  return Object.keys(ELEMENTS).find((k) => ELEMENTS[k].alias.some((a) => s.includes(a))) || null;
}

const BOLTS = [
  ['10%', '0s', '3.4s'], ['38%', '1.1s', '4.1s'], ['64%', '2.2s', '3.7s'], ['86%', '.6s', '4.6s'],
];
const boltSvg = ([x, d, t]) => `<svg class="bolt" viewBox="0 0 30 100" preserveAspectRatio="none" style="left:${x};--d:${d};--t:${t}"><polygon points="18,0 4,52 15,52 8,100 27,38 16,38 24,0" fill="#efe0ff" stroke="#b57bff" stroke-width="2.5" stroke-opacity=".55"/></svg>`;

// Partikel pakai delay negatif supaya efek langsung "sedang berjalan" begitu modal terbuka.
function elementFxHtml(key) {
  if (FX_REDUCED || !key) return '';
  const n = FX_LOW_END ? 8 : 14;
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = rnd(3, 95), sw = rnd(-30, 30);
    let s, t;
    switch (key) {
      case 'pyro':    s = rnd(9, 18);  t = rnd(2.2, 4);   break;
      case 'cryo':    s = rnd(5, 12);  t = rnd(5, 9);     break;
      case 'hydro':   s = rnd(8, 22);  t = rnd(4, 8);     break;
      case 'dendro':  s = rnd(12, 20); t = rnd(6, 10);    break;
      case 'geo':     s = rnd(8, 16);  t = rnd(4, 7);     break;
      case 'electro': s = rnd(3, 5);   t = rnd(1.6, 3);   break;
      default:        s = rnd(50, 130); t = rnd(2.5, 4.5); // anemo: s = panjang garis angin
    }
    const d = -rnd(0, t);
    const glyph = key === 'cryo' && i % 3 === 0 ? '❄' : '';
    const kind = (key === 'dendro' || key === 'geo') && i % 4 === 3 ? ' sp' : ''; // sp = percikan kecil
    out += `<i class="p${glyph ? ' g' : ''}${kind}" style="--x:${x.toFixed(1)}%;--y:${rnd(4, 92).toFixed(0)}%;--s:${s.toFixed(1)}px;--t:${t.toFixed(2)}s;--d:${d.toFixed(2)}s;--sw:${sw.toFixed(0)}px;--rot:${rnd(120, 320).toFixed(0)}deg">${glyph}</i>`;
  }
  if (key === 'electro') out += BOLTS.slice(0, FX_LOW_END ? 2 : 4).map(boltSvg).join('');
  return `<div class="fx-layer fx-${key}" aria-hidden="true">${out}</div>`;
}
