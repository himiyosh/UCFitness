// ============================================
// Supabase クエリビルダーのチェーン可能なテスト用モック
// ============================================
// 実際の `@supabase/postgrest-js` の `.returns<T>()` はビルダー自身を返す
// ランタイム上の no-op であり、`data`/`error` には一切影響しない。
// 手書きモック (`vi.fn().mockResolvedValue(...)`) はこの
// `.returns()` メソッドを持たないため、実装側で `.in(...).returns<T>()` のように
// チェーンすると `TypeError: ...returns is not a function` でテストが落ちる。
//
// `mockQueryResult` は `.returns()` を呼んでも自分自身を返す thenable を生成し、
// `.returns()` の有無どちらでも `await` で `{ data, error }` に解決できるようにする。

export interface SupabaseQueryMockResult<T> {
    data: T | null;
    error: unknown;
}

export type ChainableQueryMock<T> = PromiseLike<SupabaseQueryMockResult<T>> & {
    returns: () => ChainableQueryMock<T>;
};

/**
 * `vi.fn().mockReturnValue(mockQueryResult(data, error))` の形で使用する。
 * `mockResolvedValue` ではなく `mockReturnValue` を使うこと
 * （`mockResolvedValue` は戻り値を `Promise.resolve()` でラップし直すため、
 * 生成した `.returns()` メソッドが失われてしまう）。
 */
export function mockQueryResult<T>(data: T | null, error: unknown = null): ChainableQueryMock<T> {
    const result: SupabaseQueryMockResult<T> = { data, error };

    const chainable: ChainableQueryMock<T> = {
        returns: () => chainable,
        then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    };

    return chainable;
}
