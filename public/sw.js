self.addEventListener("push", function (event) {
  let title = "New Notification";
  let options = {
    body: "You have a new update in UCFitness.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: "/" },
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      title = payload.title || title;
      options.body = payload.body || options.body;
      options.icon = payload.icon || options.icon;
      if (payload.url) options.data.url = payload.url;
    } catch (e) {
      console.error("Push data parse error", e);
    }
  } else {
    // Tickle (payload-less) push - Default "Pop" Message
    title = "🎉 New Achievement Unlocked! 🏆";
    options.body =
      "Wow! You reached a new milestone in UCFitness! ✨\nTap to see your shiny new badge! 👀";
    options.data.url = "/profile";
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there is already a window/tab open with the target URL
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        // If not, open a new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      }),
  );
});
