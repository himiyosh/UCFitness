'use client'; // Error components must be Client Components

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full">
                <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong!</h2>
                <div className="bg-red-50 p-4 rounded-md mb-6 overflow-auto max-h-60">
                    <p className="text-sm font-mono text-red-800 whitespace-pre-wrap">{error.message}</p>
                    {error.digest && <p className="text-xs text-gray-500 mt-2">Digest: {error.digest}</p>}
                </div>
                <button
                    onClick={
                        // Attempt to recover by trying to re-render the segment
                        () => reset()
                    }
                    className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded hover:bg-indigo-700 transition"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
