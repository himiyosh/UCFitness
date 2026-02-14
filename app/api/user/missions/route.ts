export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/missions
 * 今日のデイリーミッション一覧を取得。未作成なら自動生成する。
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
    const { data: existingMissions } = await supabaseAdmin
        .from('daily_missions')
        .select('id, mission_type, title, description, reward_uc, is_completed, completed_at')
        .eq('user_id', userId)
        .eq('date', today)
        .order('mission_type', { ascending: true });

    if (existingMissions && existingMissions.length > 0) {
        const allCompleted = existingMissions.every(m => m.is_completed);
        return NextResponse.json({ missions: existingMissions, date: today, allCompleted });
    }

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

    return NextResponse.json({ missions: created || [], date: today, allCompleted: false });
}

/**
 * POST /api/user/missions
 * ミッション達成報告 { missionId }
 */
export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    const body = await request.json();
    const { missionId } = body;

    if (!missionId || typeof missionId !== 'string') {
        return NextResponse.json({ error: '無効なミッションID' }, { status: 400 });
    }

    // ミッションを取得して所有者確認
    const { data: mission } = await supabaseAdmin
        .from('daily_missions')
        .select('id, user_id, is_completed, reward_uc, date')
        .eq('id', missionId)
        .single();

    if (!mission || mission.user_id !== userId) {
        return NextResponse.json({ error: 'ミッションが見つかりません' }, { status: 404 });
    }

    if (mission.is_completed) {
        return NextResponse.json({ error: '既に達成済みです' }, { status: 400 });
    }

    // ミッションを完了に更新
    const { error: updateError } = await supabaseAdmin
        .from('daily_missions')
        .update({
            is_completed: true,
            completed_at: new Date().toISOString(),
        })
        .eq('id', missionId);

    if (updateError) {
        return NextResponse.json({ error: '更新失敗' }, { status: 500 });
    }

    // 報酬UCを付与
    const { error: txError } = await supabaseAdmin
        .from('coin_transactions')
        .insert({
            user_id: userId,
            date: mission.date,
            type: 'MISSION_REWARD',
            amount: mission.reward_uc,
            description: `デイリーミッション報酬`,
            idempotency_key: `mission:${missionId}`,
        });

    if (!txError) {
        // coin_balances を更新
        const { data: balanceData } = await supabaseAdmin
            .from('coin_balances')
            .select('total_balance, total_bonus')
            .eq('user_id', userId)
            .single();

        if (balanceData) {
            await supabaseAdmin
                .from('coin_balances')
                .update({
                    total_balance: balanceData.total_balance + mission.reward_uc,
                    total_bonus: balanceData.total_bonus + mission.reward_uc,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId);
        }
    }

    // 全ミッション達成チェック → ボーナス付与
    const { data: allMissions } = await supabaseAdmin
        .from('daily_missions')
        .select('is_completed')
        .eq('user_id', userId)
        .eq('date', mission.date);

    const allCompleted = allMissions?.every(m => m.is_completed) || false;
    let bonusAwarded = false;

    if (allCompleted) {
        // 全達成ボーナス: 100 UC
        const bonusKey = `mission-bonus:${userId}:${mission.date}`;
        const { error: bonusError } = await supabaseAdmin
            .from('coin_transactions')
            .insert({
                user_id: userId,
                date: mission.date,
                type: 'MISSION_REWARD',
                amount: 100,
                description: 'デイリーミッション全達成ボーナス',
                idempotency_key: bonusKey,
            });

        if (!bonusError) {
            bonusAwarded = true;
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

    return NextResponse.json({
        success: true,
        rewardUc: mission.reward_uc,
        allCompleted,
        bonusAwarded,
        bonusUc: bonusAwarded ? 100 : 0,
    });
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
    { type: 'WALK_3K', title: '🚶 3,000歩を歩こう', description: '今日3,000歩以上歩く', rewardUc: 30 },
    { type: 'WALK_5K', title: '🏃 5,000歩チャレンジ', description: '今日5,000歩以上歩く', rewardUc: 50 },
    { type: 'WALK_8K', title: '💪 8,000歩を目指せ', description: '今日8,000歩以上歩く', rewardUc: 80 },
    { type: 'WALK_10K', title: '🔥 10,000歩の壁を越えろ', description: '今日10,000歩以上歩く', rewardUc: 100 },
    { type: 'CHECK_LEADERBOARD', title: '📊 ランキングを確認', description: 'ランキングページを閲覧する', rewardUc: 20 },
    { type: 'VISIT_SHOP', title: '🛍️ ショップを訪問', description: 'ショップページを閲覧する', rewardUc: 20 },
    { type: 'CHECK_PROFILE', title: '👤 プロフィールを確認', description: '自分のプロフィールを閲覧する', rewardUc: 20 },
    { type: 'CHECK_WALLET', title: '💰 ウォレットを確認', description: 'ウォレットページを閲覧する', rewardUc: 20 },
];

function generateDailyMissions(date: string): MissionTemplate[] {
    // 日付ベースの擬似乱数でミッションを選択（再現性あり）
    const seed = date.replace(/-/g, '');
    const numSeed = parseInt(seed, 10);

    // 歩数系から1つ必ず選ぶ
    const walkMissions = MISSION_POOL.filter(m => m.type.startsWith('WALK_'));
    const otherMissions = MISSION_POOL.filter(m => !m.type.startsWith('WALK_'));

    const walkIndex = numSeed % walkMissions.length;
    const selected: MissionTemplate[] = [walkMissions[walkIndex]];

    // 残り2つはその他から選ぶ（重複なし）
    const shuffled = [...otherMissions].sort((a, b) => {
        const hashA = (numSeed * 31 + a.type.charCodeAt(0)) % 1000;
        const hashB = (numSeed * 31 + b.type.charCodeAt(0)) % 1000;
        return hashA - hashB;
    });

    selected.push(shuffled[0], shuffled[1]);

    return selected;
}
