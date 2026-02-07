'use client';

import { useState, useEffect } from 'react';

export default function SplashScreen() {
    const [isVisible, setIsVisible] = useState(true);
    const [shouldRender, setShouldRender] = useState(true);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Check if splash has already been shown in this session
        const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');

        if (hasSeenSplash) {
            setIsVisible(false);
            setShouldRender(false);
            return;
        }

        // Mark as seen
        sessionStorage.setItem('hasSeenSplash', 'true');

        // Progress Counter Animation
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 2; // finish in roughly 1-1.5s
            });
        }, 20);

        // Start fade out
        const timer = setTimeout(() => {
            setIsVisible(false);
        }, 2500);

        // Unmount
        const unmountTimer = setTimeout(() => {
            setShouldRender(false);
        }, 3000);

        return () => {
            clearTimeout(timer);
            clearTimeout(unmountTimer);
            clearInterval(interval);
        };
    }, []);

    if (!shouldRender) return null;

    return (
        <div
            className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--theme-primary)] transition-opacity duration-500 ease-in-out overflow-hidden ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            {/* Speed Lines Effect */}
            <div className="absolute inset-0 opacity-10 animate-speed-lines">
                <div className="w-full h-full bg-[repeating-linear-gradient(90deg,transparent,transparent_50px,#ffffff_50px,#ffffff_51px)]" />
            </div>

            <div className="relative z-10 flex flex-col items-center">
                {/* Bouncing Shoe */}
                <div className="animate-bounce-run bg-white p-6 rounded-full shadow-lg mb-8 relative">
                    {/* Speed effect behind shoe */}
                    <div className="absolute -left-4 top-1/2 w-8 h-1 bg-white/50 rounded blur-sm transform -translate-y-1/2 animate-pulse" />

                    <svg
                        className="w-16 h-16 text-[var(--theme-primary)] transform -rotate-12"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path d="M2.273 5.625A4.483 4.483 0 015.25 4.5h2.756a2.5 2.5 0 012.396 1.9l.477 1.905a5 5 0 003.352 3.65L19.5 13.5a1.5 1.5 0 01.353 2.662l-3.78 2.016a5.001 5.001 0 01-3.67.31L6 17H5a2 2 0 01-2-2v-4.5a3.5 3.5 0 01-.727-4.875zM8 6a1 1 0 100 2 1 1 0 000-2z" />
                    </svg>
                </div>

                <h1 className="text-white text-3xl font-black italic tracking-tighter transform -skew-x-6">
                    GET MOVING!
                </h1>

                {/* Progress Bar / Steps */}
                <div className="mt-8 w-48">
                    <div className="flex justify-between text-xs font-bold text-[var(--theme-primary)]/40 mb-1 uppercase tracking-wider">
                        <span>Loading Steps...</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-2 bg-indigo-900/30 rounded-full overflow-hidden backdrop-blur-sm">
                        <div
                            className="h-full bg-white rounded-full transition-all duration-75 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
