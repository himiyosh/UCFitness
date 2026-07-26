import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    getInvestorRank: vi.fn(),
    getJSTDateString: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/constants', () => ({ getInvestorRank: mocks.getInvestorRank }));
vi.mock('@/lib/date-utils', () => ({ getJSTDateString: mocks.getJSTDateString }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { GET } from '@/app/api/amazon/personalized/route';

interface QueryResult {
    data: unknown;
    error: unknown;
}

interface QueryChain extends PromiseLike<QueryResult> {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
}

const USER_ID = 'private-user-id';
const RAW_MESSAGE = 'database unavailable for private-user@example.com';
const RAW_ERROR = { code: 'XX000', message: RAW_MESSAGE, details: USER_ID };
const UNAVAILABLE_BODY = { error: 'Personalized recommendations unavailable' };
const BEGINNER_RANK = { minBalance: 0, rank: 'BEGINNER', label: 'Rookie Investor', labelJa: '新人投資家', icon: '🌱' };
const BUSINESS_RANK = { minBalance: 100_000, rank: 'BUSINESS', label: 'Business Walker', labelJa: 'ビジネスウォーカー', icon: '💼' };

let balanceResult: QueryResult;
let stepsResult: QueryResult;
let balanceRejection: unknown;
let stepsRejection: unknown;
let balanceChain: QueryChain;
let stepsChain: QueryChain;

function createQueryChain(result: QueryResult, rejection?: unknown): QueryChain {
    const terminal = rejection === undefined
        ? Promise.resolve(result)
        : Promise.reject(rejection);
    const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        maybeSingle: vi.fn(() => terminal),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => terminal.then(onfulfilled, onrejected),
    } as QueryChain;

    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.gte.mockReturnValue(chain);
    chain.lte.mockReturnValue(chain);
    return chain;
}

function configureQueries(): void {
    mocks.from.mockImplementation((table: string) => {
        if (table === 'coin_balances') {
            balanceChain = createQueryChain(balanceResult, balanceRejection);
            return balanceChain;
        }
        if (table === 'daily_steps') {
            stepsChain = createQueryChain(stepsResult, stepsRejection);
            return stepsChain;
        }
        throw new Error(`Unexpected table: ${table}`);
    });
}

function expectFixedReport(stage: string, body?: unknown): void {
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    const call = mocks.reportError.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe('amazon-personalized');
    expect(call[1]).toBeInstanceOf(Error);
    expect(call[1]).toEqual(expect.objectContaining({
        message: 'Personalized recommendation request failed',
        code: 'AMAZON_PERSONALIZED_UNAVAILABLE',
        context: { stage },
        cause: undefined,
    }));
    const serialized = JSON.stringify({ body, operation: call[0], error: call[1] });
    expect(serialized).not.toContain(RAW_MESSAGE);
    expect(serialized).not.toContain(USER_ID);
}

async function expectUnavailable(response: Response): Promise<unknown> {
    const body: unknown = await response.json();
    expect(response.status).toBe(503);
    expect(body).toEqual(UNAVAILABLE_BODY);
    return body;
}

describe('GET /api/amazon/personalized', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        balanceResult = { data: { total_earned: 0 }, error: null };
        stepsResult = { data: [], error: null };
        balanceRejection = undefined;
        stepsRejection = undefined;
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        mocks.getJSTDateString.mockReturnValue('2026-07-24');
        mocks.getInvestorRank.mockImplementation((totalEarned: number) =>
            totalEarned >= 100_000 ? BUSINESS_RANK : BEGINNER_RANK);
        configureQueries();
    });

    it.each([null, { user: {} }])('認証主体が不正な場合_DB照会せず401を返す', async (session) => {
        mocks.auth.mockResolvedValue(session);

        const response = await GET();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it.each([
        ['未記録', []],
        ['記録済み0歩', [{ steps: 0 }]],
    ])('歩数が%sの場合_平均0の決定的な成功レスポンスを返す', async (_label, rows) => {
        stepsResult = { data: rows, error: null };

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(expect.objectContaining({
            rank: 'BEGINNER',
            rankLabel: '新人投資家',
            rankIcon: '🌱',
            avgSteps: 0,
            primaryKeyword: 'ウォーキングシューズ 初心者',
            secondaryKeyword: 'ヨガマット',
        }));
        expect(body.allKeywords).toHaveLength(7);
        expect(balanceChain.select).toHaveBeenCalledWith('total_earned');
        expect(balanceChain.maybeSingle).toHaveBeenCalledOnce();
        expect(stepsChain.select).toHaveBeenCalledWith('steps');
        expect(stepsChain.gte).toHaveBeenCalledWith('date', '2026-07-10');
        expect(stepsChain.lte).toHaveBeenCalledWith('date', '2026-07-24');
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('残高行がない場合_新規ユーザーの獲得0として扱う', async () => {
        balanceResult = { data: null, error: null };

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(expect.objectContaining({ rank: 'BEGINNER', avgSteps: 0 }));
        expect(mocks.getInvestorRank).toHaveBeenCalledWith(0);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('同じJST日と入力の場合_同じキーワードを返す', async () => {
        balanceResult = { data: { total_earned: 100_000 }, error: null };
        stepsResult = { data: [{ steps: 0 }, { steps: 10_000 }], error: null };

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            rank: 'BUSINESS',
            rankLabel: 'ビジネスウォーカー',
            rankIcon: '💼',
            avgSteps: 5_000,
            primaryKeyword: 'ランニングシューズ',
            secondaryKeyword: 'フィットネストラッカー',
            allKeywords: [
                'ランニングシューズ',
                'スマートウォッチ フィットネス',
                'スポーツウェア',
                'プロテイン',
                'ウォーキング グッズ',
                'スポーツタオル',
                'フィットネストラッカー',
            ],
        });
    });

    it.each([
        ['残高', 'balance', 'balance-query'],
        ['歩数', 'steps', 'steps-query'],
    ])('%sDB照会が失敗した場合_後続判定せず秘匿した503を返す', async (
        _label,
        dependency,
        stage,
    ) => {
        if (dependency === 'balance') {
            balanceResult = { data: null, error: RAW_ERROR };
        } else {
            stepsResult = { data: null, error: RAW_ERROR };
        }

        const response = await GET();
        const body = await expectUnavailable(response);

        expect(mocks.getInvestorRank).not.toHaveBeenCalled();
        expectFixedReport(stage, body);
    });

    it.each([
        ['空オブジェクト', {}],
        ['null値', { total_earned: null }],
        ['負数', { total_earned: -1 }],
        ['小数', { total_earned: 1.5 }],
        ['unsafe整数', { total_earned: Number.MAX_SAFE_INTEGER + 1 }],
        ['NaN', { total_earned: Number.NaN }],
        ['Infinity', { total_earned: Number.POSITIVE_INFINITY }],
    ])('残高が%sの場合_BEGINNERへ偽装せず固定503を返す', async (_label, data) => {
        balanceResult = { data, error: null };

        const response = await GET();

        await expectUnavailable(response);
        expect(mocks.getInvestorRank).not.toHaveBeenCalled();
        expectFixedReport('balance-data');
    });

    it.each([
        ['errorless null', null],
        ['null row', [null]],
        ['missing steps', [{}]],
        ['negative steps', [{ steps: -1 }]],
        ['fractional steps', [{ steps: 1.5 }]],
        ['unsafe steps', [{ steps: Number.MAX_SAFE_INTEGER + 1 }]],
        ['NaN steps', [{ steps: Number.NaN }]],
        ['Infinity steps', [{ steps: Number.POSITIVE_INFINITY }]],
        ['unsafe sum', [{ steps: Number.MAX_SAFE_INTEGER }, { steps: 1 }]],
    ])('歩数が%sの場合_平均0へ偽装せず固定503を返す', async (_label, data) => {
        stepsResult = { data, error: null };

        const response = await GET();

        await expectUnavailable(response);
        expect(mocks.getInvestorRank).not.toHaveBeenCalled();
        expectFixedReport('steps-data');
    });

    it('ランク結果が不正な場合_BEGINNERへfallbackせず固定503を返す', async () => {
        mocks.getInvestorRank.mockReturnValueOnce({
            rank: 'UNKNOWN',
            labelJa: 'unknown',
            icon: '?',
        });
        const response = await GET();

        await expectUnavailable(response);
        expectFixedReport('rank-data');
    });

    it.each(['auth', 'balance query', 'steps query'])(
        '%sが予期せずrejectした場合_raw情報を漏らさず固定503を返す',
        async (source) => {
            const rejection = new Error(`${RAW_MESSAGE}: ${USER_ID}`);
            if (source === 'auth') {
                mocks.auth.mockRejectedValueOnce(rejection);
            } else if (source === 'balance query') {
                balanceRejection = rejection;
            } else {
                stepsRejection = rejection;
            }

            const response = await GET();
            const body = await expectUnavailable(response);

            expect(mocks.getInvestorRank).not.toHaveBeenCalled();
            expectFixedReport('unexpected', body);
        },
    );
});
