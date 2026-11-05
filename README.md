# Genshin Tracker (PWA)

App buat pantau akun Genshin Impact kamu lewat HoyoLab: resin real-time, misi harian,
daftar karakter + artefak + senjata + konstelasi, dan check-in harian — bisa di-install
ke HP Android kayak app biasa.

## Fitur

- ✅ Resin real-time: hitung mundur live + jam resin penuh
- ✅ Timer: realm currency, Parametric Transformer, tiap ekspedisi, weekly boss, hadiah misi harian
- ✅ Countdown reset (harian, mingguan, Spiral Abyss, Imaginarium Theater, Stygian) dalam waktu server
- ✅ Tab Endgame: ringkasan Abyss/Theater/Stygian + detail Spiral Abyss (periode ini/sebelumnya, bintang, tim)
- ✅ Tab Farming: domain talent book & material senjata yang buka hari ini, dicocokkan ke karakter kamu
- ✅ Traveler's Diary: primogem dan mora per bulan (tergantung API HoyoLab, bisa tidak tersedia)
- ✅ Skor artefak (Crit Value = CRIT Rate × 2 + CRIT DMG) per artefak dan total di detail karakter
- ✅ UID otomatis: kosongkan kolom UID, app mendeteksi dari cookie
- ✅ Check-in harian HoyoLab 1 klik
- ✅ Daftar semua karakter + level + konstelasi
- ✅ Detail karakter: senjata, artefak (set, level, rarity), stat
- ✅ Ringkasan akun: AR, achievement, spiral abyss
- ⚠️ Mora **tidak** tersedia — HoyoLab tidak expose data mora lewat API publik mereka.

## Struktur

- `index.html`, `css/`, `js/`, `icons/`, `manifest.json`, `sw.js` — frontend PWA (static).
- `functions/api/proxy.js` — Cloudflare Pages Function, route `/api/proxy`: nerusin request ke HoyoLab.
- `functions/api/splash.js` — Pages Function, route `/api/splash` (saat ini tidak dipakai app).
- `js/features.js` — timer, reset, Endgame, Farming, Diary, skor artefak.
- `data/farming.json` — tabel domain & karakter/senjata (hasil generate, jangan edit manual).
- `data/resets.json` — jadwal reset (boleh diedit manual).
- `tools/gen-farming.js` — script regenerasi `data/farming.json`.
- `_headers` — security header + cache rule untuk Cloudflare Pages.

## Cara Deploy (GitHub + Cloudflare Pages)

1. Push repo ini ke GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pilih repo ini.
3. Build settings: Framework preset **None**, build command **kosong**, build output directory **kosong** (atau `/`).
4. **Save and Deploy**. Folder `functions/` otomatis jadi route `/api/*`, file `_headers` otomatis dipakai.
5. Buka domain `https://nama-app.pages.dev` di Chrome Android → menu (⋮) → **Add to Home screen / Install app**.

Setiap push ke `main` otomatis deploy ulang.

### Dev lokal (opsional)

```bash
npx wrangler pages dev .
```

## Cara Pakai

1. Buka app, pilih server (Asia untuk sebagian besar pemain Indonesia).
2. Masukkan UID Genshin kamu (angka di profil, biasanya diawali `8` untuk Asia).
3. Masukkan Cookie HoyoLab kamu (panduan ada di tombol "Cara ambil cookie?" di app).
4. Tap **Hubungkan**.

Cookie disimpan di `localStorage` HP kamu sendiri — nggak pernah disimpan di server,
cuma diteruskan langsung ke HoyoLab per-request oleh Pages Function.

## Merawat Data

- **Karakter/senjata baru** belum muncul di tab Farming sampai `data/farming.json` di-regenerate:
  `npm install --no-save genshin-db` lalu `node tools/gen-farming.js`. Commit hasilnya.
- **Jadwal reset** ada di `data/resets.json` (Abyss tiap tanggal 16, Theater tiap tanggal 1, Stygian tiap 42 hari
  dengan jendela buka 810 jam). Itu pola 2026 dan bisa berubah, jadi cocokkan dengan event in-game.
- Setelah mengubah file di `data/` atau `js/`, naikkan nomor versi `CACHE` di `sw.js` supaya PWA yang sudah
  terpasang ikut ter-update.

## Batasan & Catatan Teknis

- **Cookie kadaluarsa**: cookie HoyoLab biasanya berlaku beberapa minggu–bulan. Kalau
  tiba-tiba error "Cookie belum diisi" atau retcode aneh, ambil ulang cookie dari
  browser dan paste lagi lewat menu ⚙️ (putus koneksi → hubungkan ulang).
- **Check-in gagal karena verifikasi/captcha**: kadang miHoYo nambahin verifikasi
  tambahan (geetest) buat akun tertentu. Kalau itu terjadi, endpoint `signDo` bakal
  balikin error dan check-in harus dilakuin manual sekali lewat app HoyoLab resmi —
  ini limitasi dari sisi miHoYo, bukan bug di app ini.
- **Struktur JSON HoyoLab** kadang berubah tanpa pemberitahuan resmi (unofficial API).
  Kalau ada field yang tiba-tiba kosong/undefined, cek nama field terbaru di repo
  komunitas seperti `genshin.py` atau `Mar-7th/mihoyo-api` di GitHub, lalu sesuaikan
  di `functions/api/proxy.js` / `js/app.js`.
- **Diary, deteksi UID, dan detail Abyss** memakai endpoint HoyoLab tidak resmi. Kalau HoyoLab menolak (mis. ledger
  dimatikan), kartunya menampilkan pesan error dan sisa app tetap jalan. Deteksi UID otomatis gagal → isi UID manual.
- **Tab Farming** menampilkan semua karakter yang memakai book tersebut, termasuk yang talent-nya sudah maksimal
  (API tidak memberi level talent). Traveler tidak dimasukkan karena book-nya tergantung elemen.
- **Splash screen** statis: ganti file `icons/splash.webp` kalau mau ganti gambar.
- File icon di `icons/` masih placeholder sederhana — ganti dengan icon 192x192 &
  512x512 kamu sendiri kalau mau tampilan lebih rapi.
