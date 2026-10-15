// Mengembalikan URL gambar splash. Sumber diatur lewat env var SPLASH_URL di Netlify
// (isi dengan URL gambar splash HoYoLab yang kamu temukan).
// Kalau env var kosong, client otomatis pakai fallback icon app.
exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };
  const url = (process.env.SPLASH_URL || '').trim();
  return { statusCode: 200, headers, body: JSON.stringify({ url: url || null }) };
};
