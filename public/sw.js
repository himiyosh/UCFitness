const PUSH_FALLBACKS = {
  ja: {
    title: "UCFitnessからのお知らせ",
    body: "新しい更新があります。アプリで確認してください。",
  },
  en: {
    title: "UCFitness update",
    body: "You have a new update. Open the app to view it.",
  },
};

function normalizeLocale(locale) {
  return locale === "en" ? "en" : "ja";
}

function normalizeTargetUrl(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) {
    return "/";
  }

  return url;
}

self.addEventListener("push", function (event) {
  const browserLocale = self.navigator.language?.toLowerCase().startsWith("en")
    ? "en"
    : "ja";
  let locale = browserLocale;
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
      locale = normalizeLocale(payload.locale);
    } catch (error) {
      console.error("Push data parse error", error);
    }
  }

  const fallback = PUSH_FALLBACKS[locale];
  const tag =
    typeof payload.tag === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(payload.tag)
      ? payload.tag
      : "ucfitness-update";
  const options = {
    body: typeof payload.body === "string" ? payload.body : fallback.body,
    icon: typeof payload.icon === "string" ? payload.icon : "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: normalizeTargetUrl(payload.url) },
    lang: locale,
    tag,
    renotify: false,
  };
  const title =
    typeof payload.title === "string" ? payload.title : fallback.title;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = new URL(
    normalizeTargetUrl(event.notification.data?.url),
    self.location.origin,
  ).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        const exactClient = windowClients.find(
          (client) => client.url === targetUrl,
        );
        if (exactClient && "focus" in exactClient) {
          return exactClient.focus();
        }

        const appClient = windowClients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });
        if (appClient && "navigate" in appClient && "focus" in appClient) {
          await appClient.navigate(targetUrl);
          return appClient.focus();
        }

        return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
      }),
  );
});
