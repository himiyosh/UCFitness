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

/** `fetchDailyStepsPaginated` の既定の select 列 (`selectFields` 省略時) の行型 */
export type DailyStepDefaultRow = { user_id: string; steps: number; date: string };

/**
 * daily_steps テーブルからページネーション付きで全行取得
 * ランキング・集計系クエリで使用
 *
 * `selectFields` を渡す場合は呼び出し側で対応する行型を型引数 `T` として明示すること。
 * 省略時は既定の `user_id, steps, date` 列に対応する `DailyStepDefaultRow` が使われる。
 *
 * date + user_id でページ順を固定するが、各ページは独立したHTTPリクエストのため
 * 同期処理と並行した場合のトランザクション的なスナップショット一貫性は保証しない。
 * 複数ページが常態化する場合は、複合keysetまたはtransactional RPCへ移行する。
 */
export async function fetchDailyStepsPaginated<T = DailyStepDefaultRow>(options: {
    startDate: string;
    userIds?: string[];
    selectFields?: string;
}): Promise<{ data: T[]; error: unknown }> {
    const fields = options.selectFields || 'user_id, steps, date';

    return fetchAllWithPagination<T>(
        (from, to) => {
            let q = supabaseAdmin
                .from('daily_steps')
                .select(fields)
                .gte('date', options.startDate);

            if (options.userIds && options.userIds.length > 0) {
                q = q.in('user_id', options.userIds);
            }

            return q
                .order('date', { ascending: true })
                .order('user_id', { ascending: true })
                .range(from, to)
                .returns<T[]>();
        }
    );
}
