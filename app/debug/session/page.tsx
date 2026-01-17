import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export default async function SessionDebugPage() {
    const session = await getServerSession(authOptions);

    let dbUser = null;
    let stepsRecord = null;
    const today = new Date().toISOString().split('T')[0];

    if (session?.user?.email) {
        // 1. Fetch DB User
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single();
        dbUser = user;

        // 2. Fetch Steps using DB ID (if found)
        if (user) {
            const { data: steps } = await supabaseAdmin
                .from('daily_steps')
                .select('*')
                .eq('user_id', user.id)
                .eq('date', today)
                .single();
            stepsRecord = steps;
        }
    }

    return (
        <div className="p-8 text-gray-900 bg-white min-h-screen">
            <h1 className="text-2xl font-bold mb-6">Session & ID Debug</h1>

            <div className="grid gap-6">
                <div className="border p-4 rounded bg-gray-50">
                    <h2 className="font-bold border-b pb-2 mb-2">1. NextAuth Session Data</h2>
                    <pre className="text-xs overflow-auto">
                        {JSON.stringify(session, null, 2)}
                    </pre>
                    <div className="mt-2 text-sm">
                        <p><strong>User ID in Session:</strong> {(session?.user as any)?.id || 'UNDEFINED'}</p>
                        <p><strong>Email in Session:</strong> {session?.user?.email || 'UNDEFINED'}</p>
                    </div>
                </div>

                <div className="border p-4 rounded bg-gray-50">
                    <h2 className="font-bold border-b pb-2 mb-2">2. Database User Lookup</h2>
                    {dbUser ? (
                        <div className="text-sm">
                            <p><strong>Found User:</strong> Yes</p>
                            <p><strong>DB ID (UUID):</strong> {dbUser.id}</p>
                            <p><strong>Email:</strong> {dbUser.email}</p>
                            <p><strong>Provider:</strong> {dbUser.provider}</p>
                        </div>
                    ) : (
                        <p className="text-red-500">User not found in DB by email search!</p>
                    )}
                </div>

                <div className="border p-4 rounded bg-gray-50">
                    <h2 className="font-bold border-b pb-2 mb-2">3. Steps Table Lookup</h2>
                    <p className="text-xs mb-2">Querying for Date: {today}</p>
                    {stepsRecord ? (
                        <div className="text-sm">
                            <p><strong>Found Steps:</strong> Yes</p>
                            <p><strong>Steps:</strong> {stepsRecord.steps}</p>
                            <p><strong>User ID:</strong> {stepsRecord.user_id}</p>
                        </div>
                    ) : (
                        <p className="text-red-500">No steps record found for this DB User ID.</p>
                    )}
                </div>

                <div className="bg-yellow-50 p-4 border border-yellow-200 rounded">
                    <h3 className="font-bold text-yellow-800">Diagnosis</h3>
                    <p className="text-sm mt-1">
                        {!session ? "No session. Sign in first." :
                            !dbUser ? "Session exists but DB user missing. Email mismatch?" :
                                !stepsRecord ? "User exists but steps missing. Refresh required?" :
                                    (session?.user as any)?.id !== dbUser.id ?
                                        <span className="text-red-600 font-bold">CRITICAL: Session ID ({(session?.user as any)?.id}) does not match DB ID ({dbUser.id}). "My Stats" will fail.</span> :
                                        <span className="text-green-600 font-bold">IDs match. "My Stats" should work.</span>
                        }
                    </p>
                </div>
            </div>
        </div>
    );
}

export const runtime = 'edge';
