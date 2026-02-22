'use client';

// Sparkline コンポーネント — 過去7日間のステップ数を棒グラフで表示
export default function Sparkline({ history, className = "" }: { history: { date: string; steps: number }[], className?: string }) {
    if (!history || history.length === 0) return null;

    // Last 7 days logic
    // We want to show a consistent 7 bars, even if data is missing for some days
    // But since `history` from backend contains sparse data (only days with steps), we need to fill gaps OR just show what we have.
    // For simplicity, let's just show the last N entries we have, or up to 7, sorted by date.
    // 
    // Ideally: 
    // 1. Get today
    // 2. Generate last 7 dates
    // 3. Map to steps (0 if missing)

    // Quick approximation: Just slice last 7 of sorted history
    const recentHistory = history.slice(-7);
    const max = Math.max(...recentHistory.map(h => h.steps)) || 1;

    return (
        <div className={`flex items-end gap-0.5 h-8 w-16 ${className}`}>
            {recentHistory.map((h) => {
                const heightPct = Math.max((h.steps / max) * 100, 10); // Min 10% height
                return (
                    <div
                        key={h.date}
                        className="w-2 bg-[var(--theme-primary)]/30 rounded-t-sm"
                        style={{ height: `${heightPct}%` }}
                        title={`${h.date}: ${h.steps}`}
                    />
                );
            })}
        </div>
    );
}
