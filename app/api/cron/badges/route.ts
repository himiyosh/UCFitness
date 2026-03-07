import { NextResponse } from 'next/server';
import { assignBadges } from '@/lib/services/badge-awards';
import { reportError } from '@/lib/errors';
import { Period } from '@/components/dashboard/LeaderboardTabs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// バッジ付与に対応する有効な期間タイプ
const VALID_PERIODS: Period[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

/**
 * GET /api/cron/badges?type=DAILY|WEEKLY|MONTHLY
 * Cloudflare Workers の Scheduled Handler から呼ばれるバッジ一括付与エンドポイント。
 * CRON_SECRET による認証が必要。
 *
 * - DAILY: 毎日 00:00 JST に実行 → 前日分のランキングバッジ + 個人実績バッジ
 * - WEEKLY: 毎週月曜 00:00 JST に実行 → 週間ランキングバッジ
 * - MONTHLY: 毎月1日 00:00 JST に実行 → 月間ランキングバッジ
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 🛡️ セキュリティチェック
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    // クエリパラメータから期間タイプを取得
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type')?.toUpperCase() as Period | undefined;

    if (!type || !VALID_PERIODS.includes(type)) {
        return NextResponse.json(
            { error: 'Bad Request', message: `type パラメータが不正です。有効な値: ${VALID_PERIODS.join(', ')}` },
            { status: 400 }
        );
    }

    try {
        // バッジはJST基準の「前日」に対して付与する
        // (00:00 JST に実行されるため、前日のデータが確定している)
        const yesterday = getYesterdayJST();

        console.log(`[Cron] Starting ${type} badge assignment for date: ${yesterday}...`);
        await assignBadges(type, yesterday);
        console.log(`[Cron] ${type} badge assignment completed.`);

        return NextResponse.json({
            success: true,
            message: `${type} バッジの付与が完了しました`,
            period: type,
            targetDate: yesterday,
            timestamp: new Date().toISOString(),
        });
    } catch (error: unknown) {
        reportError('cron/badges', error, { type });
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

/**
 * JSTの「昨日」を YYYY-MM-DD 形式で返す。
 * Cron は 00:00 JST に動くため、前日のデータを対象とする。
 */
function getYesterdayJST(): string {
    const now = new Date();
    // JSTに変換して1日前に戻す
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    jstNow.setUTCDate(jstNow.getUTCDate() - 1);

    const year = jstNow.getUTCFullYear();
    const month = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstNow.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
