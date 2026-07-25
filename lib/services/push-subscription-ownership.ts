import 'server-only';
import { findSupersededSubscriptionIds, getPushEndpointOwnershipKey, isValidPushSubscriptionKeys } from '@/lib/api/web-push';
import { AppError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidUUID } from '@/lib/validation';
import type { StoredPushSubscriptionData } from '@/lib/api/web-push';
export const SAVE_PUSH_SUBSCRIPTION_RPC = 'save_push_subscription_with_generation', READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC = 'read_push_subscription_generations';
export const RELEASE_PUSH_SUBSCRIPTION_RPC = 'release_push_subscription_with_generation', DELETE_PUSH_SUBSCRIPTION_CAS_RPC = 'delete_push_subscription_if_unchanged';
const ERRORS = {
    saveInput: ['Invalid push subscription save input', 'PUSH_SUBSCRIPTION_SAVE_INPUT_INVALID'], saveRpc: ['Push subscription save failed', 'PUSH_SUBSCRIPTION_SAVE_FAILED'], saveLimit: ['Push subscription limit reached', 'PUSH_SUBSCRIPTION_LIMIT_REACHED'],
    saveConflict: ['Push subscription ownership changed', 'PUSH_SUBSCRIPTION_OWNERSHIP_CONFLICT'], saveResult: ['Push subscription save returned an invalid result', 'PUSH_SUBSCRIPTION_SAVE_RESULT_INVALID'], readInput: ['Invalid push subscription generation input', 'PUSH_SUBSCRIPTION_GENERATION_INPUT_INVALID'],
    readRpc: ['Push subscription generation lookup failed', 'PUSH_SUBSCRIPTION_GENERATION_READ_FAILED'], readResult: ['Push subscription generation lookup returned an invalid result', 'PUSH_SUBSCRIPTION_GENERATION_RESULT_INVALID'], releaseInput: ['Invalid push subscription release input', 'PUSH_SUBSCRIPTION_RELEASE_INPUT_INVALID'],
    releaseRpc: ['Push subscription release failed', 'PUSH_SUBSCRIPTION_RELEASE_FAILED'], releaseResult: ['Push subscription release returned an invalid result', 'PUSH_SUBSCRIPTION_RELEASE_RESULT_INVALID'], lookupRpc: ['Push subscription lookup failed', 'PUSH_SUBSCRIPTION_LOOKUP_FAILED'],
    lookupResult: ['Push subscription lookup returned an invalid result', 'PUSH_SUBSCRIPTION_LOOKUP_RESULT_INVALID'], casRpc: ['Push subscription cleanup failed', 'PUSH_SUBSCRIPTION_CLEANUP_FAILED'], casResult: ['Push subscription cleanup returned an invalid result', 'PUSH_SUBSCRIPTION_CLEANUP_RESULT_INVALID'],
} as const;
type ErrorKey = keyof typeof ERRORS;
interface SaveRpcArgs { p_user_id: string; p_endpoint: string; p_ownership_key: string; p_p256dh: string; p_auth: string; p_user_agent: string | null } interface ReadRpcArgs { p_user_id: string; p_subscription_ids: string[]; p_ownership_keys: string[] }
interface ReleaseRpcArgs { p_user_id: string; p_endpoint: string; p_ownership_key: string; p_recipient_generation: string; p_ownership_version: number } interface ObservedPushSubscription extends StoredPushSubscriptionData { id: string; user_id: string; user_agent: string | null; created_at: string | null } export interface SavedPushSubscription extends StoredPushSubscriptionData { id: string; created_at: string; recipientGeneration: string; ownershipVersion: number; pruned: number }
export interface SavePushSubscriptionOptions { userId: string; endpoint: string; ownershipKey: string; p256dh: string; auth: string; userAgent: string | null } export interface PushSubscriptionObservation { subscriptionId: string; ownershipKey: string }
export interface ReadPushSubscriptionGenerationsOptions { userId: string; observations: readonly PushSubscriptionObservation[] } export interface ReleasePushSubscriptionOptions { userId: string; endpoint: string; ownershipKey: string; recipientGeneration: string; ownershipVersion: number }
export interface PushSubscriptionGeneration { recipientGeneration: string; ownershipVersion: number }
export type CurrentPushSubscriptionRelease = 'missing' | 'stale' | 'released';
function fixed(key: ErrorKey): AppError { return new AppError(ERRORS[key][0], ERRORS[key][1]); }
function rawMessage(value: unknown): string | null { if (value instanceof Error) return value.message; return isRecord(value) && typeof value.message === 'string' ? value.message : null; }
function rpcError(name: string, error: unknown, fallback: ErrorKey): AppError {
    if (name !== SAVE_PUSH_SUBSCRIPTION_RPC) return fixed(fallback);
    const message = rawMessage(error);
    if (message === 'Push subscription limit reached') return fixed('saveLimit');
    return message === 'Push subscription ownership changed' ? fixed('saveConflict') : fixed('saveRpc');
}
async function rpc(name: string, args: object, errorKey: ErrorKey): Promise<unknown> {
    let result: { data: unknown; error: unknown };
    try { result = await Promise.resolve().then(() => supabaseAdmin.rpc(name, args)); }
    catch (error: unknown) { throw rpcError(name, error, errorKey); }
    if (result.error !== null) throw rpcError(name, result.error, errorKey);
    return result.data;
}
function positiveVersion(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).sort().join() === [...keys].sort().join(); }
function canonical(value: unknown): value is string { return typeof value === 'string' && getPushEndpointOwnershipKey(value) === value; }
function observed(row: unknown, userId: string): row is ObservedPushSubscription {
    return isRecord(row) && exact(row, ['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'])
        && isValidUUID(row.id) && isValidUUID(row.user_id) && row.user_id.toLowerCase() === userId.toLowerCase() && typeof row.endpoint === 'string'
        && typeof row.p256dh === 'string' && typeof row.auth === 'string' && (row.user_agent === null || typeof row.user_agent === 'string')
        && (row.created_at === null || typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at)));
}
async function casDelete(row: ObservedPushSubscription): Promise<boolean> {
    const args = { p_id: row.id, p_user_id: row.user_id, p_endpoint: row.endpoint, p_p256dh: row.p256dh, p_auth: row.auth,
        p_user_agent: row.user_agent, p_created_at: row.created_at };
    const data = await rpc(DELETE_PUSH_SUBSCRIPTION_CAS_RPC, args, 'casRpc');
    if (typeof data !== 'boolean') throw fixed('casResult'); return data;
}
async function storedSubscriptions(userId: string): Promise<ObservedPushSubscription[]> {
    let result: { data: unknown; error: unknown };
    try { result = await supabaseAdmin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, user_agent, created_at').eq('user_id', userId); }
    catch { throw fixed('lookupRpc'); }
    if (result.error !== null || !Array.isArray(result.data)
        || !result.data.every((row) => observed(row, userId))) throw fixed(result.error === null ? 'lookupResult' : 'lookupRpc');
    return result.data;
}
async function pruneAgainst(userId: string, current: StoredPushSubscriptionData): Promise<number> {
    const rows = await storedSubscriptions(userId), staleIds = new Set(findSupersededSubscriptionIds(rows, current, current.user_agent ?? null));
    return (await Promise.all(rows.filter((row) => staleIds.has(row.id)).map(casDelete))).filter(Boolean).length;
}
export async function savePushSubscription(options: SavePushSubscriptionOptions): Promise<SavedPushSubscription> {
    if (!isRecord(options) || !isValidUUID(options.userId) || getPushEndpointOwnershipKey(options.endpoint) !== options.ownershipKey || !await isValidPushSubscriptionKeys(options.p256dh, options.auth)
        || (options.userAgent !== null && (typeof options.userAgent !== 'string' || options.userAgent.length > 2048))) throw fixed('saveInput');
    const args: SaveRpcArgs = { p_user_id: options.userId.toLowerCase(), p_endpoint: options.endpoint, p_ownership_key: options.ownershipKey, p_p256dh: options.p256dh, p_auth: options.auth, p_user_agent: options.userAgent };
    let data: unknown, pruned = 0;
    try { data = await rpc(SAVE_PUSH_SUBSCRIPTION_RPC, args, 'saveRpc'); }
    catch (error: unknown) {
        if (!(error instanceof AppError) || error.code !== 'PUSH_SUBSCRIPTION_LIMIT_REACHED') throw error;
        pruned = await pruneAgainst(options.userId, { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', endpoint: options.endpoint, p256dh: options.p256dh, auth: options.auth, user_agent: options.userAgent, created_at: new Date().toISOString() });
        if (pruned === 0) throw error;
        data = await rpc(SAVE_PUSH_SUBSCRIPTION_RPC, args, 'saveRpc');
    }
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    const keys = ['subscription_id', 'stored_user_id', 'stored_endpoint', 'stored_p256dh', 'stored_auth', 'stored_user_agent', 'stored_created_at', 'recipient_generation', 'ownership_version'];
    if (!isRecord(row) || !exact(row, keys) || !isValidUUID(row.subscription_id) || !isValidUUID(row.stored_user_id)
        || row.stored_user_id.toLowerCase() !== options.userId.toLowerCase() || row.stored_endpoint !== options.endpoint
        || row.stored_p256dh !== options.p256dh || row.stored_auth !== options.auth || row.stored_user_agent !== options.userAgent
        || (row.stored_user_agent !== null && typeof row.stored_user_agent !== 'string') || typeof row.stored_created_at !== 'string' || !Number.isFinite(Date.parse(row.stored_created_at))
        || !isValidUUID(row.recipient_generation) || !positiveVersion(row.ownership_version)) throw fixed('saveResult');
    return { id: row.subscription_id.toLowerCase(), endpoint: row.stored_endpoint, p256dh: row.stored_p256dh, auth: row.stored_auth, user_agent: row.stored_user_agent, created_at: row.stored_created_at, recipientGeneration: row.recipient_generation.toLowerCase(), ownershipVersion: row.ownership_version, pruned };
}
export async function readPushSubscriptionGenerations(options: ReadPushSubscriptionGenerationsOptions): Promise<Map<string, PushSubscriptionGeneration>> {
    if (!isRecord(options) || !isValidUUID(options.userId) || !Array.isArray(options.observations) || options.observations.length < 1 || options.observations.length > 20) throw fixed('readInput');
    const seen = new Map<string, string>();
    for (const item of options.observations) {
        if (!isRecord(item) || !isValidUUID(item.subscriptionId) || !canonical(item.ownershipKey)) throw fixed('readInput');
        const id = item.subscriptionId.toLowerCase(), prior = seen.get(id);
        if (prior !== undefined && prior !== item.ownershipKey) throw fixed('readInput'); seen.set(id, item.ownershipKey);
    }
    const observations = [...seen].map(([subscriptionId, ownershipKey]) => ({ subscriptionId, ownershipKey })).sort((left, right) => left.subscriptionId.localeCompare(right.subscriptionId));
    const args: ReadRpcArgs = { p_user_id: options.userId.toLowerCase(), p_subscription_ids: observations.map((item) => item.subscriptionId), p_ownership_keys: observations.map((item) => item.ownershipKey) };
    const data = await rpc(READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC, args, 'readRpc');
    if (!Array.isArray(data) || data.length > observations.length) throw fixed('readResult');
    const requested = new Set(args.p_subscription_ids), generations = new Map<string, PushSubscriptionGeneration>();
    let previous = '';
    for (const row of data) {
        if (!isRecord(row) || !exact(row, ['subscription_id', 'recipient_generation', 'ownership_version']) || !isValidUUID(row.subscription_id)
            || !isValidUUID(row.recipient_generation) || !positiveVersion(row.ownership_version)) throw fixed('readResult');
        const id = row.subscription_id.toLowerCase();
        if (!requested.has(id) || generations.has(id) || id < previous) throw fixed('readResult');
        previous = id; generations.set(id, { recipientGeneration: row.recipient_generation.toLowerCase(), ownershipVersion: row.ownership_version });
    }
    return generations;
}
export async function releasePushSubscription(options: ReleasePushSubscriptionOptions): Promise<boolean> {
    if (!isRecord(options) || !isValidUUID(options.userId) || getPushEndpointOwnershipKey(options.endpoint) !== options.ownershipKey || !isValidUUID(options.recipientGeneration)
        || !positiveVersion(options.ownershipVersion)) throw fixed('releaseInput');
    const args: ReleaseRpcArgs = { p_user_id: options.userId.toLowerCase(), p_endpoint: options.endpoint, p_ownership_key: options.ownershipKey,
        p_recipient_generation: options.recipientGeneration.toLowerCase(), p_ownership_version: options.ownershipVersion };
    const data = await rpc(RELEASE_PUSH_SUBSCRIPTION_RPC, args, 'releaseRpc');
    if (typeof data !== 'boolean') throw fixed('releaseResult'); return data;
}
export async function releaseCurrentPushSubscription(userId: string, endpoint: string, ownershipKey: string): Promise<CurrentPushSubscriptionRelease> {
    if (!isValidUUID(userId) || getPushEndpointOwnershipKey(endpoint) !== ownershipKey) throw fixed('releaseInput');
    let result: { data: unknown; error: unknown };
    try { result = await supabaseAdmin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, user_agent, created_at').eq('user_id', userId).eq('endpoint', endpoint).maybeSingle(); }
    catch { throw fixed('lookupRpc'); }
    if (result.error !== null) throw fixed('lookupRpc');
    if (result.data === null) return 'missing';
    if (!observed(result.data, userId)) throw fixed('lookupResult');
    const subscriptionId = result.data.id.toLowerCase();
    const fence = (await readPushSubscriptionGenerations({ userId, observations: [{ subscriptionId, ownershipKey }] })).get(subscriptionId);
    if (!fence) return await casDelete(result.data) ? 'released' : 'stale';
    return await releasePushSubscription({ userId, endpoint, ownershipKey, recipientGeneration: fence.recipientGeneration, ownershipVersion: fence.ownershipVersion }) ? 'released' : 'stale';
}
export async function pruneSupersededPushSubscriptions(userId: string, current: SavedPushSubscription): Promise<number> { return pruneAgainst(userId, current); }
