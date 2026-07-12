export const THEMES = [
    'classic',
    'pop',
    'midnight',
    'sakura',
    'ocean',
    'forest',
    'sunset',
    'cyberpunk',
    'galaxy',
] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_BY_ITEM_CODE: Readonly<Record<string, Theme>> = {
    theme_classic: 'classic',
    theme_pop: 'pop',
    theme_midnight: 'midnight',
    theme_sakura: 'sakura',
    theme_ocean: 'ocean',
    theme_forest: 'forest',
    theme_sunset: 'sunset',
    theme_cyberpunk: 'cyberpunk',
    theme_galaxy: 'galaxy',
};

export function isTheme(value: unknown): value is Theme {
    return typeof value === 'string' && THEMES.some((theme) => theme === value);
}

export function getThemeFromItemCode(itemCode: string | null | undefined): Theme | null {
    return itemCode ? THEME_BY_ITEM_CODE[itemCode] ?? null : null;
}
