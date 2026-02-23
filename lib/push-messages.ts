/**
 * プッシュ通知メッセージの i18n ユーティリティ
 *
 * サーバーサイド（cron, lib）からプッシュ通知を送信する際に使用する。
 * next-intl はクライアント/Server Component 用のため、
 * cron ジョブや lib 関数では直接使えない。
 * ユーザーの `language` カラム（'ja' | 'en'）で言語を切り替える。
 */

export type PushLocale = 'ja' | 'en';

/** ユーザーの言語設定を安全に正規化する */
export function normalizePushLocale(language: string | null | undefined): PushLocale {
    return language === 'en' ? 'en' : 'ja'; // デフォルトは日本語
}

// ─── バッジ獲得通知 ───

export function badgeUnlockedTitle(locale: PushLocale): string {
    return locale === 'ja'
        ? '🎉 バッジ獲得！🏆'
        : '🎉 New Badge Unlocked! 🏆';
}

export function badgeUnlockedBody(locale: PushLocale, badgeNames: string): string {
    return locale === 'ja'
        ? `おめでとう！「${badgeNames}」を獲得しました ✨`
        : `Congratulations! You earned: ${badgeNames} ✨`;
}

// ─── ウィークリーサマリー ───

export function weeklySummaryTitle(locale: PushLocale): string {
    return locale === 'ja'
        ? '📊 ウィークリーサマリー'
        : '📊 Weekly Summary';
}

/** 曜日ラベル（ウィークリーサマリー用） */
const DAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;
const DAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function getDayLabel(locale: PushLocale, dayIndex: number): string {
    return locale === 'ja' ? DAY_LABELS_JA[dayIndex] : DAY_LABELS_EN[dayIndex];
}

interface WeeklySummaryData {
    totalSteps: number;
    totalCoins: number;
    bestDay: { date: string; steps: number } | null;
}

export function formatWeeklySummaryBody(locale: PushLocale, summary: WeeklySummaryData): string {
    const steps = summary.totalSteps.toLocaleString('en-US');
    const coins = summary.totalCoins.toLocaleString('en-US');

    if (locale === 'ja') {
        let body = `先週の歩数: ${steps} 歩 | +${coins} UC`;
        if (summary.bestDay) {
            const bestDate = new Date(`${summary.bestDay.date}T00:00:00Z`);
            const dayLabel = DAY_LABELS_JA[bestDate.getUTCDay()];
            const bestSteps = summary.bestDay.steps.toLocaleString('en-US');
            body += ` | ベスト: ${dayLabel} (${bestSteps} 歩)`;
        }
        return body;
    }

    let body = `Last week: ${steps} steps | +${coins} UC`;
    if (summary.bestDay) {
        const bestDate = new Date(`${summary.bestDay.date}T00:00:00Z`);
        const dayLabel = DAY_LABELS_EN[bestDate.getUTCDay()];
        const bestSteps = summary.bestDay.steps.toLocaleString('en-US');
        body += ` | Best day: ${dayLabel} (${bestSteps} steps)`;
    }
    return body;
}

// ─── 歩数リマインダー ───

export function stepReminderTitle(locale: PushLocale): string {
    return locale === 'ja'
        ? '🏃 歩数リマインダー'
        : '🏃 Step Reminder';
}

export function stepReminderBody(
    locale: PushLocale,
    currentSteps: number,
    goal: number,
    progressPercent: number,
    remaining: number,
): string {
    const fmt = (n: number): string => n.toLocaleString('en-US');
    return locale === 'ja'
        ? `今日の歩数: ${fmt(currentSteps)} / ${fmt(goal)} (${progressPercent}%) — あと ${fmt(remaining)} 歩！`
        : `Today: ${fmt(currentSteps)} / ${fmt(goal)} (${progressPercent}%) — ${fmt(remaining)} steps to go!`;
}
