'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Spinner from '@/components/ui/Spinner';

interface UsernameFormProps {
    initialUsername?: string;
    isOnboarding?: boolean;
}

export default function UsernameForm({ initialUsername = '', isOnboarding = false }: UsernameFormProps) {
    const [username, setUsername] = useState(initialUsername || '');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();

    const handleSave = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedUsername = username.trim();

        if (!trimmedUsername) {
            setMessage({ text: 'Username is required.', type: 'error' });
            return;
        }
        if (trimmedUsername.length < 3) {
            setMessage({ text: 'Username must be at least 3 characters.', type: 'error' });
            return;
        }

        setIsSaving(true);
        setMessage(null);

        try {
            const response = await fetch('/api/user/username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: trimmedUsername }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update User ID');
            }

            setMessage({ text: 'Updated!', type: 'success' });

            if (isOnboarding) {
                router.replace('/');
            } else {
                router.refresh();
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Failed to save.';
            setMessage({ text: msg, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    }, [username, isOnboarding, router]);

    return (
        <form onSubmit={handleSave} className="w-full space-y-2">
            <div>
                <label htmlFor="username" className="sr-only">Username</label>
                <div className="flex gap-2 items-center">
                    {!isOnboarding && <span className="text-gray-400 select-none" aria-hidden="true">@</span>}
                    <input
                        type="text"
                        name="username"
                        id="username"
                        required
                        minLength={3}
                        pattern="[a-zA-Z0-9_]+"
                        title="Only letters, numbers, and underscores allowed."
                        maxLength={20}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary)] sm:text-sm sm:leading-6"
                        placeholder="e.g. user_123"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        aria-describedby="username-message"
                    />
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="rounded-md bg-[var(--theme-primary)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--theme-primary)]/90 disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5 transition-colors"
                    >
                        {isSaving && <Spinner size="xs" />}
                        {isOnboarding ? 'Next' : 'Save'}
                    </button>
                </div>
            </div>

            <div id="username-message" role="status" aria-live="polite">
                {message && (
                    <p className={`text-xs ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {message.text}
                    </p>
                )}
            </div>
        </form>
    );
}
