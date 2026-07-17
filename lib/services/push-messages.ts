/**
 * プッシュ通知メッセージの i18n ユーティリティ
 *
 * サーバーサイド（cron, lib）からプッシュ通知を送信する際に使用する。
 * next-intl はクライアント/Server Component 用のため、
 * cron ジョブや lib 関数では直接使えない。
 * ユーザーの `language` カラム（'ja' | 'en'）で言語を切り替える。
 */

import enMessages from '@/messages/en.json';
import jaMessages from '@/messages/ja.json';

export type PushLocale = 'ja' | 'en';

interface BadgeNameSummary {
    label: string;
    count: number;
}

const BADGE_NAMES: Record<PushLocale, Record<string, string>> = {
    ja: jaMessages.Museum.badgeNames,
    en: enMessages.Museum.badgeNames,
};

/** ユーザーの言語設定を安全に正規化する */
export function normalizePushLocale(language: string | null | undefined): PushLocale {
    return language === 'en' ? 'en' : 'ja'; // デフォルトは日本語
}

// ─── バッジ獲得通知 ───

export function formatLocalizedBadgeNames(
    locale: PushLocale,
    badgeCodes: string[],
): BadgeNameSummary {
    const uniqueCodes = Array.from(new Set(badgeCodes));
    const visibleNames = uniqueCodes
        .slice(0, 3)
        .map((code) => BADGE_NAMES[locale][code] ?? code);
    const hiddenCount = uniqueCodes.length - visibleNames.length;

    if (locale === 'ja') {
        const names = visibleNames.map((name) => `「${name}」`).join('、');
        return {
            label: hiddenCount > 0 ? `${names}ほか${hiddenCount}個` : names,
            count: uniqueCodes.length,
        };
    }

    const names = visibleNames.join(', ');
    return {
        label: hiddenCount > 0 ? `${names}, and ${hiddenCount} more` : names,
        count: uniqueCodes.length,
    };
}

export function badgeUnlockedTitle(locale: PushLocale, badgeCount = 1): string {
    if (badgeCount > 1) {
        return locale === 'ja'
            ? `🎉 バッジを${badgeCount}個獲得！🏆`
            : `🎉 ${badgeCount} New Badges! 🏆`;
    }

    return locale === 'ja'
        ? '🎉 バッジ獲得！🏆'
        : '🎉 New Badge Unlocked! 🏆';
}

export function badgeUnlockedBody(
    locale: PushLocale,
    badgeNames: string,
    badgeCount = 1,
    bonusCoins = 0,
): string {
    const numberLocale = locale === 'ja' ? 'ja-JP' : 'en-US';
    const rewardSuffix = bonusCoins > 0
        ? locale === 'ja'
            ? ` ストリーク節目報酬として +${bonusCoins.toLocaleString(numberLocale)} UC！`
            : ` Streak milestone reward: +${bonusCoins.toLocaleString(numberLocale)} UC!`
        : '';

    if (badgeCount > 1) {
        const body = locale === 'ja'
            ? `おめでとう！${badgeNames}をまとめて獲得しました ✨`
            : `Congratulations! You earned ${badgeNames} ✨`;
        return `${body}${rewardSuffix}`;
    }

    const body = locale === 'ja'
        ? `おめでとう！${badgeNames}を獲得しました ✨`
        : `Congratulations! You earned: ${badgeNames} ✨`;
    return `${body}${rewardSuffix}`;
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
    const numberLocale = locale === 'ja' ? 'ja-JP' : 'en-US';
    const steps = summary.totalSteps.toLocaleString(numberLocale);
    const coins = summary.totalCoins.toLocaleString(numberLocale);

    if (locale === 'ja') {
        let body = `先週の歩数: ${steps} 歩 | +${coins} UC`;
        if (summary.bestDay) {
            const bestDate = new Date(`${summary.bestDay.date}T00:00:00Z`);
            const dayLabel = DAY_LABELS_JA[bestDate.getUTCDay()];
            const bestSteps = summary.bestDay.steps.toLocaleString(numberLocale);
            body += ` | ベスト: ${dayLabel} (${bestSteps} 歩)`;
        }
        return body;
    }

    let body = `Last week: ${steps} steps | +${coins} UC`;
    if (summary.bestDay) {
        const bestDate = new Date(`${summary.bestDay.date}T00:00:00Z`);
        const dayLabel = DAY_LABELS_EN[bestDate.getUTCDay()];
        const bestSteps = summary.bestDay.steps.toLocaleString(numberLocale);
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
    const numberLocale = locale === 'ja' ? 'ja-JP' : 'en-US';
    const fmt = (n: number): string => n.toLocaleString(numberLocale);
    return locale === 'ja'
        ? `今日の歩数: ${fmt(currentSteps)} / ${fmt(goal)} (${progressPercent}%) — あと ${fmt(remaining)} 歩！`
        : `Today: ${fmt(currentSteps)} / ${fmt(goal)} (${progressPercent}%) — ${fmt(remaining)} steps to go!`;
}

// ─── テスト通知 ───

export function testNotificationTitle(locale: PushLocale): string {
    return locale === 'ja' ? '🔔 通知テスト' : '🔔 Notification Test';
}

export function testNotificationBody(locale: PushLocale): string {
    return locale === 'ja'
        ? 'UCFitnessの通知を受信できました。'
        : 'You can receive notifications from UCFitness.';
}
