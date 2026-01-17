import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import AuthButtons from '@/components/AuthButtons';

export const dynamic = 'force-dynamic';

export default async function FitbitDebugPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold mb-4">Fitbit Raw Data Debug</h1>
                <div className="bg-yellow-100 p-4 rounded mb-4">
                    <p className="font-bold text-yellow-800">Not logged in</p>
                    <p className="text-sm">Please sign in again to debug.</p>
                </div>
                <AuthButtons />
                <div className="mt-8">
                    <p>Session Debug:</p>
                    <pre>{JSON.stringify(session, null, 2)}</pre>
                </div>
            </div>
        );
    }

    // Get token from DB
    const { data: user } = await supabaseAdmin
        .from('users')
        .select('access_token, provider, email')
        .eq('email', session.user.email)
        // Note: this relies on session email matching DB email. 
        // If session has "dummy", and DB has "dummy", it matches.
        // If session has real email (if next-auth had it) and DB has dummy... mismatch?
        // Actually, in auth.ts callback, we set the profile email to the dummy if null.
        // NextAuth session token usually keeps what was returned in the callback.
        // So session.user.email SHOULD be the dummy one.
        .single();

    if (!user || !user.access_token) {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold mb-4">User DB Check Failed</h1>
                <p>Session Email: {session.user.email}</p>
                <p>DB User Found: {user ? 'Yes' : 'No'}</p>
                <p>Access Token: {user?.access_token ? 'Present' : 'Missing'}</p>
                <pre className="bg-gray-100 p-4 mt-4">{JSON.stringify(user, null, 2)}</pre>
            </div>
        );
    }

    if (user.provider !== 'fitbit') {
        return <div>Provider is {user.provider}, not fitbit.</div>;
    }

    const date = new Date().toISOString().split('T')[0];
    const res = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`, {
        headers: {
            Authorization: `Bearer ${user.access_token}`,
        },
    });

    const text = await res.text();
    let json = {};
    try {
        json = JSON.parse(text);
    } catch { }

    return (
        <div className="p-8 text-white">
            <h1 className="text-2xl font-bold mb-4">Fitbit Raw Data Debug</h1>
            <div className="mb-4">
                <p><strong>DB User:</strong> {user.email}</p>
                <p><strong>Provider:</strong> {user.provider}</p>
            </div>
            <pre className="bg-gray-100 p-4 rounded overflow-auto text-gray-800">
                {JSON.stringify({
                    status: res.status,
                    statusText: res.statusText,
                    headers: Object.fromEntries(res.headers.entries()),
                    body: json
                }, null, 2)}
            </pre>
        </div>
    );
}

export const runtime = 'edge';
