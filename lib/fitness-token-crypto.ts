const TOKEN_ENVELOPE_VERSION = 'v2';

export interface FitnessTokenContext {
    userId: string;
    provider: 'google_health';
    tokenType: 'access' | 'refresh';
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
    try {
        const binary = atob(value);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
        throw new Error('Invalid encrypted token encoding');
    }
}

function getEncryptionKeyBytes(): Uint8Array<ArrayBuffer> {
    const encodedKey = process.env.FITNESS_TOKEN_ENCRYPTION_KEY;
    if (!encodedKey) {
        throw new Error('FITNESS_TOKEN_ENCRYPTION_KEY is not configured');
    }

    const keyBytes = base64ToBytes(encodedKey);
    if (keyBytes.byteLength !== 32) {
        throw new Error('FITNESS_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }

    return keyBytes;
}

async function importEncryptionKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        getEncryptionKeyBytes(),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
    );
}

function createTokenContext(context: FitnessTokenContext): Uint8Array<ArrayBuffer> {
    if (!context.userId.trim()) {
        throw new Error('Fitness token context requires a user ID');
    }

    return new TextEncoder().encode(
        `ucfitness-fitness-token-v2:${context.provider}:${context.userId}:${context.tokenType}`,
    );
}

export async function encryptFitnessToken(
    token: string,
    context: FitnessTokenContext,
): Promise<string> {
    if (!token.trim()) {
        throw new Error('Cannot encrypt an empty fitness token');
    }

    const initializationVector = crypto.getRandomValues(new Uint8Array(12));
    const key = await importEncryptionKey();
    const ciphertext = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: initializationVector,
            additionalData: createTokenContext(context),
        },
        key,
        new TextEncoder().encode(token),
    );

    return [
        TOKEN_ENVELOPE_VERSION,
        bytesToBase64(initializationVector),
        bytesToBase64(new Uint8Array(ciphertext)),
    ].join('.');
}

export async function decryptFitnessToken(
    envelope: string,
    context: FitnessTokenContext,
): Promise<string> {
    const [version, initializationVectorValue, ciphertextValue, extraPart] = envelope.split('.');
    if (
        version !== TOKEN_ENVELOPE_VERSION
        || !initializationVectorValue
        || !ciphertextValue
        || extraPart !== undefined
    ) {
        throw new Error('Unsupported encrypted token envelope');
    }

    const initializationVector = base64ToBytes(initializationVectorValue);
    if (initializationVector.byteLength !== 12) {
        throw new Error('Invalid encrypted token initialization vector');
    }

    try {
        const key = await importEncryptionKey();
        const plaintext = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: initializationVector,
                additionalData: createTokenContext(context),
            },
            key,
            base64ToBytes(ciphertextValue),
        );
        return new TextDecoder().decode(plaintext);
    } catch {
        throw new Error('Unable to decrypt fitness token');
    }
}
