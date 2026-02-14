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

/**
 * 構造化エラーログを出力
 * タイムスタンプ、操作名、コンテキスト、エラー詳細を含む
 */
export function reportError(
    operation: string,
    error: unknown,
    context?: Record<string, unknown>
): void {
    const errorDetail: Record<string, unknown> = error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            stack: error.stack,
            ...(error instanceof AppError ? { code: error.code, errorContext: error.context } : {}),
        }
        : typeof error === 'object' && error !== null
            ? { message: JSON.stringify(error), ...error as Record<string, unknown> }
            : { message: String(error) };

    const entry = {
        ...context,
        timestamp: new Date().toISOString(),
        operation,
        error: errorDetail,
    };
    console.error(`[ERROR] ${operation}:`, JSON.stringify(entry));
}
