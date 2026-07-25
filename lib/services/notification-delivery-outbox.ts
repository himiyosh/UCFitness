import { getJSTDateString } from '@/lib/date-utils';
import { AppError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidISODate, isValidUUID } from '@/lib/validation';

import type {
    NotificationDeliveryClaimRpcArgs,
    NotificationDeliveryClaimRpcRow,
    NotificationDeliveryCompleteRpcArgs,
    NotificationDeliveryReleaseRpcArgs,
} from '@/types/database';

if (typeof window !== 'undefined') throw new AppError(
    'Notification delivery outbox is server-only', 'NOTIFICATION_OUTBOX_SERVER_ONLY', { stage: 'module' });

export const CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC = 'claim_notification_delivery_outbox';
export const COMPLETE_NOTIFICATION_DELIVERY_OUTBOX_RPC = 'complete_notification_delivery_outbox';
export const RELEASE_NOTIFICATION_DELIVERY_OUTBOX_RPC = 'release_notification_delivery_outbox';
export const NOTIFICATION_DELIVERY_FAILURE_CODES = [
    'SOURCE_DATA_UNAVAILABLE', 'PAYLOAD_BUILD_FAILED',
    'PUSH_DELIVERY_FAILED', 'PUSH_DELIVERY_INCOMPLETE',
] as const;

const MAX_CLAIM_USERS = 20;
const ISO_WEEK_KEY_PATTERN = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/;
const DAY_MS = 86_400_000;
const ERRORS = {
    claimInput: ['Invalid notification outbox claim input', 'NOTIFICATION_OUTBOX_CLAIM_INPUT_INVALID', 'claim-input'],
    claimRpc: ['Notification outbox claim failed', 'NOTIFICATION_OUTBOX_CLAIM_FAILED', 'claim-rpc'],
    claimResult: ['Notification outbox claim returned an invalid result', 'NOTIFICATION_OUTBOX_CLAIM_RESULT_INVALID', 'claim-result'],
    completeInput: ['Invalid notification outbox completion input', 'NOTIFICATION_OUTBOX_COMPLETE_INPUT_INVALID', 'complete-input'],
    completeRpc: ['Notification outbox completion failed', 'NOTIFICATION_OUTBOX_COMPLETE_FAILED', 'complete-rpc'],
    completeResult: ['Notification outbox completion returned an invalid result', 'NOTIFICATION_OUTBOX_COMPLETE_RESULT_INVALID', 'complete-result'],
    releaseInput: ['Invalid notification outbox release input', 'NOTIFICATION_OUTBOX_RELEASE_INPUT_INVALID', 'release-input'],
    releaseRpc: ['Notification outbox release failed', 'NOTIFICATION_OUTBOX_RELEASE_FAILED', 'release-rpc'],
    releaseResult: ['Notification outbox release returned an invalid result', 'NOTIFICATION_OUTBOX_RELEASE_RESULT_INVALID', 'release-result'],
    occurrenceInput: ['Invalid notification outbox occurrence input', 'NOTIFICATION_OUTBOX_OCCURRENCE_INPUT_INVALID', 'occurrence-input'],
} as const;

export type NotificationDeliveryType = NotificationDeliveryClaimRpcArgs['p_notification_type'];
export type NotificationDeliveryFailureCode = typeof NOTIFICATION_DELIVERY_FAILURE_CODES[number];
export type NotificationDeliveryClaim = NotificationDeliveryClaimRpcRow;

export interface ClaimNotificationDeliveriesOptions {
    notificationType: NotificationDeliveryType; occurrenceKey: string;
    userIds: readonly string[]; leaseOwner: string;
}
export interface CompleteNotificationDeliveryOptions {
    notificationType: NotificationDeliveryType; occurrenceKey: string; userId: string;
    leaseOwner: string; claimToken: string;
}

export interface ReleaseNotificationDeliveryOptions extends CompleteNotificationDeliveryOptions {
    failureCode: NotificationDeliveryFailureCode;
}
type ErrorKey = keyof typeof ERRORS;

function outboxError(key: ErrorKey, failureCode?: NotificationDeliveryFailureCode): AppError {
    const [message, code, stage] = ERRORS[key];
    return new AppError(message, code, failureCode ? { stage, failureCode } : { stage });
}

function isNotificationDeliveryType(value: unknown): value is NotificationDeliveryType {
    return value === 'step-reminder' || value === 'weekly-summary';
}

