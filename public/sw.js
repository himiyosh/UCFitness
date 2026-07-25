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
const RECIPIENT_CACHE = "ucfitness-push-recipient-v1";
const RECIPIENT_CACHE_KEY = new URL("/.ucfitness/push-recipient-state", self.location.origin).href;
const RECIPIENT_MESSAGE_SOURCE = "ucfitness-push-recipient-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERSONALIZED_TAGS = new Set(["group-challenge-reward", "step-reminder", "test-notification", "ucfitness-badges", "weekly-summary"]);
const PERSONALIZED_TYPES = new Set(["badge", "group-challenge-reward", "health", "step-reminder", "weekly-summary"]);
const RECIPIENT_MESSAGE_TYPES = new Set(["push-recipient:set", "push-recipient:clear", "push-recipient:get"]);
let recipientOperation = Promise.resolve();
let recipientTransitionToken = null;
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isRecipientState(value) {
  return isRecord(value) && Object.keys(value).length === 2 &&
    (value.recipientGeneration === null ||
      typeof value.recipientGeneration === "string" && UUID_PATTERN.test(value.recipientGeneration)) &&
    Number.isSafeInteger(value.recipientVersion) && value.recipientVersion >= 0;
}
async function readRecipientState() {
  const cache = await caches.open(RECIPIENT_CACHE);
  const response = await cache.match(RECIPIENT_CACHE_KEY);
  if (!response) return { recipientGeneration: null, recipientVersion: 0 };
  const state = await response.json();
  if (!isRecipientState(state)) throw new Error("Invalid recipient state"); return state;
}
async function writeRecipientState(state) {
  const cache = await caches.open(RECIPIENT_CACHE);
  await cache.put(RECIPIENT_CACHE_KEY, new Response(JSON.stringify(state), { headers: { "Content-Type": "application/json" } }));
}
function recipientReply(port, ok, state, code, transitionToken = null) {
  port.postMessage({ source: RECIPIENT_MESSAGE_SOURCE, ok, state, transitionToken, ...(code ? { code } : {}) });
}
async function handleRecipientMessage(event) {
  const port = event.ports?.[0];
  if (!port) return;
  const message = event.data;
  try {
    if (!isRecord(message) || message.source !== RECIPIENT_MESSAGE_SOURCE || !RECIPIENT_MESSAGE_TYPES.has(message.type))
      return recipientReply(port, false, null, "INVALID_MESSAGE");
    const current = await readRecipientState();
    if (message.type === "push-recipient:get") return recipientReply(port, true, current);
    if (message.type === "push-recipient:clear") {
      const cleared = { recipientGeneration: null, recipientVersion: current.recipientVersion };
      await writeRecipientState(cleared);
      recipientTransitionToken = crypto.randomUUID().toLowerCase();
      return recipientReply(port, true, cleared, null, recipientTransitionToken);
    }
    if (!isRecipientState(message.state) || message.state.recipientGeneration === null)
      return recipientReply(port, false, current, "INVALID_STATE");
    const next = {
      recipientGeneration: message.state.recipientGeneration.toLowerCase(),
      recipientVersion: message.state.recipientVersion,
    };
    if (next.recipientVersion === current.recipientVersion &&
      next.recipientGeneration === current.recipientGeneration)
      return recipientReply(port, true, current);
    if (message.transitionToken !== recipientTransitionToken || typeof message.transitionToken !== "string" ||
      !UUID_PATTERN.test(message.transitionToken)) return recipientReply(port, false, current, "STALE_TRANSITION");
    if (next.recipientVersion < current.recipientVersion ||
      next.recipientVersion === current.recipientVersion &&
      next.recipientGeneration !== current.recipientGeneration) return recipientReply(port, false, current, "STALE_STATE");
    await writeRecipientState(next);
    recipientTransitionToken = null;
    recipientReply(port, true, next);
  } catch {
    recipientReply(port, false, null, "PERSISTENCE_FAILED");
  }
}
function enqueueRecipientOperation(operation) {
  const current = recipientOperation.then(operation); recipientOperation = current.catch(() => undefined); return current;
}

function normalizeLocale(locale) {
  return locale === "en" ? "en" : "ja";
}

function normalizeTargetUrl(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) {
    return "/";
  }

  return url;
}

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
self.addEventListener("message", (event) => event.waitUntil(enqueueRecipientOperation(() => handleRecipientMessage(event))));

async function handlePush(event) {
  const browserLocale = self.navigator.language?.toLowerCase().startsWith("en") ? "en" : "ja";
  let locale = browserLocale;
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
      if (!isRecord(payload)) throw new Error("Invalid payload");
      locale = normalizeLocale(payload.locale);
    } catch {
      console.warn("Push payload dropped: invalid data");
      return;
    }
  }

  const fallback = PUSH_FALLBACKS[locale];
  const rawTag = typeof payload.tag === "string" ? payload.tag : null;
  const tag = rawTag && /^[A-Za-z0-9_-]{1,32}$/.test(rawTag) ? rawTag : "ucfitness-update";
  const personalized = PERSONALIZED_TAGS.has(rawTag) || PERSONALIZED_TYPES.has(payload.type) ||
    Object.hasOwn(payload, "recipientGeneration") || Object.hasOwn(payload, "recipientVersion");
  if (personalized) {
    const fence = {
      recipientGeneration: typeof payload.recipientGeneration === "string"
        ? payload.recipientGeneration.toLowerCase() : null,
      recipientVersion: payload.recipientVersion,
    };
    if (!isRecipientState(fence) || fence.recipientGeneration === null)
      return console.warn("Personalized push dropped: invalid recipient fence");
    try {
      const current = await readRecipientState();
      if (current.recipientGeneration !== fence.recipientGeneration || current.recipientVersion !== fence.recipientVersion)
        return console.warn("Personalized push dropped: recipient mismatch");
    } catch {
      console.warn("Personalized push dropped: recipient state unavailable");
      return;
    }
  }
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

  await self.registration.showNotification(title, options);
}

self.addEventListener("push", (event) => event.waitUntil(enqueueRecipientOperation(() => handlePush(event))));

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
