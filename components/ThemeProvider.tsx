'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import type { ReactNode } from 'react';

export type Theme = 'classic' | 'pop' | 'midnight' | 'sakura' | 'ocean' | 'forest' | 'sunset' | 'cyberpunk' | 'galaxy';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    previewTheme: (theme: Theme) => void;
    clearThemePreview: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'ucfitness-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('classic');
    const [themePreview, setThemePreview] = useState<Theme | null>(null);
    const [mounted, setMounted] = useState(false);
    const activeTheme = themePreview ?? theme;

    useEffect(() => {
        // Load theme from localStorage
        const saved = localStorage.getItem(THEME_KEY) as Theme | null;
        const validThemes: Theme[] = ['classic', 'pop', 'midnight', 'sakura', 'ocean', 'forest', 'sunset', 'cyberpunk', 'galaxy'];
        if (saved && validThemes.includes(saved)) {
            setThemeState(saved);
        }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        // Apply theme to document
        if (activeTheme === 'classic') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', activeTheme);
        }
    }, [activeTheme, mounted]);

    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        setThemePreview(null);
        localStorage.setItem(THEME_KEY, newTheme);
    }, []);
    const previewTheme = useCallback((newTheme: Theme) => setThemePreview(newTheme), []);
    const clearThemePreview = useCallback(() => setThemePreview(null), []);

    // Prevent flash of wrong theme — still provide context for child components
    if (!mounted) {
        return (
            <ThemeContext.Provider value={{ theme: activeTheme, setTheme, previewTheme, clearThemePreview }}>
                {children}
            </ThemeContext.Provider>
        );
    }

    return (
        <ThemeContext.Provider value={{ theme: activeTheme, setTheme, previewTheme, clearThemePreview }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
