'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function SetupPage() {
    const { data: session, update } = useSession();
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsEmail, setNeedsEmail] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            if (session?.user) {
                // Check if email needs update
                if (session.user.email?.includes('@pending.setup')) {
                    setNeedsEmail(true);
                } else {
                    setEmail(session.user.email || '');
                }

                // Self-healing: Check if we are actually already set up in DB
                try {
                    const res = await fetch('/api/user/status');
                    const data = await res.json();

                    if (data.isSetup && data.username) {
                        console.log('User already set up within DB. repairing session...');
                        // Force session update
                        await update({
                            ...session,
                            user: {
                                ...session?.user,
                                email: data.email,
                                username: data.username
                            }
                        });
                        router.refresh();
                        router.push('/');
                    }
                } catch (e) {
                    console.error("Failed to check status", e);
                }
            }
        };

        checkStatus();
    }, [session, update, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/user/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    email: needsEmail ? email : undefined
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            // Force session update to reflect new email/username
            // This is crucial so middleware doesn't redirect back here
            await update({
                ...session,
                user: {
                    ...session?.user,
                    email: needsEmail ? email : session?.user?.email,
                    username: username // Optimistic update
                }
            });

            // Redirect to home
            router.refresh(); // Refresh middleware state
            router.push('/');

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!session) {
        return <div className="p-8">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Welcome to UCFitness!
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Please complete your profile to continue.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-400 p-4">
                                <div className="flex">
                                    <div className="ml-3">
                                        <p className="text-sm text-red-700">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                                Username (Required)
                            </label>
                            <div className="mt-1">
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="e.g. runner_01"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Only letters, numbers, and underscores.
                                </p>
                            </div>
                        </div>

                        {needsEmail && (
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                    Email Address (Required)
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        Your Fitbit account didn't provide an email. Please enter one.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                                {loading ? 'Saving...' : 'Complete Setup'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
