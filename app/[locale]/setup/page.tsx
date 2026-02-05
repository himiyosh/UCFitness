'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import ProfileImageEditor from "@/components/ProfileImageEditor";

export default function SetupPage() {
    const { data: session, update } = useSession();
    const router = useRouter();
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsEmail, setNeedsEmail] = useState(false);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [isCustomImage, setIsCustomImage] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            if (session?.user) {
                // Initialize image from session initially
                setCurrentImage(session.user.image || null);
                setName(session.user.name || '');

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

                    // Update local state with latest from DB
                    if (data.is_custom_image !== undefined) {
                        setIsCustomImage(data.is_custom_image);
                    }
                    if (data.username && !username) {
                        // If partial setup exists? or just grabbing info.
                        // Actually we want to check if FULLY setup.
                    }


                    if (data.isSetup && data.username) {
                        console.log('User already set up within DB. repairing session...');
                        // Force full reload to update session
                        window.location.href = '/';
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
                    name,
                    email: needsEmail ? email : undefined
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            if (data.merged) {
                // Account linked successfully.
                // We must sign out the "temp" session so the user can sign in with the real one (Fitbit logic will now find the real user)
                await signOut({ callbackUrl: '/' });
                return;
            }

            // Force session update to reflect new email/username
            // This is crucial so middleware doesn't redirect back here
            // Force full reload to update session and redirect home
            window.location.href = '/';

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
                {/* Avatar Selection */}
                <div className="mb-6 flex justify-center">
                    <ProfileImageEditor
                        initialImage={currentImage}
                        isCustom={isCustomImage}
                        onSuccess={async (newUrl) => {
                            if (newUrl) {
                                setCurrentImage(newUrl);
                                setIsCustomImage(true);
                            } else {
                                // Reset scenario
                                setIsCustomImage(false);
                                // Ideally fetch fitbit image again or reload
                                window.location.reload();
                            }
                            // Optimistically update session so header updates too
                            await update({
                                ...session,
                                user: {
                                    ...session?.user,
                                    image: newUrl || session?.user?.image
                                }
                            });
                        }}
                    >
                        <div className="relative group cursor-pointer">
                            <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-white shadow-lg bg-gray-100">
                                {currentImage ? (
                                    <img src={currentImage} alt="Profile" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-indigo-300 bg-indigo-50">
                                        {(session?.user?.name?.[0] || 'U')}
                                    </div>
                                )}
                            </div>
                            <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div className="absolute bottom-0 right-0 bg-indigo-600 rounded-full p-1.5 border-2 border-white shadow-sm">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                        </div>
                    </ProfileImageEditor>
                </div>

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
                                User ID (Username)
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


                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                Display Name
                            </label>
                            <div className="mt-1">
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    required
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. John Doe"
                                    maxLength={50}
                                />
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
            </div >
        </div >
    );
}

export const runtime = 'edge';
