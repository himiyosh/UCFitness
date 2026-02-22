export const runtime = 'edge';

import { supabaseAdmin } from '@/lib/supabase';
import { auth } from "@/lib/auth";
import AuthButtons from '@/components/AuthButtons';

export const dynamic = 'force-dynamic';

export default async function FitbitDebugPage() {
    const session = await auth();

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

    // セキュリティ: 本番環境ではデバッグページを無効化
    if (process.env.NODE_ENV === 'production') {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold mb-4">Debug Page Disabled</h1>
                <p className="text-red-500">This debug page is not available in production.</p>
            </div>
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    // セキュリティ: userIdで検索（emailではなくIDOR防止）
    const { data: user } = await supabaseAdmin
        .from('users')
        .select('provider, email')
        .eq('id', userId)
        .single();

    if (!user) {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold mb-4">User DB Check Failed</h1>
                <p>DB User Found: No</p>
            </div>
        );
    }

    if (user.provider !== 'fitbit') {
        return <div>Provider is {user.provider}, not fitbit.</div>;
    }

    // セキュリティ: access_tokenはサーバーサイドのみで使用し、フロントに露出させない
    const { data: tokenData } = await supabaseAdmin
        .from('users')
        .select('access_token')
        .eq('id', userId)
        .single();

    if (!tokenData?.access_token) {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold mb-4">Access Token Missing</h1>
                <p>No access token found in DB.</p>
            </div>
        );
    }

    const date = new Date().toISOString().split('T')[0];
    const res = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`, {
        headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
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
                <p><strong>Access Token:</strong> [REDACTED]</p>
            </div>
            <pre className="bg-gray-100 p-4 rounded overflow-auto text-gray-800">
                {JSON.stringify({
                    status: res.status,
                    statusText: res.statusText,
                    body: json
                }, null, 2)}
            </pre>
        </div>
    );
}
