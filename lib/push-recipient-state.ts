'use client'; export const PUSH_RECIPIENT_PROTOCOL_VERSION = 2;
const SOURCE = 'ucfitness-push-recipient-v1', CACHE = 'ucfitness-push-recipient-v1', LOCK = 'ucfitness-push-recipient-transition',
    TIMEOUT = 5000, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface PushRecipientState { recipientGeneration: string | null; recipientVersion: number; recipientProtocolVersion: number; tombstone: boolean }
interface ActiveState extends PushRecipientState { recipientGeneration: string; tombstone: false }
interface Reply { state: PushRecipientState; transitionToken: string | null }
export class PushRecipientStateError extends Error { readonly code: string;
    constructor(code: string) { super('Push recipient state operation failed'); this.name = 'PushRecipientStateError'; this.code = code; } }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function state(value: unknown): value is PushRecipientState {
    if (!record(value) || Object.keys(value).length !== 4 || value.recipientProtocolVersion !== PUSH_RECIPIENT_PROTOCOL_VERSION ||
        typeof value.tombstone !== 'boolean' || typeof value.recipientVersion !== 'number' || !Number.isSafeInteger(value.recipientVersion) || value.recipientVersion < 0) return false;
    return value.tombstone ? value.recipientGeneration === null : typeof value.recipientGeneration === 'string' && UUID.test(value.recipientGeneration); }
function active(value: unknown): ActiveState | null {
    if (!record(value) || value.success !== true || value.recipientProtocolVersion !== PUSH_RECIPIENT_PROTOCOL_VERSION ||
        typeof value.recipientGeneration !== 'string' || !UUID.test(value.recipientGeneration) ||
        typeof value.recipientVersion !== 'number' || !Number.isSafeInteger(value.recipientVersion) || value.recipientVersion < 1) return null;
    return { recipientGeneration: value.recipientGeneration.toLowerCase(), recipientVersion: value.recipientVersion,
        recipientProtocolVersion: PUSH_RECIPIENT_PROTOCOL_VERSION, tombstone: false }; }
async function worker(required: boolean): Promise<ServiceWorker | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration(), activeWorker = registration?.active ?? navigator.serviceWorker.controller;
    if (!registration || !activeWorker) { if (required) throw new PushRecipientStateError('PUSH_RECIPIENT_SW_UNAVAILABLE'); return null; }
    return activeWorker; }
async function quarantine(): Promise<void> {
    const registration = await navigator.serviceWorker.getRegistration();
    try { await (await registration?.pushManager.getSubscription())?.unsubscribe(); if (registration) await registration.unregister();
        if ('caches' in window) await window.caches.delete(CACHE); } catch { throw new PushRecipientStateError('PUSH_RECIPIENT_QUARANTINE_FAILED'); } }
async function message(type: 'set' | 'clear' | 'get' | 'verify', next?: ActiveState, token?: string, required = type === 'set' || type === 'verify'): Promise<Reply | null> {
    const activeWorker = await worker(required); if (!activeWorker) return null;
    const channel = new MessageChannel();
    try {
        return await new Promise((resolve, reject) => {
            const done = (error: PushRecipientStateError | null, value: Reply | null): void => {
                clearTimeout(timer); channel.port1.close(); if (error) reject(error); else resolve(value); };
            const timer = window.setTimeout(() => done(new PushRecipientStateError('PUSH_RECIPIENT_SW_TIMEOUT'), null), TIMEOUT);
            channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
                if (!record(data) || data.source !== SOURCE || data.recipientProtocolVersion !== PUSH_RECIPIENT_PROTOCOL_VERSION || typeof data.ok !== 'boolean')
                    return done(new PushRecipientStateError('PUSH_RECIPIENT_SW_PROTOCOL_INVALID'), null);
                if (!data.ok) return done(new PushRecipientStateError('PUSH_RECIPIENT_SW_REJECTED'), null);
                if (!state(data.state) || !(data.transitionToken === null || typeof data.transitionToken === 'string' && UUID.test(data.transitionToken)))
                    return done(new PushRecipientStateError('PUSH_RECIPIENT_SW_PROTOCOL_INVALID'), null);
                done(null, { state: data.state, transitionToken: data.transitionToken });
            };
            channel.port1.start(); try { activeWorker.postMessage({ source: SOURCE, type: `push-recipient:${type}`, state: next,
                transitionToken: token, recipientProtocolVersion: PUSH_RECIPIENT_PROTOCOL_VERSION }, [channel.port2]); }
            catch { done(new PushRecipientStateError('PUSH_RECIPIENT_SW_UNAVAILABLE'), null); }
        });
    } catch (error: unknown) {
        if (error instanceof PushRecipientStateError &&
            (error.code === 'PUSH_RECIPIENT_SW_TIMEOUT' || error.code === 'PUSH_RECIPIENT_SW_PROTOCOL_INVALID')) await quarantine();
        throw error; } }
