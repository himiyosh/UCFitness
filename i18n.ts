import { getRequestConfig } from 'next-intl/server';
import { routing } from './navigation';

type Messages = typeof import('./messages/ja.json');
type Locale = (typeof routing.locales)[number];

const messagesCache: Map<Locale, Messages> = new Map();
const messageLoaders: Record<Locale, () => Promise<Messages>> = {
    ja: async () => (await import('./messages/ja.json')).default,
    en: async () => (await import('./messages/en.json')).default,
};

function isSupportedLocale(locale: string): locale is Locale {
    return routing.locales.some((supportedLocale) => supportedLocale === locale);
}

export default getRequestConfig(async ({ requestLocale }) => {
    const requestedLocale = await requestLocale;
    const locale = requestedLocale && isSupportedLocale(requestedLocale)
        ? requestedLocale
        : routing.defaultLocale;

    // Cache messages to avoid redundant dynamic imports and reduce memory usage
    let messages = messagesCache.get(locale);
    if (!messages) {
        messages = await messageLoaders[locale]();
        messagesCache.set(locale, messages);
    }

    return {
        locale,
        messages
    };
});
