import 'server-only';

import { AppError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidUUID } from '@/lib/validation';

export const SAVE_PUSH_SUBSCRIPTION_RPC = 'save_push_subscription_with_generation';
export const READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC = 'read_push_subscription_generations';
export const RELEASE_PUSH_SUBSCRIPTION_RPC = 'release_push_subscription_with_generation';
export const REQUIRED_RECIPIENT_PROTOCOL_VERSION = 1 as const;

const MAX_READ_OBSERVATIONS = 20;
const ERRORS = {
    saveInput: ['Invalid push subscription save input', 'PUSH_SUBSCRIPTION_SAVE_INPUT_INVALID'],
    saveRpc: ['Push subscription save failed', 'PUSH_SUBSCRIPTION_SAVE_FAILED'],
    saveResult: ['Push subscription save returned an invalid result', 'PUSH_SUBSCRIPTION_SAVE_RESULT_INVALID'],
    readInput: ['Invalid push subscription generation input', 'PUSH_SUBSCRIPTION_GENERATION_INPUT_INVALID'],
    readRpc: ['Push subscription generation lookup failed', 'PUSH_SUBSCRIPTION_GENERATION_READ_FAILED'],
    readResult: ['Push subscription generation lookup returned an invalid result', 'PUSH_SUBSCRIPTION_GENERATION_RESULT_INVALID'],
    releaseInput: ['Invalid push subscription release input', 'PUSH_SUBSCRIPTION_RELEASE_INPUT_INVALID'],
    releaseRpc: ['Push subscription release failed', 'PUSH_SUBSCRIPTION_RELEASE_FAILED'],
    releaseResult: ['Push subscription release returned an invalid result', 'PUSH_SUBSCRIPTION_RELEASE_RESULT_INVALID'],
} as const;

interface SaveRpcArgs {
    p_user_id: string;
    p_endpoint: string;
    p_ownership_key: string;
    p_p256dh: string;
    p_auth: string;
    p_user_agent: string | null;
    p_protocol_version: typeof REQUIRED_RECIPIENT_PROTOCOL_VERSION;
}
interface ReadRpcArgs {
    p_user_id: string;
    p_subscription_ids: string[];
    p_ownership_keys: string[];
}
interface ReleaseRpcArgs {
    p_user_id: string;
    p_endpoint: string;
    p_ownership_key: string;
    p_recipient_generation: string;
    p_ownership_version: number;
}

export interface SavePushSubscriptionOptions {
    userId: string;
    endpoint: string;
    ownershipKey: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
}
export interface PushSubscriptionObservation {
    subscriptionId: string;
    ownershipKey: string;
}
export interface ReadPushSubscriptionGenerationsOptions {
    userId: string;
    observations: readonly PushSubscriptionObservation[];
}
export interface ReleasePushSubscriptionOptions {
    userId: string;
    endpoint: string;
    ownershipKey: string;
    recipientGeneration: string;
    ownershipVersion: number;
}
export interface PushSubscriptionGeneration {
    recipientGeneration: string;
    ownershipVersion: number;
    recipientProtocolVersion: 0 | typeof REQUIRED_RECIPIENT_PROTOCOL_VERSION;
}
export interface SavedPushSubscriptionAuthority extends PushSubscriptionGeneration {
    subscriptionId: string;
    recipientProtocolVersion: typeof REQUIRED_RECIPIENT_PROTOCOL_VERSION;
}
type ErrorKey = keyof typeof ERRORS;
type RpcName = typeof SAVE_PUSH_SUBSCRIPTION_RPC
    | typeof READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC
    | typeof RELEASE_PUSH_SUBSCRIPTION_RPC;

function fixedError(key: ErrorKey): AppError {
    const [message, code] = ERRORS[key];
    return new AppError(message, code);
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
    return typeof value === 'string' && value.length >= min && value.length <= max;
}

