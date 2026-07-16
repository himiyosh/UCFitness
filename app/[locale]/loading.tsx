/**
 * グローバルローディング表示
 * Next.js の loading.tsx は Server Component（hooks 使用不可）のため、
 * aria-label で多言語ヒントを提供し、視覚テキストは CSS で隠す
 */
export default function Loading() {
    return (
        <div className="flex min-h-[calc(100dvh-7rem)] items-center justify-center p-4 lg:min-h-[calc(100dvh-3rem)]" role="status">
            <div className="w-full max-w-xl rounded-3xl border border-white/40 bg-white/80 p-4 shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0">
                        <div className="h-10 w-10 rounded-full border-b-4 border-t-4 border-[var(--theme-primary)] animate-spin"></div>
                        <div className="absolute left-0 top-0 h-10 w-10 rounded-full border-b-4 border-t-4 border-[var(--theme-primary)]/20 opacity-30 animate-pulse"></div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="h-3 w-28 rounded-full bg-[var(--theme-primary)]/20" />
                        <div className="mt-2 h-2 w-full rounded-full bg-gray-100" />
                    </div>
                </div>
                <span className="sr-only"><span lang="ja">読み込み中</span> / <span lang="en">Loading</span></span>
            </div>
        </div>
    );
}
