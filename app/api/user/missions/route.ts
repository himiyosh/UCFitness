export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/missions
 * 今日のデイリーミッション一覧を取得。未作成なら自動生成する。
 * 歩数ミッションは自動判定する。
 */
export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;
    const today = getJSTDateString();

    // 今日のミッションが既にあるか確認
    let { data: missions } = await supabaseAdmin
        .from('daily_missions')
        .select('id, mission_type, title, description, reward_uc, is_completed, completed_at')
        .eq('user_id', userId)
        .eq('date', today)
        .order('mission_type', { ascending: true });

    if (!missions || missions.length === 0) {
        // 今日のミッションを生成（3つ）
        const todayMissions = generateDailyMissions(today);
        const { data: created, error } = await supabaseAdmin
            .from('daily_missions')
            .insert(todayMissions.map(m => ({
                user_id: userId,
                date: today,
                mission_type: m.type,
                title: m.title,
                description: m.description,
                reward_uc: m.rewardUc,
                is_completed: false,
            })))
            .select('id, mission_type, title, description, reward_uc, is_completed, completed_at');

        if (error) {
            return NextResponse.json({ error: 'ミッション生成失敗' }, { status: 500 });
        }
        missions = created || [];
    }

    // === 自動判定: 未完了ミッションを実データでチェック ===
    const uncompletedMissions = missions.filter(m => !m.is_completed);

    if (uncompletedMissions.length > 0) {
        // 今日の歩数を取得
        const { data: stepData } = await supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId)
            .eq('date', today)
            .single();
        const todaySteps = stepData?.steps ?? 0;

        // 各ミッションを自動判定
        for (const mission of uncompletedMissions) {
            const achieved = evaluateMission(mission.mission_type, todaySteps);
            if (achieved) {
                // DB更新 + 報酬付与
                await completeMissionAndReward(userId, mission.id, mission.reward_uc, today);
                mission.is_completed = true;
                mission.completed_at = new Date().toISOString();
            }
        }

        // 全達成ボーナスチェック
        if (missions.every(m => m.is_completed)) {
            await awardAllCompletedBonus(userId, today);
        }
    }

    const allCompleted = missions.every(m => m.is_completed);

    // ミッション連続達成ストリークを計算
    const streak = await calculateMissionStreak(userId, today);

    return NextResponse.json({ missions, date: today, allCompleted, streak });
}

/**
 * POST /api/user/missions
 * ミッション再チェックをトリガー（手動完了は不可、自動判定のみ）
 */
export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    // action: 'refresh' — ミッション状態を再評価
    if (action !== 'refresh') {
        return NextResponse.json({ error: '手動でのミッション完了は許可されていません' }, { status: 403 });
    }

    const today = getJSTDateString();

    // 今日のミッションを取得
    const { data: missions } = await supabaseAdmin
        .from('daily_missions')
        .select('id, mission_type, title, description, reward_uc, is_completed, completed_at')
        .eq('user_id', userId)
        .eq('date', today)
        .order('mission_type', { ascending: true });

    if (!missions || missions.length === 0) {
        return NextResponse.json({ error: 'ミッションが見つかりません' }, { status: 404 });
    }

    // 今日の歩数を取得
    const { data: stepData } = await supabaseAdmin
        .from('daily_steps')
        .select('steps')
        .eq('user_id', userId)
        .eq('date', today)
        .single();
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
    if (allCompleted && newlyCompleted > 0) {
        await awardAllCompletedBonus(userId, today);
    }

    return NextResponse.json({
        success: true,
        missions,
        allCompleted,
        newlyCompleted,
        bonusAwarded: allCompleted && newlyCompleted > 0,
        bonusUc: allCompleted && newlyCompleted > 0 ? 100 : 0,
    });
}

// ============================================
// ミッション自動判定ロジック
// ============================================

/** ミッションタイプごとの達成閾値 */
const STEP_THRESHOLDS: Record<string, number> = {
    WALK_3K: 3000,
    WALK_5K: 5000,
    WALK_8K: 8000,
    WALK_10K: 10000,
    WALK_1K: 1000,
    WALK_15K: 15000,
};

/** ミッション達成判定 — 実データに基づいて評価 */
function evaluateMission(missionType: string, todaySteps: number): boolean {
    const threshold = STEP_THRESHOLDS[missionType];
    if (threshold !== undefined) {
        return todaySteps >= threshold;
    }
    // ログインミッション: GET時点で達成（ダッシュボードにアクセス＝ログイン済み）
    if (missionType === 'LOGIN') {
        return true;
    }
    return false;
}

