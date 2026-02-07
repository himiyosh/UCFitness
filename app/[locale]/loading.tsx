export default function Loading() {
    return (
        <div className="flex items-center justify-center min-h-[50vh] p-8">
            <div className="flex flex-col items-center gap-4">
                <div className="relative">
                    <div className="h-12 w-12 rounded-full border-t-4 border-b-4 border-[var(--theme-primary)] animate-spin"></div>
                    <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-t-4 border-b-4 border-[var(--theme-primary)]/20 opacity-30 animate-pulse"></div>
                </div>
                <p className="text-[var(--theme-text-secondary,#6b7280)] text-sm font-semibold tracking-wide animate-pulse">Loading...</p>
            </div>
        </div>
    );
}
