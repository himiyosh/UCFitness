'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProfileFormProps {
    initialName: string;
}

export default function ProfileForm({ initialName }: ProfileFormProps) {
    const [name, setName] = useState(initialName);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            const response = await fetch('/api/user/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name }),
            });

            if (!response.ok) {
                throw new Error('Failed to update profile');
            }

            setMessage({ text: 'Updated!', type: 'success' });
            router.refresh();
        } catch (error) {
            console.error(error);
            setMessage({ text: 'Failed to save.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="w-full">
            <div className="flex gap-2 items-center">
                <input
                    type="text"
                    name="name"
                    id="name"
                    required
                    maxLength={50}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary)] sm:text-sm sm:leading-6"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Display Name"
                />
                <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-md bg-[var(--theme-primary)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--theme-primary)] disabled:opacity-50 whitespace-nowrap"
                >
                    Save
                </button>
            </div>
            {message && (
                <p className={`mt-1 text-xs ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {message.text}
                </p>
            )}
        </form>
    );
}
