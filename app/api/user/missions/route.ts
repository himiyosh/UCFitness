export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString } from '@/lib/date-utils';
import { reportError } from '@/lib/errors';
import { evaluateMission, generateDailyMissions } from '@/lib/services/mission-utils';

export const dynamic = 'force-dynamic';

class MissionRewardWriteError extends Error {
    constructor() {
        super('Mission reward write failed');
        this.name = 'MissionRewardWriteError';
    }
}

/**
 * GET /api/user/missions
 * 今日のデイリーミッション一覧を参照専用で取得する。
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const today = getJSTDateString();

    // 今日のミッションが既にあるか確認
    const { data: existingMissions, error: fetchError } = await supabaseAdmin
        .from('daily_missions')
        .select('id, mission_type, title, description, reward_uc, is_completed, completed_at')
        .eq('user_id', userId)
        .eq('date', today)
        .order('mission_type', { ascending: true });

    if (fetchError) {
        reportError('user/missions:GET:fetch', fetchError, { userId });
        return NextResponse.json({ error: 'ミッション取得失敗' }, { status: 503 });
    }

    const missions = existingMissions ?? [];
    const allCompleted = missions.length > 0 && missions.every(m => m.is_completed);

    // ミッション連続達成ストリークを計算
    const streak = await calculateMissionStreak(userId, today);

    return NextResponse.json({
        missions,
        date: today,
        allCompleted,
        streak,
        streakUnavailable: streak === null,
    });
  } catch (err) {
    reportError('user/missions:GET', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/user/missions
 * ミッション再チェックをトリガー（手動完了は不可、自動判定のみ）
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    // action: 'refresh' — ミッション状態を再評価
    if (action !== 'refresh') {
        return NextResponse.json({ error: '手動でのミッション完了は許可されていません' }, { status: 403 });
    }

    const today = getJSTDateString();

    // 今日のミッションを取得
    const { data: existingMissions, error: fetchError } = await supabaseAdmin
        .from('daily_missions')
        .select('id, mission_type, title, description, reward_uc, is_completed, completed_at')
        .eq('user_id', userId)
        .eq('date', today)
        .order('mission_type', { ascending: true });

    if (fetchError) {
        reportError('user/missions:POST:fetch', fetchError, { userId });
        return NextResponse.json({ error: 'ミッション取得失敗' }, { status: 503 });
    }

    let missions = existingMissions ?? [];

    if (missions.length === 0) {
        const recentStartDate = shiftDate(today, -7);
        const { data: recentSteps, error: recentStepsError } = await supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId)
            .gte('date', recentStartDate)
            .lt('date', today);

        if (recentStepsError) {
            reportError('user/missions:POST:recent-steps', recentStepsError, { userId });
            return NextResponse.json({ error: 'ミッション生成用歩数の取得失敗' }, { status: 503 });
        }
        const recentAverageSteps = Math.round(
            (recentSteps ?? []).reduce((sum, row) => sum + (row.steps ?? 0), 0) / 7,
        );
        const generated = generateDailyMissions(today, recentAverageSteps);
        const { data: created, error: createError } = await supabaseAdmin
            .from('daily_missions')
            .insert(generated.map(mission => ({
                user_id: userId,
                date: today,
                mission_type: mission.type,
                title: mission.title,
                description: mission.description,
                reward_uc: mission.rewardUc,
                is_completed: false,
            })))
            .select('id, mission_type, title, description, reward_uc, is_completed, completed_at');

        if (createError) {
            reportError('user/missions:POST:create', createError, { userId });
            return NextResponse.json({ error: 'ミッション生成失敗' }, { status: 503 });
        }
        missions = created ?? [];
    }

    // 今日の歩数を取得
    const { data: stepData, error: stepError } = await supabaseAdmin
        .from('daily_steps')
        .select('steps')
        .eq('user_id', userId)
        .eq('date', today)
        .single();

    if (stepError && stepError.code !== 'PGRST116') {
        reportError('user/missions:POST:steps', stepError, { userId });
        return NextResponse.json({ error: '歩数取得失敗' }, { status: 503 });
    }
    const todaySteps = stepData?.steps ?? 0;

    let newlyCompleted = 0;

    // 未完了ミッションを自動判定
    for (const mission of missions) {
        if (mission.is_completed) continue;

        const achieved = evaluateMission(mission.mission_type, todaySteps);
        if (achieved) {
            await completeMissionAndReward(userId, mission.id, mission.reward_uc, today);
            mission.is_completed = true;
            mission.completed_at = new Date().toISOString();
            newlyCompleted++;
        }
    }

    const allCompleted = missions.every(m => m.is_completed);

    // 全達成ボーナス
    let bonusAwarded = false;
    if (allCompleted && newlyCompleted > 0) {
        await awardAllCompletedBonus(userId, today);
        bonusAwarded = true;
    }

    const streak = await calculateMissionStreak(userId, today);

    return NextResponse.json({
        success: true,
        missions,
        allCompleted,
        streak,
        streakUnavailable: streak === null,
        newlyCompleted,
        bonusAwarded,
        bonusUc: bonusAwarded ? 100 : 0,
    });
  } catch (err) {
    if (err instanceof MissionRewardWriteError) {
        return NextResponse.json(
            { error: 'ミッション報酬の反映に失敗しました', code: 'MISSION_REWARD_DATABASE_ERROR' },
            { status: 503 },
        );
    }
    reportError('user/missions:POST', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/** ミッション完了処理 + 報酬UC付与 */
