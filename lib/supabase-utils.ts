import { supabaseAdmin } from './supabase';

export class PaginationLimitError extends Error {
    constructor(maxRows: number) {
        super(`Paginated query exceeded ${maxRows} rows`);
        this.name = 'PaginationLimitError';
    }
}

/**
 * PostgREST 1000行制限回避: ページネーション付きクエリユーティリティ
 *
 * Supabase PostgREST はデフォルトで最大1000行しか返さない。
 * .limit() で上書きしてもサーバー側 max_rows が優先されるため、
 * .range() を使ったページネーションで全行を取得する。
 *
 * @example
 * const { data, error } = await fetchAllWithPagination(
 *     (from, to) => supabaseAdmin
 *         .from('daily_steps')
 *         .select('user_id, steps, date')
 *         .gte('date', '2026-01-01')
 *         .range(from, to)
 * );
 */
export async function fetchAllWithPagination<T>(
    queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
    pageSize: number = 900,
    maxRows: number = Number.POSITIVE_INFINITY,
): Promise<{ data: T[]; error: unknown }> {
    let allData: T[] = [];

    while (true) {
        const remainingRows = maxRows - allData.length;
        const requestedPageSize = Number.isFinite(maxRows)
            ? Math.min(pageSize, remainingRows + 1)
            : pageSize;
        const from = allData.length;
        const to = from + requestedPageSize - 1;
        const { data, error } = await queryFactory(from, to);

        if (error) return { data: allData, error };
        if (!data || data.length === 0) break;
        if (data.length > remainingRows) {
            return { data: allData, error: new PaginationLimitError(maxRows) };
        }

        allData = allData.concat(data);
        if (data.length < requestedPageSize) break;
    }

    return { data: allData, error: null };
}

/**
 * daily_steps テーブルからページネーション付きで全行取得
 * ランキング・集計系クエリで使用
 */
export async function fetchDailyStepsPaginated(options: {
    startDate: string;
    userIds?: string[];
    selectFields?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<{ data: any[]; error: unknown }> {
    const fields = options.selectFields || 'user_id, steps, date';

    return fetchAllWithPagination(
        (from, to) => {
            let q = supabaseAdmin
                .from('daily_steps')
                .select(fields)
                .gte('date', options.startDate);

            if (options.userIds && options.userIds.length > 0) {
                q = q.in('user_id', options.userIds);
            }

            return q.range(from, to);
        }
    );
}
