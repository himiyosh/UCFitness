import { getRequestConfig } from 'next-intl/server';
import { routing } from './navigation';

const messagesCache: Map<string, any> = new Map();

export default getRequestConfig(async ({ requestLocale }) => {
    let locale = await requestLocale;

    if (!locale || !routing.locales.includes(locale as any)) {
        locale = routing.defaultLocale;
    }

    // Cache messages to avoid redundant dynamic imports and reduce memory usage
    let messages = messagesCache.get(locale);
    if (!messages) {
        messages = (await import(`./messages/${locale}.json`)).default;
        messagesCache.set(locale, messages);
    }

    return {
        locale,
        messages
    };
});

