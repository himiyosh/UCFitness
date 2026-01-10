'use client';

import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButtons() {
    const { data: session } = useSession();

    if (session) return null;


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
