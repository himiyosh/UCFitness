export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getInvestorRank } from '@/lib/constants';
import { getJSTDateString } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

/**
 * 投資家ランク別のおすすめ検索キーワードマッピング
 * ユーザーのレベルに応じたフィットネスギアを提案
 */
const RANK_KEYWORDS: Record<string, string[]> = {
    BEGINNER: ['ウォーキングシューズ 初心者', 'フィットネス 入門', '万歩計', 'スポーツ水筒'],
    BUSINESS: ['ランニングシューズ', 'スマートウォッチ フィットネス', 'スポーツウェア', 'プロテイン'],
    FUND_MANAGER: ['ランニングウェア 上級', 'GPS スポーツウォッチ', 'フィットネスバンド', 'トレーニングウェア'],
    DIAMOND: ['高機能ランニングシューズ', 'ガーミン スマートウォッチ', 'コンプレッションウェア', 'マラソン 補給食'],
    TYCOON: ['ガーミン Forerunner', 'アシックス メタスピード', 'ランニング サングラス 偏光', 'リカバリーウェア'],
};

/**
 * 歩数レンジ別の追加キーワード
 * 平均歩数に応じてパーソナライズ
 */
const STEPS_KEYWORDS: { min: number; keywords: string[] }[] = [
    { min: 15000, keywords: ['マラソン ギア', 'トレイルランニング', '高機能インソール'] },
    { min: 10000, keywords: ['ランニング アクセサリー', 'スポーツイヤホン', 'ランニングポーチ'] },
    { min: 5000, keywords: ['ウォーキング グッズ', 'スポーツタオル', 'フィットネストラッカー'] },
    { min: 0, keywords: ['健康グッズ', 'ストレッチ 器具', 'ヨガマット'] },
];

/**
 * GET /api/amazon/personalized
 * ユーザーの投資家ランク + 直近歩数平均に応じたパーソナライズド検索クエリを返す
 */
export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const today = getJSTDateString();
    const todayDate = new Date(`${today}T00:00:00Z`);
    const twoWeeksAgo = new Date(todayDate);
    twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 14);
    const startDate = twoWeeksAgo.toISOString().split('T')[0];

    // ユーザーの投資家ランク + 直近歩数を並列取得
    const [balanceResult, stepsResult] = await Promise.all([
        supabaseAdmin
            .from('coin_balances')
            .select('total_earned, investor_rank')
            .eq('user_id', userId)
            .single(),
        supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', today),
    ]);

    const totalEarned = balanceResult.data?.total_earned || 0;
    const rank = getInvestorRank(totalEarned);
    const stepsData = stepsResult.data || [];
    const avgSteps = stepsData.length > 0
        ? Math.round(stepsData.reduce((sum, r) => sum + r.steps, 0) / stepsData.length)
        : 0;

    // ランク別キーワード
    const rankKws = RANK_KEYWORDS[rank.rank] || RANK_KEYWORDS['BEGINNER'];

    // 歩数レンジ別追加キーワード
    let stepsKws: string[] = [];
    for (const range of STEPS_KEYWORDS) {
        if (avgSteps >= range.min) {
            stepsKws = range.keywords;
            break;
        }
    }

    // ランダムに1つずつ選ぶ
    const seed = parseInt(today.replace(/-/g, ''), 10);
    const primaryKeyword = rankKws[seed % rankKws.length];
    const secondaryKeyword = stepsKws[seed % stepsKws.length];

    return NextResponse.json({
        rank: rank.rank,
        rankLabel: rank.labelJa,
        rankIcon: rank.icon,
        avgSteps,
        primaryKeyword,
        secondaryKeyword,
        allKeywords: [...rankKws, ...stepsKws],
    });
}