async function completeMissionAndReward(
    userId: string,
    missionId: string,
    rewardUc: number,
    date: string,
): Promise<void> {
    // 報酬UCを付与（冪等性キーで重複防止）
    const { error: txError } = await supabaseAdmin
        .from('coin_transactions')
        .insert({
            user_id: userId,
            date,
            type: 'MISSION_REWARD',
            amount: rewardUc,
            description: 'デイリーミッション報酬',
            idempotency_key: `mission:${missionId}`,
        });

    if (txError) {
        reportError('user/missions:completeMission:transaction', txError, { missionId, rewardUc });
        throw new MissionRewardWriteError();
    }

    const { data: balanceData, error: balanceError } = await supabaseAdmin
        .from('coin_balances')
        .select('total_balance, total_bonus')
        .eq('user_id', userId)
        .single();

    if (balanceError) {
        reportError('user/missions:completeMission:balance', balanceError, { userId });
        throw new MissionRewardWriteError();
    }

    if (!balanceData) {
        reportError('user/missions:completeMission:balanceMissing', new Error('Coin balance not found'), { userId });
        throw new MissionRewardWriteError();
    }

    const { error: balanceUpdateError } = await supabaseAdmin
        .from('coin_balances')
        .update({
            total_balance: balanceData.total_balance + rewardUc,
            total_bonus: balanceData.total_bonus + rewardUc,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

    if (balanceUpdateError) {
        reportError('user/missions:completeMission:balanceUpdate', balanceUpdateError, { userId, rewardUc });
        throw new MissionRewardWriteError();
    }

    // 台帳と残高が反映された後にだけミッションを完了扱いにする。
    const { error: updateError } = await supabaseAdmin
        .from('daily_missions')
        .update({
            is_completed: true,
            completed_at: new Date().toISOString(),
        })
        .eq('id', missionId);

    if (updateError) {
        reportError('user/missions:completeMission:update', updateError, { missionId });
        throw new MissionRewardWriteError();
    }
}

/** 全達成ボーナス付与 */
async function awardAllCompletedBonus(userId: string, date: string): Promise<void> {
    const bonusKey = `mission-bonus:${userId}:${date}`;
    const { error: bonusError } = await supabaseAdmin
        .from('coin_transactions')
        .insert({
            user_id: userId,
            date,
            type: 'MISSION_REWARD',
            amount: 100,
            description: 'デイリーミッション全達成ボーナス',
            idempotency_key: bonusKey,
        });

    if (bonusError) {
        reportError('user/missions:allCompletedBonus:insert', bonusError, { userId, date });
        throw new MissionRewardWriteError();
    }

    const { data: bd, error: balanceFetchError } = await supabaseAdmin
        .from('coin_balances')
        .select('total_balance, total_bonus')
        .eq('user_id', userId)
        .single();

    if (balanceFetchError) {
        reportError('user/missions:allCompletedBonus:balance', balanceFetchError, { userId });
        throw new MissionRewardWriteError();
    }

    if (!bd) {
        reportError('user/missions:allCompletedBonus:balanceMissing', new Error('Coin balance not found'), { userId });
        throw new MissionRewardWriteError();
    }

    const { error: balUpdateError } = await supabaseAdmin
        .from('coin_balances')
        .update({
            total_balance: bd.total_balance + 100,
            total_bonus: bd.total_bonus + 100,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

    if (balUpdateError) {
        reportError('user/missions:allCompletedBonus:update', balUpdateError, { userId });
        throw new MissionRewardWriteError();
    }
}

function shiftDate(date: string, days: number): string {
    const shifted = new Date(`${date}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().split('T')[0];
}

/**
 * ミッション全達成の連続日数（ストリーク）を計算
 * 今日を含め、過去に遡って連続で全ミッション完了している日数を返す
 */
async function calculateMissionStreak(userId: string, today: string): Promise<number | null> {
    // 過去30日分のミッションデータを一括取得（パフォーマンス考慮）
    const thirtyDaysAgo = new Date(`${today}T00:00:00Z`);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    const { data: allMissions, error: streakError } = await supabaseAdmin
        .from('daily_missions')
        .select('date, is_completed')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', today)
        .order('date', { ascending: false });

    if (streakError) {
        reportError('user/missions:streak', streakError, { userId, today });
        return null;
    }

    if (!allMissions || allMissions.length === 0) return 0;

    // 日付ごとに全ミッション完了かチェック
    const dateMap = new Map<string, { total: number; completed: number }>();
    for (const m of allMissions) {
        const entry = dateMap.get(m.date) ?? { total: 0, completed: 0 };
        entry.total++;
        if (m.is_completed) entry.completed++;
        dateMap.set(m.date, entry);
    }

    // 今日から遡って連続全達成日数をカウント
    let streak = 0;
    const checkDate = new Date(`${today}T00:00:00Z`);

    for (let i = 0; i < 31; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const entry = dateMap.get(dateStr);

        // その日のミッションがない、または全達成でなければストリーク終了
        if (!entry || entry.total === 0 || entry.completed < entry.total) {
            break;
        }
        streak++;
        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    }

    return streak;
}
