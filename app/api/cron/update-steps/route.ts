import { NextResponse } from 'next/server';
import { updateAllUserSteps } from '@/lib/services/step-manager';
import { reportError } from '@/lib/errors';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/update-steps
 * Cloudflare Workers の Scheduled Handler から呼ばれる全ユーザー歩数同期エンドポイント。
 * CRON_SECRET による認証が必要。
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 🛡️ セキュリティチェック: CRON_SECRET が未設定 or ヘッダー不一致なら拒否
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        console.log('[Cron] Starting step sync for all users...');
        await updateAllUserSteps();
        console.log('[Cron] Step sync completed.');

        return NextResponse.json({
            success: true,
            message: '全ユーザーの歩数同期が完了しました',
            timestamp: new Date().toISOString(),
        });
    } catch (error: unknown) {
        reportError('cron/update-steps', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
