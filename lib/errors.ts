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
    const entry = {
        timestamp: new Date().toISOString(),
        operation,
        ...context,
        error: error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack }
            : String(error),
    };
    console.error(`[ERROR] ${operation}:`, JSON.stringify(entry));
}
