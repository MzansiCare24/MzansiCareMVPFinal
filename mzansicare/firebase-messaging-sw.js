// Firebase Messaging SW placeholder (client must serve over HTTPS or localhost)
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.notification?.title || 'MzansiCare';
  const options = {
    body: data.notification?.body || '',
    icon: '/favicon.ico'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
