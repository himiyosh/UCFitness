export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';

// エクスポート対象の型定義
type ExportType = 'steps' | 'transactions';
type ExportFormat = 'csv' | 'json';

const VALID_TYPES: ExportType[] = ['steps', 'transactions'];
const VALID_FORMATS: ExportFormat[] = ['csv', 'json'];
// 日付形式バリデーション（YYYY-MM-DD）
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// 最大エクスポート期間（365日）
const MAX_DAYS = 365;

/**
 * 歩数データを CSV 文字列に変換
 */
function stepsToCsv(rows: Array<{ date: string; steps: number }>): string {
    const header = 'date,steps';
    const lines = rows.map((r) => `${r.date},${r.steps}`);
    return [header, ...lines].join('\n');
}

/**
 * 取引データを CSV 文字列に変換
 */
function transactionsToCsv(
    rows: Array<{ date: string; type: string; amount: number; description: string | null }>
): string {
    const header = 'date,type,amount,description';
    const lines = rows.map((r) => {
        // CSV 内のカンマ・改行・ダブルクオートをエスケープ
        const desc = r.description
            ? `"${r.description.replace(/"/g, '""')}"`
            : '';
        return `${r.date},${r.type},${r.amount},${desc}`;
    });
    return [header, ...lines].join('\n');
}

/**
 * GET /api/user/export
 * クエリパラメータ:
 *   type: 'steps' | 'transactions'
 *   format: 'csv' | 'json' (デフォルト: csv)
 *   from: 'YYYY-MM-DD' (デフォルト: 30日前)
 *   to: 'YYYY-MM-DD' (デフォルト: 今日)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const { searchParams } = new URL(request.url);

        // --- パラメータ取得 & バリデーション ---
        const type = searchParams.get('type') as ExportType | null;
        const format = (searchParams.get('format') || 'csv') as ExportFormat;

        if (!type || !VALID_TYPES.includes(type)) {
            return NextResponse.json(
                { error: 'Invalid type. Must be "steps" or "transactions".' },
                { status: 400 }
            );
        }
        if (!VALID_FORMATS.includes(format)) {
            return NextResponse.json(
                { error: 'Invalid format. Must be "csv" or "json".' },
                { status: 400 }
            );
        }

        // 日付範囲（デフォルト: 過去30日）
        const now = new Date();
        const defaultFrom = new Date(now);
        defaultFrom.setDate(defaultFrom.getDate() - 30);

        const fromStr = searchParams.get('from') || defaultFrom.toISOString().split('T')[0];
        const toStr = searchParams.get('to') || now.toISOString().split('T')[0];

        if (!DATE_REGEX.test(fromStr) || !DATE_REGEX.test(toStr)) {
            return NextResponse.json(
                { error: 'Invalid date format. Use YYYY-MM-DD.' },
                { status: 400 }
            );
        }

        // 期間上限チェック
        const fromDate = new Date(fromStr);
        const toDate = new Date(toStr);
        if (fromDate > toDate) {
            return NextResponse.json(
                { error: '"from" must be before or equal to "to".' },
                { status: 400 }
            );
        }
        const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > MAX_DAYS) {
            return NextResponse.json(
                { error: `Export period cannot exceed ${MAX_DAYS} days.` },
                { status: 400 }
            );
        }

        // --- データ取得 ---
        if (type === 'steps') {
            const { data: steps, error } = await supabaseAdmin
                .from('daily_steps')
                .select('date, steps')
                .eq('user_id', userId)
                .gte('date', fromStr)
                .lte('date', toStr)
                .order('date', { ascending: true });

            if (error) {
                reportError('user/export:steps', error, { userId });
                return NextResponse.json({ error: 'Failed to fetch step data' }, { status: 500 });
            }

            const rows = steps || [];
            const filename = `ucfitness-steps-${fromStr}-to-${toStr}`;

            if (format === 'json') {
                return new NextResponse(JSON.stringify({ steps: rows }, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Disposition': `attachment; filename="${filename}.json"`,
                    },
                });
            }

            // CSV
            return new NextResponse(stepsToCsv(rows), {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${filename}.csv"`,
                },
            });
        }

        // --- transactions ---
        const { data: transactions, error } = await supabaseAdmin
            .from('coin_transactions')
            .select('date, type, amount, description')
            .eq('user_id', userId)
            .gte('date', fromStr)
            .lte('date', toStr)
            .order('date', { ascending: true });

        if (error) {
            reportError('user/export:transactions', error, { userId });
            return NextResponse.json({ error: 'Failed to fetch transaction data' }, { status: 500 });
        }

        const rows = transactions || [];
        const filename = `ucfitness-transactions-${fromStr}-to-${toStr}`;

        if (format === 'json') {
            return new NextResponse(JSON.stringify({ transactions: rows }, null, 2), {
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="${filename}.json"`,
                },
            });
        }

        return new NextResponse(transactionsToCsv(rows), {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}.csv"`,
            },
        });
    } catch (err) {
        reportError('user/export', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
