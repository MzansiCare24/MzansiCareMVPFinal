// Firebase Cloud Messaging (client-side)
(function(){
  if (!firebase.messaging) return;
  let messaging;
  try { messaging = firebase.messaging(); } catch(e) { console.warn('Messaging init failed', e); }

  async function initMessagingForUser(user) {
    if (!messaging || !user) return;
    try {
      if (!window.isSecureContext && !location.hostname.includes('localhost')) {
        console.warn('FCM requires HTTPS or localhost for service workers.');
        return;
      }
      // Register the service worker for background messages
      let reg;
      if ('serviceWorker' in navigator) {
        try {
          reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          if (messaging.useServiceWorker) messaging.useServiceWorker(reg);
        } catch (e) { console.warn('SW registration failed', e); }
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      // Optionally set your public VAPID key if configured in Firebase console
      // messaging.usePublicVapidKey('YOUR_PUBLIC_VAPID_KEY_HERE');
      const token = await messaging.getToken();
      if (!token) return;
      await db.collection('patients').doc(user.uid).set({ fcmToken: token }, { merge: true });
      console.log('FCM token saved');
    } catch (e) {
      console.warn('FCM setup failed:', e);
    }
  }

  // Handle foreground messages
  if (messaging) {
    messaging.onMessage((payload) => {
      console.log('FCM foreground message:', payload);
      const note = document.createElement('div');
      note.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#333;color:#fff;padding:12px 16px;border-radius:8px;z-index:10000;';
      note.textContent = payload.notification?.title || 'New notification';
      document.body.appendChild(note);
      setTimeout(()=> note.remove(), 3000);
    });
  }

  // Expose hook
  window.initMessagingForUser = initMessagingForUser;
})();