function isOwnershipKey(value: unknown): value is string {
    return isBoundedString(value, 9, 2048)
        && /^https:\/\/[^/?#]+/.test(value)
        && !value.includes('#');
}

function isPositiveVersion(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    return Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

async function callRpc(name: RpcName, args: object, errorKey: ErrorKey): Promise<unknown> {
    let result: unknown;
    try {
        result = await supabaseAdmin.rpc(name, args);
    } catch {
        throw fixedError(errorKey);
    }
    if (!isRecord(result) || !Object.hasOwn(result, 'data') || result.error !== null) {
        throw fixedError(errorKey);
    }
    return result.data;
}

export async function savePushSubscription(
    options: SavePushSubscriptionOptions,
): Promise<SavedPushSubscriptionAuthority> {
    if (!isRecord(options) || !isValidUUID(options.userId)
        || !isBoundedString(options.endpoint, 1, 2048) || !isOwnershipKey(options.ownershipKey)
        || !isBoundedString(options.p256dh, 1, 256) || !isBoundedString(options.auth, 1, 128)
        || (options.userAgent !== null && !isBoundedString(options.userAgent, 0, 2048))) {
        throw fixedError('saveInput');
    }
    const args: SaveRpcArgs = {
        p_user_id: options.userId.toLowerCase(),
        p_endpoint: options.endpoint,
        p_ownership_key: options.ownershipKey,
        p_p256dh: options.p256dh,
        p_auth: options.auth,
        p_user_agent: options.userAgent,
        p_protocol_version: REQUIRED_RECIPIENT_PROTOCOL_VERSION,
    };
    const data = await callRpc(SAVE_PUSH_SUBSCRIPTION_RPC, args, 'saveRpc');
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    const keys = [
        'subscription_id', 'stored_user_id', 'stored_endpoint', 'stored_p256dh', 'stored_auth',
        'stored_user_agent', 'stored_created_at', 'recipient_generation', 'ownership_version',
        'recipient_protocol_version',
    ];
    if (!isRecord(row) || !hasExactKeys(row, keys)
        || !isValidUUID(row.subscription_id) || !isValidUUID(row.stored_user_id)
        || row.stored_user_id.toLowerCase() !== args.p_user_id
        || row.stored_endpoint !== options.endpoint || row.stored_p256dh !== options.p256dh
        || row.stored_auth !== options.auth || row.stored_user_agent !== options.userAgent
        || typeof row.stored_created_at !== 'string' || !Number.isFinite(Date.parse(row.stored_created_at))
        || !isValidUUID(row.recipient_generation) || !isPositiveVersion(row.ownership_version)
        || row.recipient_protocol_version !== REQUIRED_RECIPIENT_PROTOCOL_VERSION) {
        throw fixedError('saveResult');
    }
    return {
        subscriptionId: row.subscription_id.toLowerCase(),
        recipientGeneration: row.recipient_generation.toLowerCase(),
        ownershipVersion: row.ownership_version,
        recipientProtocolVersion: row.recipient_protocol_version,
    };
}

export async function readPushSubscriptionGenerations(
    options: ReadPushSubscriptionGenerationsOptions,
): Promise<Map<string, PushSubscriptionGeneration>> {
    if (!isRecord(options) || !isValidUUID(options.userId) || !Array.isArray(options.observations)
        || options.observations.length < 1 || options.observations.length > MAX_READ_OBSERVATIONS) {
        throw fixedError('readInput');
    }
    const observed = new Map<string, string>();
    for (const observation of options.observations) {
        if (!isRecord(observation) || !hasExactKeys(observation, ['subscriptionId', 'ownershipKey'])
            || !isValidUUID(observation.subscriptionId) || !isOwnershipKey(observation.ownershipKey)) {
            throw fixedError('readInput');
        }
        const subscriptionId = observation.subscriptionId.toLowerCase();
        const priorKey = observed.get(subscriptionId);
        if (priorKey !== undefined && priorKey !== observation.ownershipKey) {
            throw fixedError('readInput');
        }
        observed.set(subscriptionId, observation.ownershipKey);
    }
    const observations = [...observed].sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0);
    const args: ReadRpcArgs = {
        p_user_id: options.userId.toLowerCase(),
        p_subscription_ids: observations.map(([subscriptionId]) => subscriptionId),
        p_ownership_keys: observations.map(([, ownershipKey]) => ownershipKey),
    };
    const data = await callRpc(READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC, args, 'readRpc');
    if (!Array.isArray(data) || data.length > observations.length) {
        throw fixedError('readResult');
    }
    const requestedIds = new Set(args.p_subscription_ids);
    const generations = new Map<string, PushSubscriptionGeneration>();
    let previousId = '';
    for (const row of data) {
        if (!isRecord(row) || !hasExactKeys(row, [
            'subscription_id', 'recipient_generation', 'ownership_version', 'recipient_protocol_version',
        ]) || !isValidUUID(row.subscription_id) || !isValidUUID(row.recipient_generation)
            || !isPositiveVersion(row.ownership_version)
            || (row.recipient_protocol_version !== 0
                && row.recipient_protocol_version !== REQUIRED_RECIPIENT_PROTOCOL_VERSION)) {
            throw fixedError('readResult');
        }
        const subscriptionId = row.subscription_id.toLowerCase();
        if (!requestedIds.has(subscriptionId) || generations.has(subscriptionId)
            || subscriptionId < previousId) {
            throw fixedError('readResult');
        }
        previousId = subscriptionId;
        generations.set(subscriptionId, {
            recipientGeneration: row.recipient_generation.toLowerCase(),
            ownershipVersion: row.ownership_version,
            recipientProtocolVersion: row.recipient_protocol_version,
        });
    }
    return generations;
}

export async function releasePushSubscription(
    options: ReleasePushSubscriptionOptions,
): Promise<boolean> {
    if (!isRecord(options) || !isValidUUID(options.userId)
        || !isBoundedString(options.endpoint, 1, 2048) || !isOwnershipKey(options.ownershipKey)
        || !isValidUUID(options.recipientGeneration) || !isPositiveVersion(options.ownershipVersion)) {
        throw fixedError('releaseInput');
    }
    const args: ReleaseRpcArgs = {
        p_user_id: options.userId.toLowerCase(),
        p_endpoint: options.endpoint,
        p_ownership_key: options.ownershipKey,
        p_recipient_generation: options.recipientGeneration.toLowerCase(),
        p_ownership_version: options.ownershipVersion,
    };
    const data = await callRpc(RELEASE_PUSH_SUBSCRIPTION_RPC, args, 'releaseRpc');
    if (typeof data !== 'boolean') {
        throw fixedError('releaseResult');
    }
    return data;
}
