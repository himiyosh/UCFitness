'use client';

import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButtons() {
    const { data: session } = useSession();

    if (session) {
        return (
            <div className="flex items-center gap-4">
                <p className="text-sm text-gray-600">Signed in as <strong>{session.user?.name || session.user?.email}</strong></p>
                <button
                    onClick={() => signOut()}
                    className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
                >
                    Sign out
                </button>
            </div>
        );
    }

    return (
        <div className="flex gap-4">
            <button
                onClick={() => signIn('fitbit')}
                className="rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-500"
            >
                Sign in with Fitbit
            </button>
        </div>
    );
}
