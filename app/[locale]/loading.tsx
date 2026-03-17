/**
 * グローバルローディング表示
 * Next.js の loading.tsx は Server Component（hooks 使用不可）のため、
 * aria-label で多言語ヒントを提供し、視覚テキストは CSS で隠す
 */
export default function Loading() {
    return (
        <div className="flex items-center justify-center min-h-[50vh] p-8" role="status" aria-label="Loading">
            <div className="flex flex-col items-center gap-4">
                <div className="relative">
                    <div className="h-12 w-12 rounded-full border-t-4 border-b-4 border-[var(--theme-primary)] animate-spin"></div>
                    <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-t-4 border-b-4 border-[var(--theme-primary)]/20 opacity-30 animate-pulse"></div>
                </div>
                <span className="sr-only">Loading</span>
            </div>
        </div>
    );
}
