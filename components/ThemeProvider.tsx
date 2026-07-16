'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { isTheme } from '@/lib/theme';

import type { ReactNode } from 'react';
import type { Theme } from '@/lib/theme';

export type { Theme } from '@/lib/theme';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    previewTheme: (theme: Theme) => void;
    clearThemePreview: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'ucfitness-theme';

interface ThemeProviderProps {
    children: ReactNode;
    initialTheme?: Theme;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>(initialTheme ?? 'classic');
    const [themePreview, setThemePreview] = useState<Theme | null>(null);
    const [mounted, setMounted] = useState(false);
    const activeTheme = themePreview ?? theme;

    useEffect(() => {
        // Load theme from localStorage
        const saved = localStorage.getItem(THEME_KEY);
        if (isTheme(saved)) {
            setThemeState(saved);
        } else if (initialTheme) {
            setThemeState(initialTheme);
        }
        setMounted(true);
    }, [initialTheme]);

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
