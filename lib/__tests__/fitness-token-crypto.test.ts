import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    decryptFitnessToken,
    encryptFitnessToken,
} from '@/lib/fitness-token-crypto';

const accessTokenContext = {
    userId: 'user-1',
    provider: 'google_health',
    tokenType: 'access',
} as const;

describe('fitness-token-crypto', () => {
    beforeEach(() => {
        process.env.FITNESS_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    });

    afterEach(() => {
        delete process.env.FITNESS_TOKEN_ENCRYPTION_KEY;
    });

    it('有効な32バイト鍵の場合、トークンを暗号化して復号できる', async () => {
        const token = 'google-health-access-token';

        const encrypted = await encryptFitnessToken(token, accessTokenContext);

        expect(encrypted).toMatch(/^v2\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
        expect(encrypted).not.toContain(token);
        await expect(
            decryptFitnessToken(encrypted, accessTokenContext),
        ).resolves.toBe(token);
    });

    it('同じトークンを複数回暗号化した場合、ランダムな暗号文を生成する', async () => {
        const first = await encryptFitnessToken('same-token', accessTokenContext);
        const second = await encryptFitnessToken('same-token', accessTokenContext);

        expect(first).not.toBe(second);
    });

    it('暗号文が改ざんされた場合、復号を拒否する', async () => {
        const encrypted = await encryptFitnessToken('protected-token', accessTokenContext);
        const tampered = `${encrypted.slice(0, -1)}A`;

        await expect(decryptFitnessToken(tampered, accessTokenContext)).rejects.toThrow(
            'Unable to decrypt fitness token',
        );
    });

    it('別ユーザーまたは別トークン種別へ暗号文を移した場合、復号を拒否する', async () => {
        const encrypted = await encryptFitnessToken('protected-token', accessTokenContext);

        await expect(decryptFitnessToken(encrypted, {
            ...accessTokenContext,
            userId: 'user-2',
        })).rejects.toThrow('Unable to decrypt fitness token');
        await expect(decryptFitnessToken(encrypted, {
            ...accessTokenContext,
            tokenType: 'refresh',
        })).rejects.toThrow('Unable to decrypt fitness token');
    });

    it('鍵が32バイトでない場合、暗号化を拒否する', async () => {
        process.env.FITNESS_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');

        await expect(encryptFitnessToken('token', accessTokenContext)).rejects.toThrow(
            'FITNESS_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
        );
    });
});