/** ミッション完了処理 + 報酬UC付与 */
async function completeMissionAndReward(
    userId: string,
    missionId: string,
    rewardUc: number,
    date: string,
): Promise<void> {
    // ミッションを完了に更新
    await supabaseAdmin
        .from('daily_missions')
        .update({
            is_completed: true,
            completed_at: new Date().toISOString(),
        })
        .eq('id', missionId);

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

    if (!txError) {
        const { data: balanceData } = await supabaseAdmin
            .from('coin_balances')
            .select('total_balance, total_bonus')
            .eq('user_id', userId)
            .single();

        if (balanceData) {
            await supabaseAdmin
                .from('coin_balances')
                .update({
                    total_balance: balanceData.total_balance + rewardUc,
                    total_bonus: balanceData.total_bonus + rewardUc,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId);
        }
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

    if (!bonusError) {
        const { data: bd } = await supabaseAdmin
            .from('coin_balances')
            .select('total_balance, total_bonus')
            .eq('user_id', userId)
            .single();
        if (bd) {
            await supabaseAdmin
                .from('coin_balances')
                .update({
                    total_balance: bd.total_balance + 100,
                    total_bonus: bd.total_bonus + 100,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId);
        }
    }
}

// ============================================
// ミッションテンプレート生成
// ============================================

interface MissionTemplate {
    type: string;
    title: string;
    description: string;
    rewardUc: number;
}

const MISSION_POOL: MissionTemplate[] = [
    { type: 'WALK_1K', title: '👣 1,000歩を歩こう', description: '今日1,000歩以上歩く', rewardUc: 15 },
    { type: 'WALK_3K', title: '🚶 3,000歩を歩こう', description: '今日3,000歩以上歩く', rewardUc: 30 },
    { type: 'WALK_5K', title: '🏃 5,000歩チャレンジ', description: '今日5,000歩以上歩く', rewardUc: 50 },
    { type: 'WALK_8K', title: '💪 8,000歩を目指せ', description: '今日8,000歩以上歩く', rewardUc: 80 },
    { type: 'WALK_10K', title: '🔥 10,000歩の壁を越えろ', description: '今日10,000歩以上歩く', rewardUc: 100 },
    { type: 'WALK_15K', title: '🏆 15,000歩マスター', description: '今日15,000歩以上歩く', rewardUc: 150 },
    { type: 'LOGIN', title: '📱 ログインしよう', description: 'UCFitnessにログインする', rewardUc: 10 },
];

function generateDailyMissions(date: string): MissionTemplate[] {
    // 日付ベースの擬似乱数でミッションを選択（再現性あり）
    const seed = date.replace(/-/g, '');
    const numSeed = parseInt(seed, 10);

    // 歩数系ミッション（LOGIN以外）
    const walkMissions = MISSION_POOL.filter(m => m.type.startsWith('WALK_'));
    const loginMission = MISSION_POOL.find(m => m.type === 'LOGIN')!;

    // ログインミッションは常に含める（簡単なミッション1つは達成感のため）
    const selected: MissionTemplate[] = [loginMission];

    // 歩数系から難易度の異なる2つを選ぶ
    // まず難易度順にソート
    const sorted = [...walkMissions].sort((a, b) => a.rewardUc - b.rewardUc);
    // 簡単な方（1K/3K/5K）から1つ、難しい方（8K/10K/15K）から1つ
    const easy = sorted.filter(m => m.rewardUc <= 50);
    const hard = sorted.filter(m => m.rewardUc > 50);

    const easyIndex = numSeed % easy.length;
    const hardIndex = (numSeed * 7) % hard.length;

    selected.push(easy[easyIndex]);
    selected.push(hard[hardIndex]);

    return selected;
}

/**
 * ミッション全達成の連続日数（ストリーク）を計算
 * 今日を含め、過去に遡って連続で全ミッション完了している日数を返す
 */
async function calculateMissionStreak(userId: string, today: string): Promise<number> {
    // 過去30日分のミッションデータを一括取得（パフォーマンス考慮）
    const thirtyDaysAgo = new Date(`${today}T00:00:00Z`);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    const { data: allMissions } = await supabaseAdmin
        .from('daily_missions')
        .select('date, is_completed')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', today)
        .order('date', { ascending: false });

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