function isoWeekKey(dateString: string): string {
    const date = new Date(`${dateString}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const isoYear = date.getUTCFullYear();
    const yearStart = Date.UTC(isoYear, 0, 1);
    const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function isCanonicalIsoWeekKey(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const match = ISO_WEEK_KEY_PATTERN.exec(value);
    if (!match) return false;
    const [, year, week] = match;
    if (year === '0000') return false;
    return Number(week) <= Number(isoWeekKey(`${year}-12-28`).slice(-2));
}

function isCanonicalDateKey(value: unknown): value is string {
    return isValidISODate(value) && !value.startsWith('0000-');
}

export function isValidNotificationOccurrenceKey(
    notificationType: unknown,
    occurrenceKey: unknown,
): occurrenceKey is string {
    return notificationType === 'step-reminder'
        ? isCanonicalDateKey(occurrenceKey)
        : notificationType === 'weekly-summary' && isCanonicalIsoWeekKey(occurrenceKey);
}

export function buildStepReminderOccurrenceKey(date: Date): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw outboxError('occurrenceInput');
    return getJSTDateString(date);
}

export function buildWeeklySummaryOccurrenceKey(jstDate: string): string {
    if (!isCanonicalDateKey(jstDate)) throw outboxError('occurrenceInput');
    return isoWeekKey(jstDate);
}

function assertOccurrence(
    notificationType: unknown,
    occurrenceKey: unknown,
    errorKey: ErrorKey,
): asserts notificationType is NotificationDeliveryType {
    if (!isNotificationDeliveryType(notificationType)
        || !isValidNotificationOccurrenceKey(notificationType, occurrenceKey)) {
        throw outboxError(errorKey);
    }
}

function normalizeClaimUserIds(userIds: readonly string[]): string[] {
    if (!Array.isArray(userIds) || userIds.length < 1 || userIds.length > MAX_CLAIM_USERS
        || !userIds.every(isValidUUID)) {
        throw outboxError('claimInput');
    }
    return [...new Set(userIds.map((userId) => userId.toLowerCase()))].sort();
}

function assertFence(options: CompleteNotificationDeliveryOptions, errorKey: ErrorKey): void {
    assertOccurrence(options.notificationType, options.occurrenceKey, errorKey);
    if (!isValidUUID(options.userId) || !isValidUUID(options.leaseOwner)
        || !isValidUUID(options.claimToken)) {
        throw outboxError(errorKey);
    }
}

async function callRpc(name: string, args: Record<string, unknown>, errorKey: ErrorKey,
    failureCode?: NotificationDeliveryFailureCode): Promise<unknown> {
    let result: { data: unknown; error: unknown };
    try {
        result = await Promise.resolve().then(() => supabaseAdmin.rpc(name, args));
    } catch {
        throw outboxError(errorKey, failureCode);
    }
    if (result.error !== null) throw outboxError(errorKey, failureCode);
    return result.data;
}

function parseClaims(data: unknown, requestedUserIds: string[]): NotificationDeliveryClaim[] {
    if (!Array.isArray(data) || data.length > requestedUserIds.length) throw outboxError('claimResult');
    const requested = new Set(requestedUserIds);
    const seenUsers = new Set<string>();
    const seenTokens = new Set<string>();
    let previousUserId = '';
    return data.map((value) => {
        if (!isRecord(value) || Object.keys(value).length !== 2
            || !isValidUUID(value.user_id) || !isValidUUID(value.claim_token)) {
            throw outboxError('claimResult');
        }
        const userId = value.user_id.toLowerCase();
        const claimToken = value.claim_token.toLowerCase();
        if (!requested.has(userId) || seenUsers.has(userId) || seenTokens.has(claimToken)
            || userId < previousUserId) {
            throw outboxError('claimResult');
        }
        previousUserId = userId;
        seenUsers.add(userId);
        seenTokens.add(claimToken);
        return { user_id: userId, claim_token: claimToken };
    });
}

export async function claimNotificationDeliveries(
    options: ClaimNotificationDeliveriesOptions,
): Promise<NotificationDeliveryClaim[]> {
    if (!isRecord(options)) throw outboxError('claimInput');
    assertOccurrence(options.notificationType, options.occurrenceKey, 'claimInput');
    if (!isValidUUID(options.leaseOwner)) throw outboxError('claimInput');
    const userIds = normalizeClaimUserIds(options.userIds);
    const args: NotificationDeliveryClaimRpcArgs = {
        p_notification_type: options.notificationType,
        p_occurrence_key: options.occurrenceKey,
        p_user_ids: userIds,
        p_lease_owner: options.leaseOwner.toLowerCase(),
    };
    return parseClaims(await callRpc(CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, args, 'claimRpc'), userIds);
}

/** `true` includes an idempotent repeat by the same owner/token; `false` is a stale or missing fence. */
export async function completeNotificationDelivery(
    options: CompleteNotificationDeliveryOptions,
): Promise<boolean> {
    if (!isRecord(options)) throw outboxError('completeInput');
    assertFence(options, 'completeInput');
    const args: NotificationDeliveryCompleteRpcArgs = {
        p_notification_type: options.notificationType,
        p_occurrence_key: options.occurrenceKey,
        p_user_id: options.userId.toLowerCase(),
        p_lease_owner: options.leaseOwner.toLowerCase(),
        p_claim_token: options.claimToken.toLowerCase(),
    };
    const data = await callRpc(COMPLETE_NOTIFICATION_DELIVERY_OUTBOX_RPC, args, 'completeRpc');
    if (typeof data !== 'boolean') throw outboxError('completeResult');
    return data;
}

/** `false` is a normal stale, expired, completed, or missing fence and must not be treated as success. */
export async function releaseNotificationDelivery(
    options: ReleaseNotificationDeliveryOptions,
): Promise<boolean> {
    if (!isRecord(options)) throw outboxError('releaseInput');
    assertFence(options, 'releaseInput');
    if (!NOTIFICATION_DELIVERY_FAILURE_CODES.includes(options.failureCode)) {
        throw outboxError('releaseInput');
    }
    const args: NotificationDeliveryReleaseRpcArgs = {
        p_notification_type: options.notificationType,
        p_occurrence_key: options.occurrenceKey,
        p_user_id: options.userId.toLowerCase(),
        p_lease_owner: options.leaseOwner.toLowerCase(),
        p_claim_token: options.claimToken.toLowerCase(),
    };
    const data = await callRpc(RELEASE_NOTIFICATION_DELIVERY_OUTBOX_RPC, args, 'releaseRpc',
        options.failureCode);
    if (typeof data !== 'boolean') throw outboxError('releaseResult', options.failureCode);
    return data;
}