async function lock<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (typeof navigator === 'undefined' || !('locks' in navigator)) throw new PushRecipientStateError('PUSH_RECIPIENT_LOCK_UNAVAILABLE');
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), TIMEOUT);
    try { return await navigator.locks.request(LOCK, { mode: 'exclusive', signal: controller.signal }, operation); }
    catch (error: unknown) { if (error instanceof PushRecipientStateError) throw error; throw new PushRecipientStateError('PUSH_RECIPIENT_LOCK_FAILED'); }
    finally { clearTimeout(timer); } }
async function clearUnlocked(required = false): Promise<Reply | null> { return message('clear', undefined, undefined, required); }
async function begin(): Promise<string> { const reply = await clearUnlocked(true); if (!reply?.transitionToken) throw new PushRecipientStateError('PUSH_RECIPIENT_SW_PROTOCOL_INVALID'); return reply.transitionToken; }
async function setUnlocked(next: ActiveState, token: string): Promise<void> { if (!state(next) || next.tombstone || !UUID.test(token)) throw new PushRecipientStateError('PUSH_RECIPIENT_STATE_INVALID'); await message('set', next, token); }
export async function setPushRecipientState(next: ActiveState, token: string): Promise<void> { await lock(() => setUnlocked(next, token)); }
export async function clearPushRecipientState(): Promise<void> { await lock(() => clearUnlocked()); }
export async function getPushRecipientState(): Promise<PushRecipientState | null> { return (await message('get'))?.state ?? null; }
export async function runBeforePushRecipientAccountTransition<Result>(operation: () => Promise<Result>): Promise<Result> { return lock(async () => { await clearUnlocked(); return operation(); }); }
export async function runAfterPushRecipientClear<Result>(operation: () => Promise<Result>, navigate?: (result: Result) => void): Promise<Result> { return lock(async () => { await clearUnlocked(); const result = await operation(); await clearUnlocked(); navigate?.(result); return result; }); }
export async function savePushSubscriptionForCurrentRecipient(subscription: PushSubscription, signal?: AbortSignal): Promise<void> {
    await lock(async () => { if (signal?.aborted) throw new PushRecipientStateError('PUSH_RECIPIENT_OPERATION_ABORTED'); const token = await begin(); let response: Response;
        try { response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...subscription.toJSON(), recipientProtocolVersion: PUSH_RECIPIENT_PROTOCOL_VERSION }), signal }); }
        catch { throw new PushRecipientStateError('PUSH_SUBSCRIPTION_REQUEST_FAILED'); }
        const body: unknown = await response.json().catch(() => null), next = response.ok ? active(body) : null;
        if (!next) throw new PushRecipientStateError('PUSH_SUBSCRIPTION_RESPONSE_INVALID'); if (signal?.aborted) throw new PushRecipientStateError('PUSH_RECIPIENT_OPERATION_ABORTED'); await setUnlocked(next, token); }); }
export async function releasePushSubscriptionForCurrentRecipient(subscription: PushSubscription): Promise<void> {
    await lock(async () => { const token = await begin(); let response: Response;
        try { response = await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }) }); }
        catch { throw new PushRecipientStateError('PUSH_SUBSCRIPTION_REQUEST_FAILED'); }
        if (!response.ok) throw new PushRecipientStateError('PUSH_SUBSCRIPTION_RELEASE_FAILED'); await message('verify', undefined, token); await subscription.unsubscribe(); }); }
export async function synchronizePushRecipientForSession(signal?: AbortSignal): Promise<PushSubscription | null> { const registration = await navigator.serviceWorker.getRegistration(), subscription = await registration?.pushManager.getSubscription() ?? null;
    if (subscription) await savePushSubscriptionForCurrentRecipient(subscription, signal); else await clearPushRecipientState(); return subscription; }
