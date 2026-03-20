import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/errors';

/**
 * アチーブメント進捗データ定義
 */
interface AchievementMilestone {
    itemCode: string;
    category: 'steps' | 'streak' | 'special';
    target: number;
    /** 現在の進捗値を返すためのキー */
    contextKey: 'totalSteps' | 'currentStreak' | 'ucBalance' | 'shopPurchaseCount' | 'groupCount';
}

const ACHIEVEMENT_MILESTONES: AchievementMilestone[] = [
    // 歩数マイルストーン
    { itemCode: 'title_first_step', category: 'steps', target: 1_000, contextKey: 'totalSteps' },
    { itemCode: 'title_stroll_master', category: 'steps', target: 100_000, contextKey: 'totalSteps' },
    { itemCode: 'title_marathon_runner', category: 'steps', target: 500_000, contextKey: 'totalSteps' },
    { itemCode: 'title_globe_trotter', category: 'steps', target: 1_000_000, contextKey: 'totalSteps' },
    { itemCode: 'title_moon_walker', category: 'steps', target: 5_000_000, contextKey: 'totalSteps' },
    { itemCode: 'title_galaxy_voyager', category: 'steps', target: 10_000_000, contextKey: 'totalSteps' },

    // ストリーク
    { itemCode: 'title_beyond_three', category: 'streak', target: 7, contextKey: 'currentStreak' },
    { itemCode: 'title_iron_will', category: 'streak', target: 30, contextKey: 'currentStreak' },
    { itemCode: 'title_unbreakable', category: 'streak', target: 100, contextKey: 'currentStreak' },
    { itemCode: 'title_legendary_streaker', category: 'streak', target: 365, contextKey: 'currentStreak' },

    // 特別
    { itemCode: 'title_uc_millionaire', category: 'special', target: 100_000, contextKey: 'ucBalance' },
    { itemCode: 'title_shopaholic', category: 'special', target: 5, contextKey: 'shopPurchaseCount' },
    { itemCode: 'title_team_player', category: 'special', target: 3, contextKey: 'groupCount' },
];

/**
 * ストリーク計算（title-achievement-service.ts と同じロジック）
 */
function calculateStreak(
    records: { date: string; steps: number }[],
    stepGoal: number,
    today: string
): number {
    if (records.length === 0) return 0;

    const stepsMap = new Map<string, number>();
    for (const r of records) {
        stepsMap.set(r.date, r.steps);
    }

    let streak = 0;
    const startDate = new Date(today + 'T00:00:00Z');

    for (let i = 0; i < records.length; i++) {
        const checkDate = new Date(startDate);
        checkDate.setUTCDate(checkDate.getUTCDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];

        const steps = stepsMap.get(dateStr);
        if (steps !== undefined && steps >= stepGoal) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
        return NextResponse.json({ error: 'userId is required and must be a valid UUID' }, { status: 400 });
    }

    try {
        // JSTの今日の日付
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const today = formatter.format(now);

        // 並列でデータ取得
        const [
            stepsResult,
            userResult,
            balanceResult,
            purchaseResult,
            groupResult,
            streakResult,
            ownedItemsResult,
        ] = await Promise.all([
            // 累計歩数
            supabaseAdmin
                .from('daily_steps')
                .select('steps')
                .eq('user_id', userId),
            // ユーザー設定（step_goal）
            supabaseAdmin
                .from('users')
                .select('step_goal')
                .eq('id', userId)
                .single(),
            // UC残高
            supabaseAdmin
                .from('coin_balances')
                .select('total_balance')
                .eq('user_id', userId)
                .maybeSingle(),
            // ショップ購入数
            supabaseAdmin
                .from('user_items')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId),
            // 参加グループ数
            supabaseAdmin
                .from('group_members')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId),
            // ストリーク計算用
            supabaseAdmin
                .from('daily_steps')
                .select('date, steps')
                .eq('user_id', userId)
                .order('date', { ascending: false })
                .limit(400),
            // 所持アイテム（達成済みチェック用）
            supabaseAdmin
                .from('user_items')
                .select('shop_items!inner(item_code)')
                .eq('user_id', userId),
        ]);

        const totalSteps = (stepsResult.data || []).reduce((sum, r) => sum + (r.steps || 0), 0);
        const stepGoal = userResult.data?.step_goal || 10000;
        const ucBalance = balanceResult.data?.total_balance || 0;
        const shopPurchaseCount = purchaseResult.count || 0;
        const groupCount = groupResult.count || 0;
        const currentStreak = calculateStreak(streakResult.data || [], stepGoal, today);

        // 所持アイテムコード一覧
        const ownedCodes = new Set<string>();
        for (const ui of (ownedItemsResult.data || [])) {
            const code = (ui as { shop_items?: { item_code?: string } }).shop_items?.item_code;
            if (code) ownedCodes.add(code);
        }

        // コンテキスト値マップ
        const contextValues: Record<string, number> = {
            totalSteps,
            currentStreak,
            ucBalance,
            shopPurchaseCount,
            groupCount,
        };

        // 各マイルストーンの進捗を計算
        const progress = ACHIEVEMENT_MILESTONES.map((milestone) => {
            const current = contextValues[milestone.contextKey] || 0;
            const earned = ownedCodes.has(milestone.itemCode);
            const percentage = Math.min(100, Math.round((current / milestone.target) * 100));

            return {
                itemCode: milestone.itemCode,
                category: milestone.category,
                target: milestone.target,
                current,
                percentage,
                earned,
            };
        });

        return NextResponse.json({ progress });
    } catch (error: unknown) {
        reportError('achievement-progress', error, { userId });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
