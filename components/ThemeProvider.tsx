'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'classic' | 'pop' | 'midnight' | 'sakura' | 'ocean' | 'forest' | 'sunset' | 'cyberpunk';

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
        const validThemes: Theme[] = ['classic', 'pop', 'midnight', 'sakura', 'ocean', 'forest', 'sunset', 'cyberpunk'];
        if (saved && validThemes.includes(saved)) {
            setThemeState(saved);
        }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        // Apply theme to document
        if (theme === 'classic') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }

        // Save to localStorage
        localStorage.setItem(THEME_KEY, theme);
    }, [theme, mounted]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    // Prevent flash of wrong theme — still provide context for child components
    if (!mounted) {
        return (
            <ThemeContext.Provider value={{ theme, setTheme }}>
                {children}
            </ThemeContext.Provider>
        );
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
