'use client';

import { useWebPush } from '@/hooks/useWebPush';
import { useState, useEffect } from 'react';

export default function PushNotificationManager() {
    const { isSupported, permission, subscription, subscribeToPush } = useWebPush();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // Only show if:
        // 1. Supported
        // 2. Permission is 'default' (not explicitly denied or granted yet)
        // 3. Not already subscribed (redundant check but safe)
        // 4. User hasn't dismissed it previously
        if (isSupported && permission === 'default' && !subscription) {
            const hasDismissed = localStorage.getItem('push_notification_dismissed');
            if (!hasDismissed) {
                // Determine if this is "first access" - we can assume if they haven't dismissed it, show it.
                // Small delay to not be aggressive
                const timer = setTimeout(() => setIsOpen(true), 3000);
                return () => clearTimeout(timer);
            }
        } else {
            setIsOpen(false);
        }
    }, [isSupported, permission, subscription]);

    const handleEnable = async () => {
        const success = await subscribeToPush();
        if (success) {
            setIsOpen(false);
        }
    };

    const handleDismiss = () => {
        setIsOpen(false);
        localStorage.setItem('push_notification_dismissed', 'true');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-xl shadow-lg border border-indigo-100 p-4 z-50 animate-in slide-in-from-bottom duration-500">
            <div className="flex items-start gap-3">
                <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                </div>
                <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 text-sm">Enable Notifications?</h4>
                    <p className="text-xs text-gray-600 mt-1">
                        Get instant updates when you earn new badges and move up the leaderboard!
                    </p>
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={handleEnable}
                            className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            Enable
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="text-gray-500 text-xs font-semibold px-3 py-1.5 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Possibly Later
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
