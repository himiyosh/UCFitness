import { isAllowedPushEndpoint, isValidPushKey } from '@/lib/api/web-push';
import { isValidStepGoal } from '@/lib/step-goal';
import type { PushDeliverySummary, StoredPushSubscriptionData } from '@/lib/api/web-push';
import type { PushLocale } from '@/lib/services/push-messages';
export interface StepReminderProfile { stepGoal: number; locale: PushLocale }
export interface ParsedStepReminderRows<T> { rows: Map<string, T>; invalidUserIds: Set<string>; foreignUserIds: Set<string> }
export interface ParsedStepReminderSubscriptions { rows: Map<string, StoredPushSubscriptionData[]>; invalidUserIds: Set<string>; allUserIds: Set<string> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID_PATTERN.test(value); }
export function parseStepReminderSubscriptions(data: unknown): ParsedStepReminderSubscriptions | null {
    if (!Array.isArray(data)) return null;
    const rows = new Map<string, StoredPushSubscriptionData[]>(), allUserIds = new Set<string>();
    const invalidUserIds = new Set<string>(), idOwners = new Map<string, string>();
    const endpointOwners = new Map<string, string>();
    for (const row of data) {
        if (!isRecord(row) || !isUuid(row.user_id)) return null;
        const userId = row.user_id; allUserIds.add(userId);
        const { id, endpoint, p256dh, auth, user_agent: userAgent, created_at: createdAt } = row;
        const idOwner = typeof id === 'string' ? idOwners.get(id) : undefined, endpointOwner = typeof endpoint === 'string' ? endpointOwners.get(endpoint) : undefined;
        if (idOwner || endpointOwner) {
            invalidUserIds.add(userId); if (idOwner) invalidUserIds.add(idOwner);
            if (endpointOwner) invalidUserIds.add(endpointOwner);
        }
        if (typeof id === 'string') idOwners.set(id, userId); if (typeof endpoint === 'string') endpointOwners.set(endpoint, userId);
        if (!isUuid(id) || !isAllowedPushEndpoint(endpoint)
            || !isValidPushKey(p256dh, 256) || !isValidPushKey(auth, 128)
            || (userAgent !== null && typeof userAgent !== 'string')
            || (createdAt !== null && (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))))) {
            invalidUserIds.add(userId); continue;
        }
        const current = rows.get(userId) ?? [];
        current.push({ id, endpoint, p256dh, auth, user_agent: userAgent, created_at: createdAt }); rows.set(userId, current);
    }
    invalidUserIds.forEach((userId) => rows.delete(userId)); return { rows, allUserIds, invalidUserIds };
}
export function parseStepReminderProfiles(data: unknown, expectedIds: Set<string>): ParsedStepReminderRows<StepReminderProfile> | null {
    if (!Array.isArray(data)) return null;
    const rows = new Map<string, StepReminderProfile>(), seen = new Set<string>();
    const invalidUserIds = new Set<string>(), foreignUserIds = new Set<string>();
    for (const row of data) {
        if (!isRecord(row) || !isUuid(row.id)) return null;
        if (!expectedIds.has(row.id)) { foreignUserIds.add(row.id); continue; }
        if (seen.has(row.id)) { invalidUserIds.add(row.id); continue; }
        seen.add(row.id);
        if (!isValidStepGoal(row.step_goal) || (row.language !== 'ja' && row.language !== 'en')) invalidUserIds.add(row.id);
        else rows.set(row.id, { stepGoal: row.step_goal, locale: row.language });
    }
    expectedIds.forEach((userId) => { if (!seen.has(userId)) invalidUserIds.add(userId); });
    invalidUserIds.forEach((userId) => rows.delete(userId)); return { rows, invalidUserIds, foreignUserIds };
}
export function parseStepReminderSteps(data: unknown, expectedIds: Set<string>): ParsedStepReminderRows<number> | null {
    if (!Array.isArray(data)) return null;
    const rows = new Map<string, number>(), seen = new Set<string>();
    const invalidUserIds = new Set<string>(), foreignUserIds = new Set<string>();
    for (const row of data) {
        if (!isRecord(row) || !isUuid(row.user_id)) return null;
        if (!expectedIds.has(row.user_id)) { foreignUserIds.add(row.user_id); continue; }
        if (seen.has(row.user_id)) { invalidUserIds.add(row.user_id); continue; }
        seen.add(row.user_id);
        if (typeof row.steps !== 'number' || !Number.isSafeInteger(row.steps) || row.steps < 0) { invalidUserIds.add(row.user_id); continue; }
        rows.set(row.user_id, row.steps);
    }
    invalidUserIds.forEach((userId) => rows.delete(userId)); return { rows, invalidUserIds, foreignUserIds };
}
export function extractStepReminderRows(outcome: PromiseSettledResult<unknown>): unknown[] | null {
    if (outcome.status === 'rejected' || !isRecord(outcome.value)) return null;
    return outcome.value.error === null && Array.isArray(outcome.value.data) ? outcome.value.data : null;
}
export function isStepReminderDeliverySummary(value: unknown, subscriptionCount: number): value is PushDeliverySummary {
    if (!isRecord(value)) return false;
    const { sent, failed, expired, skippedDuplicates } = value;
    const valid = (metric: unknown): metric is number =>
        typeof metric === 'number' && Number.isSafeInteger(metric) && metric >= 0;
    return valid(sent) && valid(failed) && valid(expired) && valid(skippedDuplicates)
        && expired <= failed && skippedDuplicates <= subscriptionCount
        && sent + failed === subscriptionCount - skippedDuplicates;
}
