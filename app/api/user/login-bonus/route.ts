import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { getJSTDateString } from "@/lib/date-utils";
import { NextResponse } from "next/server";

// ============================================
// デイリーログインボーナス API
// 毎日ログイン時にUCボーナスを付与。連続日数でマルチプライヤー増加。
// ============================================

/** ベースボーナス額 */
const BASE_BONUS = 100;

/** 連続ログイン日数に応じたマルチプライヤーを返す */
function getLoginStreakMultiplier(streak: number): number {
    if (streak >= 30) return 3.0;
    if (streak >= 14) return 2.0;
    if (streak >= 7) return 1.5;
    if (streak >= 3) return 1.2;
    return 1.0;
}

/**
 * 連続ログイン日数を計算する
 * 今日を含めて過去に遡り、LOGIN_BONUS トランザクションが連続している日数を返す
 */
async function calculateLoginStreak(userId: string, today: string): Promise<number> {
    // 過去60日分のLOGIN_BONUSトランザクションを取得（日付降順）
    const { data, error } = await supabaseAdmin
        .from('coin_transactions')
        .select('date')
        .eq('user_id', userId)
        .eq('type', 'LOGIN_BONUS')
        .order('date', { ascending: false })
        .limit(60);

    if (error || !data || data.length === 0) {
        return 1; // 今日が初回
    }

    // ユニークな日付を抽出（降順ソート済み）
    const uniqueDates = [...new Set(data.map((row) => row.date))];

    // 今日から遡って連続日数をカウント
    let streak = 0;
    const currentDate = new Date(`${today}T00:00:00Z`);

    for (let i = 0; i < 60; i++) {
        const checkDate = new Date(currentDate);
        checkDate.setUTCDate(currentDate.getUTCDate() - i);
        const checkDateStr = checkDate.toISOString().split('T')[0];

        if (uniqueDates.includes(checkDateStr)) {
            streak++;
        } else {
            // 今日（i===0）にまだ記録がない場合はスキップ（これから記録する）
            if (i === 0) {
                streak++; // 今日の分をカウント
                continue;
            }
            break;
        }
    }

    return Math.max(streak, 1);
}

export async function POST() {
    const session = await auth();

    if (!session?.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const today = getJSTDateString();

    try {
        // 今日すでにボーナスを受け取っているかチェック
        const { data: existingBonus } = await supabaseAdmin
            .from('coin_transactions')
            .select('id')
            .eq('user_id', userId)
            .eq('type', 'LOGIN_BONUS')
            .eq('date', today)
            .limit(1);

        if (existingBonus && existingBonus.length > 0) {
            return NextResponse.json({
                claimed: false,
                amount: 0,
                streak: 0,
                alreadyClaimed: true,
            });
        }

        // 連続ログイン日数を計算
        const streak = await calculateLoginStreak(userId, today);
        const multiplier = getLoginStreakMultiplier(streak);
        const amount = Math.floor(BASE_BONUS * multiplier);

        // トランザクションを記録
        const { error: insertError } = await supabaseAdmin
            .from('coin_transactions')
            .insert({
                user_id: userId,
                date: today,
                type: 'LOGIN_BONUS',
                amount,
                description: `デイリーボーナス (${streak}日連続, x${multiplier})`,
                idempotency_key: `login_bonus:${userId}:${today}`,
            });

        if (insertError) {
            // べき等性キーの重複でエラーになった場合はすでに付与済み
            if (insertError.code === '23505') {
                return NextResponse.json({
                    claimed: false,
                    amount: 0,
                    streak: 0,
                    alreadyClaimed: true,
                });
            }
            reportError("login-bonus-insert", insertError);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        // 残高を更新
        const { error: balanceError } = await supabaseAdmin.rpc(
            'increment_coin_balance',
            { p_user_id: userId, p_amount: amount }
        );

        if (balanceError) {
            // RPC が存在しない場合のフォールバック: 直接 UPDATE
            const { data: currentUser } = await supabaseAdmin
                .from('users')
                .select('coin_balance')
                .eq('id', userId)
                .single();

            const currentBalance = currentUser?.coin_balance || 0;

            await supabaseAdmin
                .from('users')
                .update({ coin_balance: currentBalance + amount })
                .eq('id', userId);
        }

        return NextResponse.json({
            claimed: true,
            amount,
            streak,
            alreadyClaimed: false,
        });
    } catch (error: unknown) {
        reportError("login-bonus", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = "edge";
