// ============================================
// 構造化エラーレポート
// console.error の代わりに使用し、コンテキスト付きのログを出力
// ============================================

export class AppError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly context?: Record<string, unknown>,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'AppError';
    }
}

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|email|endpoint|p256dh|auth|key)/i;

function redactValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => redactValue(item));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
                key,
                SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactValue(entryValue),
            ]),
        );
    }

    return value;
}

/**
 * 構造化エラーログを出力
 * タイムスタンプ、操作名、コンテキスト、エラー詳細を含む
 */
export function reportError(
    operation: string,
    error: unknown,
    context?: Record<string, unknown>
): void {
    const redactedContext = redactValue(context) as Record<string, unknown> | undefined;
    const errorDetail: Record<string, unknown> = error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {}),
            ...(error instanceof AppError ? { code: error.code, errorContext: redactValue(error.context) } : {}),
        }
        : typeof error === 'object' && error !== null
            ? {
                message: JSON.stringify(redactValue(error)),
                ...(redactValue(error) as Record<string, unknown>),
            }
            : { message: String(error) };

    const entry = {
        ...redactedContext,
        timestamp: new Date().toISOString(),
        operation,
        error: errorDetail,
    };
    console.error(`[ERROR] ${operation}:`, JSON.stringify(entry));
}
