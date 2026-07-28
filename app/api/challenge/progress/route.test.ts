import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CHALLENGE_PROGRESS_BATCH_SIZE } from '@/lib/challenge-progress';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    getFreshChallengeProgressBatch: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));
vi.mock('@/lib/services/challenge-progress-service', () => ({
    getFreshChallengeProgressBatch: mocks.getFreshChallengeProgressBatch,
}));

import { POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const FIRST_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_ID = '33333333-3333-4333-8333-333333333333';

function request(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/challenge/progress', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    mocks.getFreshChallengeProgressBatch.mockResolvedValue([
        {
            challenge_id: FIRST_ID,
            status: 'ok',
            progress: {
                total_steps: 0,
                target_steps: 1000,
                progress_percent: 0,
                is_completed: false,
                completed_at: null,
                reward_uc: 500,
                type: 'INDIVIDUAL',
                record_status: 'recorded',
                schedule_status: 'active',
            },
        },
        {
            challenge_id: SECOND_ID,
            status: 'not_participating',
            progress: null,
        },
    ]);
});

describe('POST /api/challenge/progress', () => {
    it('未認証の場合、batch処理前に401を返す', async () => {
        mocks.auth.mockResolvedValue(null);

        const response = await POST(request({ challengeIds: [FIRST_ID] }));

        expect(response.status).toBe(401);
        expect(mocks.getFreshChallengeProgressBatch).not.toHaveBeenCalled();
    });

    it('有効なIDを認証済みuserで1回だけbatch処理する', async () => {
        const response = await POST(request({ challengeIds: [FIRST_ID, SECOND_ID] }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            results: await mocks.getFreshChallengeProgressBatch.mock.results[0].value,
        });
        expect(mocks.getFreshChallengeProgressBatch).toHaveBeenCalledOnce();
        expect(mocks.auth).toHaveBeenCalledOnce();
        expect(mocks.getFreshChallengeProgressBatch).toHaveBeenCalledWith(
            USER_ID,
            [FIRST_ID, SECOND_ID],
        );
    });

    it('不正JSONを400で拒否する', async () => {
        const response = await POST(new NextRequest(
            'http://localhost/api/challenge/progress',
            { method: 'POST', body: '{' },
        ));

        expect(response.status).toBe(400);
        expect(mocks.getFreshChallengeProgressBatch).not.toHaveBeenCalled();
    });

    it.each([
        { body: {}, label: 'unknown shape' },
        {
            body: { challengeIds: [FIRST_ID], extra: true },
            label: 'extra property',
        },
        { body: { challengeIds: 'not-an-array' }, label: 'non-array' },
        { body: { challengeIds: [] }, label: 'empty' },
        {
            body: { challengeIds: [FIRST_ID, FIRST_ID] },
            label: 'duplicate',
        },
        { body: { challengeIds: ['invalid'] }, label: 'invalid UUID' },
        {
            body: {
                challengeIds: Array.from(
                    { length: MAX_CHALLENGE_PROGRESS_BATCH_SIZE + 1 },
                    (_value, index) =>
                        `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                ),
            },
            label: 'over limit',
        },
    ])('不正入力をDB処理前に400で拒否する: $label', async ({ body }) => {
        const response = await POST(request(body));

        expect(response.status).toBe(400);
        expect(mocks.getFreshChallengeProgressBatch).not.toHaveBeenCalled();
    });

    it('batch基盤障害を固定エラーへ変換して500を返す', async () => {
        const rawFailure = new Error('raw batch failure');
        mocks.getFreshChallengeProgressBatch.mockRejectedValue(rawFailure);

        const response = await POST(request({ challengeIds: [FIRST_ID] }));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: 'Failed to load challenge progress',
        });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:progress:batch',
            expect.objectContaining({
                code: 'CHALLENGE_PROGRESS_BATCH_UNAVAILABLE',
                context: { stage: 'unexpected' },
            }),
        );
        expect(mocks.reportError).not.toHaveBeenCalledWith(
            expect.anything(),
            rawFailure,
            expect.anything(),
        );
    });
});
