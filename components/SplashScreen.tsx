'use client';

import { useState, useEffect } from 'react';

export default function SplashScreen() {
    const [isVisible, setIsVisible] = useState(true);
    const [shouldRender, setShouldRender] = useState(true);

    useEffect(() => {
        // Only run once per session to avoid annoyance
        // const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
        // if (hasSeenSplash) {
        //     setShouldRender(false);
        //     return;
        // }

        // Start fade out after 1.5s
        const timer = setTimeout(() => {
            setIsVisible(false);
            // sessionStorage.setItem('hasSeenSplash', 'true');
        }, 1500);

        // Unmount after fade out (1.5s + 0.5s fade)
        const unmountTimer = setTimeout(() => {
            setShouldRender(false);
        }, 2000);

        return () => {
            clearTimeout(timer);
            clearTimeout(unmountTimer);
        };
    }, []);

    if (!shouldRender) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 transition-opacity duration-500 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            <div className="flex flex-col items-center">
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 bg-white rounded-3xl shadow-xl flex items-center justify-center animate-pulse-gentle">
                    <svg
                        className="w-12 h-12 sm:w-16 sm:h-16 text-indigo-600"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path d="M13 10V3L4 14H11V21L20 10H13Z" />
                    </svg>
                </div>
                <h1 className="mt-6 text-white text-2xl font-black tracking-tight animate-fade-in-up">
                    UCFitness
                </h1>
            </div>
        </div>
    );
}
