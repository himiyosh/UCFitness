export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getInvestorRank } from '@/lib/constants';
import { getJSTDateString } from '@/lib/date-utils';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const UNAVAILABLE_BODY = { error: 'Personalized recommendations unavailable' };

/**
 * 投資家ランク別のおすすめ検索キーワードマッピング
 * ユーザーのレベルに応じたフィットネスギアを提案
 */
const RANK_KEYWORDS = {
    BEGINNER: ['ウォーキングシューズ 初心者', 'フィットネス 入門', '万歩計', 'スポーツ水筒'],
    BUSINESS: ['ランニングシューズ', 'スマートウォッチ フィットネス', 'スポーツウェア', 'プロテイン'],
    FUND_MANAGER: ['ランニングウェア 上級', 'GPS スポーツウォッチ', 'フィットネスバンド', 'トレーニングウェア'],
    DIAMOND: ['高機能ランニングシューズ', 'ガーミン スマートウォッチ', 'コンプレッションウェア', 'マラソン 補給食'],
    TYCOON: ['ガーミン Forerunner', 'アシックス メタスピード', 'ランニング サングラス 偏光', 'リカバリーウェア'],
} as const;

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

interface PersonalizedRank {
    rank: keyof typeof RANK_KEYWORDS;
    labelJa: string;
    icon: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseTotalEarned(value: unknown): number | null {
    if (value === null) {
        return 0;
    }
    return isRecord(value) && isNonnegativeSafeInteger(value.total_earned)
        ? value.total_earned
        : null;
}

function calculateAverageSteps(value: unknown): number | null {
    if (!Array.isArray(value)) {
        return null;
    }

    let totalSteps = 0;
    for (const row of value) {
        if (!isRecord(row) || !isNonnegativeSafeInteger(row.steps)) {
            return null;
        }
        totalSteps += row.steps;
        if (!Number.isSafeInteger(totalSteps)) {
            return null;
        }
    }

    return value.length === 0 ? 0 : Math.round(totalSteps / value.length);
}

function isPersonalizedRank(value: unknown): value is PersonalizedRank {
    return isRecord(value)
        && typeof value.rank === 'string'
        && Object.prototype.hasOwnProperty.call(RANK_KEYWORDS, value.rank)
        && typeof value.labelJa === 'string'
        && value.labelJa.length > 0
        && typeof value.icon === 'string'
        && value.icon.length > 0;
}

function unavailableResponse(): NextResponse {
    return NextResponse.json(UNAVAILABLE_BODY, { status: 503 });
}

function reportUnavailable(operation: string, message: string): NextResponse {
    reportError(operation, new Error(message));
    return unavailableResponse();
}

/**
 * GET /api/amazon/personalized
 * ユーザーの投資家ランク + 直近歩数平均に応じたパーソナライズド検索クエリを返す
 */
async function getPersonalizedResponse(): Promise<NextResponse> {
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

    const [balanceResult, stepsResult] = await Promise.all([
        supabaseAdmin
            .from('coin_balances')
            .select('total_earned')
            .eq('user_id', userId)
            .maybeSingle(),
        supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', today),
    ]);

    if (balanceResult.error !== null) {
        return reportUnavailable(
            'amazon-personalized:balance-query',
            'Personalized balance query failed',
        );
    }
    if (stepsResult.error !== null) {
        return reportUnavailable(
            'amazon-personalized:steps-query',
            'Personalized steps query failed',
        );
    }

    const totalEarned = parseTotalEarned(balanceResult.data);
    if (totalEarned === null) {
        return reportUnavailable(
            'amazon-personalized:balance-data',
            'Invalid personalized balance data',
        );
    }

    const avgSteps = calculateAverageSteps(stepsResult.data);
    if (avgSteps === null) {
        return reportUnavailable(
            'amazon-personalized:steps-data',
            'Invalid personalized steps data',
        );
    }

    const rank = getInvestorRank(totalEarned);
    if (!isPersonalizedRank(rank)) {
        return reportUnavailable(
            'amazon-personalized:rank-data',
            'Invalid personalized rank data',
        );
    }

    const rankKws = RANK_KEYWORDS[rank.rank];
    const stepsKws = STEPS_KEYWORDS.find((range) => avgSteps >= range.min)?.keywords;
    if (!stepsKws || stepsKws.length === 0) {
        return reportUnavailable(
            'amazon-personalized:keyword-data',
            'Invalid personalized keyword data',
        );
    }

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

export async function GET(): Promise<NextResponse> {
    try {
        return await getPersonalizedResponse();
    } catch {
        return reportUnavailable(
            'amazon-personalized:unexpected',
            'Personalized recommendation request failed',
        );
    }
}
