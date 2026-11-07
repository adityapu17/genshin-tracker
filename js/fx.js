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

// Spiral dua lengan untuk angin Anemo (dihitung sekali, dipakai semua pusaran)
const SWIRL_PATH = (() => {
  let d1 = '', d2 = '';
  for (let k = 0; k <= 26; k++) {
    const th = (k / 26) * Math.PI * 3, r = 3 + th * 4.2, x = r * Math.cos(th), y = r * Math.sin(th);
    d1 += `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    d2 += `${k ? 'L' : 'M'}${(-x).toFixed(1)} ${(-y).toFixed(1)}`;
  }
  return [d1, d2];
})();
// Hembusan angin: garis melengkung tipis yang memudar di kedua ujungnya (campuran dengan pusaran)
const gustSvg = (style) => {
  const y = () => rnd(1, 15).toFixed(1);
  return `<svg class="p gust" viewBox="0 0 100 16" preserveAspectRatio="none" style="${style}" fill="none" stroke-linecap="round"><path d="M0 8C22 ${y()} 40 ${y()} 62 ${y()}S90 ${y()} 100 8" stroke="#d6fff4" stroke-width="2" stroke-opacity=".85" vector-effect="non-scaling-stroke"/><path d="M8 ${y()}C30 ${y()} 55 ${y()} 94 ${y()}" stroke="#8ff7de" stroke-width="1.2" stroke-opacity=".6" vector-effect="non-scaling-stroke"/></svg>`;
};
const swirlSvg = (style) => `<svg class="p swirl" viewBox="-50 -50 100 100" style="${style}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${SWIRL_PATH[0]}" stroke="#8ff7de" stroke-width="3.2" stroke-opacity=".85"/><path d="${SWIRL_PATH[1]}" stroke="#d6fff4" stroke-width="2" stroke-opacity=".7"/></svg>`;

// Jumlah partikel per elemen: [normal, HP low-end]
const FX_COUNT = { pyro: [22, 12], cryo: [14, 8], hydro: [15, 9], dendro: [16, 9], geo: [14, 8], electro: [9, 5], anemo: [10, 6] };

// Partikel pakai delay negatif supaya efek langsung "sedang berjalan" begitu modal terbuka.
function elementFxHtml(key) {
  if (FX_REDUCED || !key) return '';
  const n = FX_COUNT[key][FX_LOW_END ? 1 : 0];
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = rnd(3, 95), sw = rnd(-30, 30);
    let s, t;
    switch (key) {
      case 'pyro':    s = rnd(2, 5.5);  t = rnd(2.4, 5);   break; // bara kecil
      case 'cryo':    s = rnd(5, 12);   t = rnd(5, 9);     break;
      case 'hydro':   s = rnd(8, 22);   t = rnd(4, 8);     break; // rip (riak) pakai s x3 sebagai diameter
      case 'dendro':  s = i % 2 ? rnd(3, 7) : rnd(12, 20); t = i % 2 ? rnd(5, 9) : rnd(6, 10); break;
      case 'geo':     s = rnd(8, 16);   t = rnd(4, 7);     break;
      case 'electro': s = rnd(3, 5);    t = rnd(1.6, 3);   break;
      default:        // anemo: 1 dari 3 pusaran, sisanya hembusan melengkung (lebih cepat)
        if (i % 3 === 0) { s = rnd(60, 110); t = rnd(5, 9); } else { s = rnd(80, 160); t = rnd(2.2, 4.2); }
    }
    const d = -rnd(0, t);
    const glyph = key === 'cryo' && i % 3 === 0 ? '❄' : '';
    // sp: dendro = titik cahaya hijau (separuh partikel), geo = percikan emas kecil
    const sp = (key === 'dendro' && i % 2) || (key === 'geo' && i % 4 === 3) ? ' sp' : '';
    const style = `--x:${x.toFixed(1)}%;--y:${rnd(4, 92).toFixed(0)}%;--s:${s.toFixed(1)}px;--t:${t.toFixed(2)}s;--d:${d.toFixed(2)}s;--sw:${sw.toFixed(0)}px;--rise:${rnd(30, 66).toFixed(0)}vh;--rot:${rnd(360, 720).toFixed(0)}deg;--dy:${rnd(-70, 70).toFixed(0)}px`;
    const rip = key === 'hydro' && i % 3 === 2 ? ' rip' : ''; // riak air: cincin elips yang melebar
    out += key === 'anemo' ? (i % 3 === 0 ? swirlSvg(style) : gustSvg(style)) : `<i class="p${glyph ? ' g' : ''}${sp}${rip}" style="${style}">${glyph}</i>`;
  }
  if (key === 'electro') out += '<svg class="arcs" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>';
  return `<div class="fx-layer fx-${key}" aria-hidden="true">${out}</div>`;
}

// ---------- Listrik Electro: sambaran acak dari atas / samping / bawah ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
const arcPts = (x, y, dx, dy, len, steps) => {
  const pts = [[x, y]], t = len / steps;
  for (let i = 0; i < steps; i++) {
    const j = rnd(-5, 5);
    x += dx * t - dy * j; y += dy * t + dx * j;
    pts.push([x, y]);
  }
  return pts;
};
const ptsToPath = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

function makeArc() {
  const edge = Math.floor(rnd(0, 4));
  let x, y, dx, dy;
  if (edge === 0) { x = rnd(8, 92); y = 0; dx = 0; dy = 1; }          // dari atas
  else if (edge === 1) { x = 100; y = rnd(8, 92); dx = -1; dy = 0; }  // dari kanan
  else if (edge === 2) { x = rnd(8, 92); y = 100; dx = 0; dy = -1; }  // dari bawah
  else { x = 0; y = rnd(8, 92); dx = 1; dy = 0; }                     // dari kiri
  const len = rnd(16, 40), steps = Math.round(rnd(6, 10));
  const main = arcPts(x, y, dx, dy, len, steps);
  let d = ptsToPath(main);
  // cabang kecil dari tengah sambaran
  const b = main[Math.floor(steps / 2)], ang = rnd(0.6, 1) * (Math.random() < 0.5 ? -1 : 1);
  const bdx = dx * Math.cos(ang) - dy * Math.sin(ang), bdy = dx * Math.sin(ang) + dy * Math.cos(ang);
  d += ptsToPath(arcPts(b[0], b[1], bdx, bdy, len * 0.35, 3));
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'arc');
  ['o', 'i'].forEach((c) => {
    const pth = document.createElementNS(SVG_NS, 'path');
    pth.setAttribute('class', c);
    pth.setAttribute('d', d);
    g.appendChild(pth);
  });
  g.addEventListener('animationend', () => g.remove());
  return g;
}

// Dipanggil setelah lapisan efek masuk DOM. Berhenti sendiri saat modal ditutup / diganti.
function startElementFx(layer) {
  if (!layer || !layer.classList.contains('fx-electro')) return;
  const svg = layer.querySelector('.arcs');
  const fire = () => {
    if (!layer.isConnected || layer.offsetParent === null) return;
    if (!document.hidden && svg.childElementCount < 3) svg.appendChild(makeArc());
    setTimeout(fire, rnd(220, 850));
  };
  fire();
}
