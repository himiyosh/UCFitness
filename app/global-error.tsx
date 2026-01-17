'use client';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body>
                <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Critical System Error</h2>
                    <div className="bg-red-50 p-4 rounded-md mb-6 overflow-auto max-h-60 max-w-2xl">
                        <p className="text-sm font-mono text-red-800 whitespace-pre-wrap">{error.message}</p>
                    </div>
                    <button onClick={() => reset()} className="bg-blue-500 text-white px-4 py-2 rounded">
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
