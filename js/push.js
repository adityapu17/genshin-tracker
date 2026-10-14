// ---------- Push Notifications ----------
// Dua jalur notifikasi:
//  1. LOKAL: selagi PWA terbuka, tiap 5 menit cek resin & check-in lewat proxy,
//     lalu tampilkan notifikasi via service worker. Tidak butuh server storage.
//  2. REMOTE (VAPID): subscription dikirim ke /.netlify/functions/save-subscription
//     supaya server (netlify/functions/send-push.js) bisa push kapan saja.
//     Jalur ini aktif hanya kalau VAPID_PUBLIC_KEY di-set (meta tag di index.html
//     diisi saat build + env var di Netlify).
(function () {
  const POLL_MS = 5 * 60 * 1000;
  const RESIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;

  function prefs() {
    try { return JSON.parse(localStorage.getItem('gt_push_prefs') || '{"resin":true,"checkin":true}'); }
    catch { return { resin: true, checkin: true }; }
  }
  function savePrefs(p) { localStorage.setItem('gt_push_prefs', JSON.stringify(p)); }

  function vapidKey() {
    const el = document.querySelector('meta[name="vapid-public-key"]');
    return (el && el.content.trim()) || '';
  }

  async function swRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.ready; } catch { return null; }
  }

  async function notify(title, body) {
    const reg = await swRegistration();
    if (reg) {
      reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: title, data: { url: '/index.html' } });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png' });
    }
  }

  // ---- jalur remote: subscribe + kirim ke server ----
  async function subscribeRemote(reg) {
    const key = vapidKey();
    if (!key || !('PushManager' in window)) return 'no-vapid';
    try {
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const pad = '='.repeat((4 - (key.length % 4)) % 4);
        const buf = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) => c.charCodeAt(0));
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: buf });
      }
      const resp = await fetch('/.netlify/functions/save-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      return resp.ok ? 'subscribed' : 'server-error';
    } catch (e) {
      console.warn('[push] subscribe gagal:', e.message);
      return 'failed';
    }
  }

  // ---- jalur lokal: polling kondisi akun ----
  let pollTimer = null;
  async function poll() {
    if (!Storage.cookie || !Storage.roleId) return;
    const p = prefs();
    try {
      if (p.resin) {
        const note = await Api.getDailyNote();
        const full = note.current_resin >= note.max_resin;
        const wasFull = localStorage.getItem('gt_resin_full') === '1';
        if (full && !wasFull) {
          const last = Number(localStorage.getItem('gt_resin_notify_ts') || 0);
          if (Date.now() - last > RESIN_COOLDOWN_MS) {
            await notify('⚡ Resin Penuh', `Resin kamu sudah ${note.current_resin}/${note.max_resin}. Gunakan sekarang!`);
            localStorage.setItem('gt_resin_notify_ts', String(Date.now()));
          }
          localStorage.setItem('gt_resin_full', '1');
        } else if (!full) {
          localStorage.setItem('gt_resin_full', '0');
        }
      }
      if (p.checkin) {
        const info = await Api.getSignInfo().catch(() => null);
        const today = new Date().toISOString().slice(0, 10);
        if (info && !info.is_sign && localStorage.getItem('gt_checkin_notified') !== today) {
          await notify('📅 Belum Check-in', 'Check-in harian HoyoLab kamu belum diambil hari ini.');
          localStorage.setItem('gt_checkin_notified', today);
        }
      }
    } catch {
      // cookie salah/kedaluwarsa — polling berhenti diam-diam sampai login lagi
    }
  }
  function startPoll() {
    if (pollTimer) return;
    poll();
    pollTimer = setInterval(poll, POLL_MS);
  }

  // ---- UI kartu di Home ----
  window.renderPushCard = function renderPushCard() {
    const card = document.getElementById('push-card');
    if (!card || !('Notification' in window)) return;
    const p = prefs();

    if (Notification.permission === 'denied') {
      card.innerHTML = `
        <div class="card-title">Notifikasi</div>
        <p class="muted" style="font-size:13px">Izin notifikasi diblokir browser. Aktifkan lewat ikon 🔒/⚙️ di address bar situs ini kalau mau terima pengingat resin/check-in.</p>`;
      return;
    }

    if (Notification.permission === 'default') {
      card.innerHTML = `
        <div class="card-title">Notifikasi</div>
        <p class="muted" style="font-size:13px">Dapat pengingat saat resin penuh dan sebelum check-in harian terlewat.</p>
        <button class="btn-primary" id="btn-allow-push">Izinkan Notifikasi</button>`;
      card.querySelector('#btn-allow-push').addEventListener('click', async () => {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') { window.renderPushCard(); startPoll(); const reg = await swRegistration(); if (reg) subscribeRemote(reg); }
      });
      return;
    }

    // granted
    card.innerHTML = `
      <div class="card-title">Notifikasi ✅ aktif</div>
      <label class="stat-row" style="cursor:pointer"><span>Resin penuh</span>
        <input type="checkbox" id="pref-resin" ${p.resin ? 'checked' : ''}></label>
      <label class="stat-row" style="cursor:pointer"><span>Reminder check-in</span>
        <input type="checkbox" id="pref-checkin" ${p.checkin ? 'checked' : ''}></label>
      <p class="muted" style="font-size:12px;margin-top:8px" id="push-remote-status">Cek status push server...</p>`;
    card.querySelector('#pref-resin').addEventListener('change', (e) => { const q = prefs(); q.resin = e.target.checked; savePrefs(q); });
    card.querySelector('#pref-checkin').addEventListener('change', (e) => { const q = prefs(); q.checkin = e.target.checked; savePrefs(q); });

    const statusEl = card.querySelector('#push-remote-status');
    swRegistration().then(async (reg) => {
      if (!reg) { statusEl.textContent = 'Service worker belum siap — pengingat lokal tetap jalan saat app terbuka.'; return; }
      const st = await subscribeRemote(reg);
      if (st === 'subscribed') statusEl.textContent = 'Push server: tersubscribe ✅';
      else if (st === 'no-vapid') statusEl.textContent = 'Pengingat lokal aktif saat app terbuka. (Push server butuh VAPID key dari pemilik app.)';
      else statusEl.textContent = 'Push server belum aktif (' + st + '). Pengingat lokal tetap jalan.';
    });
    startPoll();
  };

  window.initPush = function initPush() {
    if (Notification.permission === 'granted') startPoll();
  };
})();
