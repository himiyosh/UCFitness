const OFFICIAL_AMAZON_HOSTS = [
    "amazon.com",
    "amazon.co.jp",
    "amazon.co.uk",
    "amazon.de",
    "amazon.fr",
    "amazon.ca",
    "amzn.to",
] as const;

export function isOfficialAmazonHost(hostname: string): boolean {
    const normalizedHostname = hostname.toLowerCase();
    return OFFICIAL_AMAZON_HOSTS.some(
        (host) => normalizedHostname === host || normalizedHostname.endsWith(`.${host}`),
    );
}

export function isOfficialAmazonUrl(url: URL): boolean {
    return url.protocol === "https:" && isOfficialAmazonHost(url.hostname);
}
