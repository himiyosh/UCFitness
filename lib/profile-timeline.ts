const JST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

interface TimelineBase { id: string; occurredOn: string | null; title: string }
export interface ChallengeTimelineEntry extends TimelineBase {
    kind: 'challenge'; status: 'completed' | 'ended'; progressSteps: number | null;
}
export interface BadgeTimelineEntry extends TimelineBase { kind: 'badge'; badgeCode: string }
export type ProfileTimelineEntry = ChallengeTimelineEntry | BadgeTimelineEntry;
export interface ProfileTimelineGroup { monthKey: string | null; entries: ProfileTimelineEntry[] }
export const PROFILE_TIMELINE_PAGE_SIZE = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
function isDateOnly(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
function toJstDate(value: unknown): string | null {
    if (isDateOnly(value)) return value;
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : JST_DATE_FORMATTER.format(date);
}
function normalizeRelation(value: unknown): Record<string, unknown> | null {
    const relation = Array.isArray(value) ? value[0] : value;
    return isRecord(relation) ? relation : null;
}
function readNonNegativeNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function toChallengeEntry(row: unknown, today: string): ChallengeTimelineEntry | null | undefined {
    if (!isRecord(row) || typeof row.id !== 'string' || typeof row.is_completed !== 'boolean') {
        return null;
    }
    const challenge = normalizeRelation(row.challenge);
    if (!challenge || typeof challenge.id !== 'string' || typeof challenge.title !== 'string'
        || !isDateOnly(challenge.end_date)) return null;
    if (!row.is_completed && challenge.end_date >= today) return undefined;
    return {
        id: `challenge:${row.id}`,
        kind: 'challenge',
        occurredOn: row.is_completed ? toJstDate(row.completed_at) : challenge.end_date,
        progressSteps: readNonNegativeNumber(row.progress_steps),
        status: row.is_completed ? 'completed' : 'ended',
        title: challenge.title,
    };
}
function toBadgeEntry(row: unknown): BadgeTimelineEntry | null {
    if (!isRecord(row) || typeof row.badge_code !== 'string'
        || typeof row.period_date !== 'string') return null;
    const badge = normalizeRelation(row.badges);
    if (!badge || typeof badge.name !== 'string') return null;
    return {
        id: `badge:${row.badge_code}:${row.period_date}`,
        kind: 'badge',
        badgeCode: row.badge_code,
        occurredOn: toJstDate(row.awarded_at),
        title: badge.name,
    };
}
export function buildProfileTimeline(
    challengeRows: readonly unknown[],
    badgeRows: readonly unknown[],
    today: string,
): { entries: ProfileTimelineEntry[]; malformedChallengeCount: number; malformedBadgeCount: number } {
    if (!isDateOnly(today)) throw new Error('today must use YYYY-MM-DD');
    const challenges = challengeRows.map((row) => toChallengeEntry(row, today));
    const badges = badgeRows.map(toBadgeEntry);
    const entries = [...challenges, ...badges]
        .filter((entry): entry is ProfileTimelineEntry => entry != null)
        .sort((a, b) => {
            if (a.occurredOn === null) return b.occurredOn === null ? a.id.localeCompare(b.id) : 1;
            if (b.occurredOn === null) return -1;
            return b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id);
        });
    return {
        entries,
        malformedChallengeCount: challenges.filter((entry) => entry === null).length,
        malformedBadgeCount: badges.filter((entry) => entry === null).length,
    };
}
export function groupProfileTimelineEntries(
    entries: readonly ProfileTimelineEntry[],
): ProfileTimelineGroup[] {
    const groups = new Map<string | null, ProfileTimelineEntry[]>();
    for (const entry of entries) {
        const key = entry.occurredOn?.slice(0, 7) ?? null;
        const group = groups.get(key);
        if (group) group.push(entry);
        else groups.set(key, [entry]);
    }
    return [...groups].map(([monthKey, grouped]) => ({ monthKey, entries: grouped }));
}
export function getProfileTimelineWindow(
    entries: readonly ProfileTimelineEntry[],
    visibleCount: number,
): { visibleEntries: ProfileTimelineEntry[]; remainingCount: number; nextBatchCount: number } {
    const count = Math.max(PROFILE_TIMELINE_PAGE_SIZE, visibleCount);
    const remainingCount = Math.max(0, entries.length - count);
    return {
        visibleEntries: entries.slice(0, count),
        remainingCount,
        nextBatchCount: Math.min(PROFILE_TIMELINE_PAGE_SIZE, remainingCount),
    };
}
