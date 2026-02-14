export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { getJSTDateString } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

/**
 * ウィークリーチャレンジ自動生成テンプレート
 * 毎週ランダムに1つ選ばれる
 */
const CHALLENGE_TEMPLATES = [
    { title: '🏃 ウィークリー50Kチャレンジ', titleEn: '🏃 Weekly 50K Challenge', targetSteps: 50000, rewardUc: 500 },
    { title: '🔥 ウィークリー70Kチャレンジ', titleEn: '🔥 Weekly 70K Challenge', targetSteps: 70000, rewardUc: 800 },
    { title: '💪 ウィークリー100Kチャレンジ', titleEn: '💪 Weekly 100K Challenge', targetSteps: 100000, rewardUc: 1200 },
    { title: '⭐ ウィークリー30Kチャレンジ', titleEn: '⭐ Weekly 30K Challenge', targetSteps: 30000, rewardUc: 300 },
    { title: '🎯 ウィークリー80Kチャレンジ', titleEn: '🎯 Weekly 80K Challenge', targetSteps: 80000, rewardUc: 1000 },
];

/**
 * GET /api/cron/weekly-challenge
 * 毎週月曜に実行し、今週のシステムチャレンジを自動作成する。
 * CRON_SECRET による認証が必要。
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const today = getJSTDateString();
        const todayDate = new Date(`${today}T00:00:00Z`);

        // 今週の月曜〜日曜を計算
        const utcDay = todayDate.getUTCDay();
        const daysToMonday = (utcDay + 6) % 7;
        const monday = new Date(todayDate);
        monday.setUTCDate(todayDate.getUTCDate() - daysToMonday);
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        const startDate = monday.toISOString().split('T')[0];
        const endDate = sunday.toISOString().split('T')[0];

        // 今週のシステムチャレンジが既にあるか確認
        const { data: existing } = await supabaseAdmin
            .from('challenges')
            .select('id')
            .eq('is_system', true)
            .gte('start_date', startDate)
            .lte('start_date', endDate)
            .limit(1);

        if (existing && existing.length > 0) {
            return NextResponse.json({
                success: true,
                message: '今週のウィークリーチャレンジは既に作成済みです',
                challengeId: existing[0].id,
                timestamp: new Date().toISOString(),
            });
        }

        // ランダムにテンプレートを選択
        const template = CHALLENGE_TEMPLATES[Math.floor(Math.random() * CHALLENGE_TEMPLATES.length)];

        // チャレンジを作成
        const { data: challenge, error } = await supabaseAdmin
            .from('challenges')
            .insert({
                title: template.title,
                description: `システム自動生成: ${startDate} 〜 ${endDate}`,
                target_steps: template.targetSteps,
                reward_uc: template.rewardUc,
                start_date: startDate,
                end_date: endDate,
                is_system: true,
                created_by: null, // システム生成
            })
            .select('id')
            .single();

        if (error) {
            throw new Error(`チャレンジ作成失敗: ${error.message}`);
        }

        console.log(`[Cron] ウィークリーチャレンジ作成完了: ${challenge.id} (${template.title})`);

        return NextResponse.json({
            success: true,
            message: 'ウィークリーチャレンジを作成しました',
            challengeId: challenge.id,
            title: template.title,
            targetSteps: template.targetSteps,
            rewardUc: template.rewardUc,
            period: `${startDate} ~ ${endDate}`,
            timestamp: new Date().toISOString(),
        });
    } catch (error: unknown) {
        reportError('cron/weekly-challenge', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
