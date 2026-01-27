self.addEventListener('push', function(event) {
  if (event.data) {
    const payload = event.data.json();
    const title = payload.title || 'UCFitness Notification';
    const options = {
      body: payload.body || 'You have a new update!',
      icon: payload.icon || '/globe.svg',
      badge: '/globe.svg',
      data: {
        url: payload.url || '/'
      }
    };

    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
