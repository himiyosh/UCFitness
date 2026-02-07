'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'classic' | 'pop' | 'midnight';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'ucfitness-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('classic');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Load theme from localStorage
        const saved = localStorage.getItem(THEME_KEY) as Theme | null;
        if (saved && (saved === 'classic' || saved === 'pop' || saved === 'midnight')) {
            setThemeState(saved);
        }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        // Apply theme to document
        if (theme === 'pop') {
            document.documentElement.setAttribute('data-theme', 'pop');
        } else if (theme === 'midnight') {
            document.documentElement.setAttribute('data-theme', 'midnight');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        // Save to localStorage
        localStorage.setItem(THEME_KEY, theme);
    }, [theme, mounted]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    // Prevent flash of wrong theme
    if (!mounted) {
        return <>{children}</>;
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
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
