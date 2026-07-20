import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';

interface SignInInput {
    user: {
        email: string;
        name: string;
        image: string;
    };
    account: {
        provider: string;
        providerAccountId: string;
        access_token: string;
        refresh_token: string;
        expires_at: number;
    } | null;
}

interface CapturedAuthConfig {
    callbacks: {
        signIn: (input: SignInInput) => Promise<boolean>;
    };
}

const mocks = vi.hoisted(() => ({
    backfillUserSteps: vi.fn(),
    nextAuth: vi.fn<(config: CapturedAuthConfig) => void>(),
    reportError: vi.fn(),
    from: vi.fn(),
}));

vi.mock('next-auth', () => ({
    default: (config: CapturedAuthConfig) => {
        mocks.nextAuth(config);
        return {
            handlers: {},
            auth: vi.fn(),
            signIn: vi.fn(),
            signOut: vi.fn(),
        };
    },
}));

vi.mock('@/lib/services/step-manager', () => ({
    backfillUserSteps: mocks.backfillUserSteps,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

vi.mock('@/lib/errors', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/errors')>();
    return {
        ...original,
        reportError: mocks.reportError,
    };
});

await import('@/lib/auth');

function getSignInCallback(): CapturedAuthConfig['callbacks']['signIn'] {
    const config = mocks.nextAuth.mock.calls[0]?.[0];
    if (!config) {
        throw new Error('NextAuth configuration was not captured');
    }
    return config.callbacks.signIn;
}

const signInCallback = getSignInCallback();

describe('auth signIn initial Fitbit backfill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.from.mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: null,
                            error: { code: 'PGRST116' },
                        }),
                    }),
                }),
            }),
            insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: { id: 'new-user-id' },
                        error: null,
                    }),
                }),
            }),
        });
    });

    it('初回履歴同期の再試行枯渇を記録しログインは継続する', async () => {
        const retryError = new AppError(
            'Fitbit API error: 503',
            'FITBIT_API_RETRY_EXHAUSTED',
            { status: 503, attempts: 4 },
        );
        mocks.backfillUserSteps.mockRejectedValueOnce(retryError);

        await expect(signInCallback({
            user: {
                email: 'new-user@example.test',
                name: 'New User',
                image: 'https://example.test/avatar.png',
            },
            account: {
                provider: 'fitbit',
                providerAccountId: 'fitbit-user-id',
                access_token: 'access-token',
                refresh_token: 'refresh-token',
                expires_at: 1_800_000_000,
            },
        })).resolves.toBe(true);

        expect(mocks.reportError).toHaveBeenCalledWith(
            'auth.signIn:initialBackfillDeferred',
            retryError,
            { userId: 'new-user-id' },
        );
    });
});
