// Regenerasi data/farming.json (talent book, material senjata, jadwal domain) dari paket genshin-db.
// Jalankan kalau ada karakter/senjata baru rilis:
//   npm install --no-save genshin-db
//   node tools/gen-farming.js
// Lalu commit data/farming.json dan naikkan nomor versi CACHE di sw.js.
const fs = require('fs');
const path = require('path');
const pkg = require('genshin-db/package.json');
const dataFile = path.join(path.dirname(require.resolve('genshin-db/package.json')), 'src', 'min', 'data.min.json');
const D = JSON.parse(fs.readFileSync(dataFile, 'utf8')).data.English;

const DAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const days = (a) => (a || []).map((d) => DAY[d]).sort((x, y) => x - y);

// Talent book: "Teachings of X" -> hari buka + domain
const books = {};
for (const m of Object.values(D.materials)) {
  if (m.typeText === 'Character Talent Material' && /^Teachings of /.test(m.name)) {
    books[m.name.replace('Teachings of ', '')] = {
      d: days(m.daysOfWeek),
      dom: (m.dropDomainName || '').replace('Domain of Mastery: ', ''),
    };
  }
}

// Karakter (id game) -> book talent-nya. Traveler tidak ikut (book-nya tergantung elemen).
const characters = {};
for (const [k, c] of Object.entries(D.characters)) {
  const t = D.talents[k];
  const item = t && t.costs && t.costs.lvl2 && t.costs.lvl2.find((i) => /^Teachings of /.test(i.name));
  if (item) characters[String(c.id)] = [c.name, item.name.replace('Teachings of ', '')];
}

// Material senjata: tiap family = 4 item berurutan mulai id 114001
const wfam = {};
const wm = Object.values(D.materials).filter((m) => m.typeText === 'Weapon Ascension Material').sort((a, b) => a.id - b.id);
for (const m of wm) {
  const idx = Math.floor((m.id - 114001) / 4);
  if (!wfam[idx]) wfam[idx] = { n: '', d: days(m.daysOfWeek), dom: (m.dropDomainName || '').replace('Domain of Forgery: ', '') };
  if ((m.id - 114001) % 4 === 0) wfam[idx].n = m.name;
}

// Senjata (id game) -> index family material
const weapons = {};
for (const w of Object.values(D.weapons)) {
  const first = w.costs && w.costs.ascend1 && w.costs.ascend1.find((i) => i.id >= 114001 && i.id < 115000);
  if (first) weapons[String(w.id)] = Math.floor((first.id - 114001) / 4);
}

const out = { source: `genshin-db ${pkg.version} (data ${new Date().toISOString().slice(0, 10)})`, books, characters, wfam, weapons };
const target = path.join(__dirname, '..', 'data', 'farming.json');
fs.writeFileSync(target, JSON.stringify(out));
console.log(`OK -> ${target}\n${Object.keys(books).length} book, ${Object.keys(characters).length} karakter, ${Object.keys(wfam).length} family material senjata, ${Object.keys(weapons).length} senjata`);
