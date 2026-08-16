# Genshin Tracker (PWA)

App buat pantau akun Genshin Impact kamu lewat HoyoLab: resin real-time, misi harian,
daftar karakter + artefak + senjata + konstelasi, dan check-in harian — bisa di-install
ke HP Android kayak app biasa.

## Fitur

- ✅ Resin real-time (current/max + estimasi waktu penuh)
- ✅ Misi harian, ekspedisi, realm currency (teapot)
- ✅ Check-in harian HoyoLab 1 klik
- ✅ Daftar semua karakter + level + konstelasi
- ✅ Detail karakter: senjata, artefak (set, level, rarity), stat
- ✅ Ringkasan akun: AR, achievement, spiral abyss
- ⚠️ Mora **tidak** tersedia — HoyoLab tidak expose data mora lewat API publik mereka.

## Cara Deploy (pakai GitHub + Netlify, sama kayak project Hades KB / dashboard kamu)

1. Buat repo baru di GitHub, push semua isi folder ini.
2. Login ke [netlify.com](https://netlify.com) → **Add new site → Import from GitHub** → pilih repo ini.
3. Build settings: **kosongkan build command**, publish directory `.` (sudah diatur di `netlify.toml`, biarkan default).
4. Deploy. Netlify otomatis detect folder `netlify/functions` dan jalanin sebagai serverless function.
5. Buka domain Netlify-nya (`https://nama-app.netlify.app`) di Chrome Android → menu (⋮) → **Add to Home screen / Install app**.

## Cara Pakai

1. Buka app, pilih server (Asia untuk sebagian besar pemain Indonesia).
2. Masukkan UID Genshin kamu (angka di profil, biasanya diawali `8` untuk Asia).
3. Masukkan Cookie HoyoLab kamu (panduan ada di tombol "Cara ambil cookie?" di app).
4. Tap **Hubungkan**.

Cookie disimpan di `localStorage` HP kamu sendiri — nggak pernah disimpan di server
Netlify Function, cuma diteruskan langsung ke HoyoLab per-request.

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
  di `netlify/functions/proxy.js` / `js/app.js`.
- File icon di `icons/` masih placeholder sederhana — ganti dengan icon 192x192 &
  512x512 kamu sendiri kalau mau tampilan lebih rapi.
