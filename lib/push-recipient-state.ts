'use client';
const MESSAGE_SOURCE = 'ucfitness-push-recipient-v1', MESSAGE_TIMEOUT_MS = 2500,
    UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface PushRecipientState { recipientGeneration: string | null; recipientVersion: number }
interface ActivePushRecipientState extends PushRecipientState { recipientGeneration: string }
export class PushRecipientStateError extends Error { readonly code: string;
    constructor(code: string) { super('Push recipient state operation failed'); this.name = 'PushRecipientStateError'; this.code = code; } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isRecipientState(value: unknown): value is PushRecipientState {
    return isRecord(value) && Object.keys(value).length === 2 && (value.recipientGeneration === null ||
        typeof value.recipientGeneration === 'string' && UUID_PATTERN.test(value.recipientGeneration)) &&
        typeof value.recipientVersion === 'number' && Number.isSafeInteger(value.recipientVersion) && value.recipientVersion >= 0;
}
function isTransitionToken(value: unknown): value is string | null { return value === null || typeof value === 'string' && UUID_PATTERN.test(value); }
function activeState(value: unknown): ActivePushRecipientState | null {
    if (!isRecord(value) || value.success !== true || typeof value.recipientGeneration !== 'string' || !UUID_PATTERN.test(value.recipientGeneration) ||
        typeof value.recipientVersion !== 'number' || !Number.isSafeInteger(value.recipientVersion) || value.recipientVersion < 1) return null;
    return { recipientGeneration: value.recipientGeneration.toLowerCase(), recipientVersion: value.recipientVersion };
}
async function activeWorker(required: boolean): Promise<ServiceWorker | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration(), worker = registration?.active ?? navigator.serviceWorker.controller;
    if (!registration || !worker) { if (required) throw new PushRecipientStateError('PUSH_RECIPIENT_SW_UNAVAILABLE'); return null; }
    return worker;
}
async function sendMessage(type: 'push-recipient:set' | 'push-recipient:clear' | 'push-recipient:get', state?: ActivePushRecipientState,
    transitionToken?: string, requireWorker = type === 'push-recipient:set'): Promise<{ state: PushRecipientState; transitionToken: string | null } | null> {
    const worker = await activeWorker(requireWorker); if (!worker) return null;
    const channel = new MessageChannel();
    return new Promise((resolve, reject) => {
        const finish = (error: PushRecipientStateError | null, value: { state: PushRecipientState; transitionToken: string | null } | null): void =>
            { clearTimeout(timeoutId); channel.port1.close(); if (error) reject(error); else resolve(value); };
        const timeoutId = window.setTimeout(() => finish(new PushRecipientStateError('PUSH_RECIPIENT_SW_TIMEOUT'), null), MESSAGE_TIMEOUT_MS);
        channel.port1.onmessage = (event: MessageEvent<unknown>) => {
            const reply = event.data;
            if (!isRecord(reply) || reply.source !== MESSAGE_SOURCE || typeof reply.ok !== 'boolean')
                return finish(new PushRecipientStateError('PUSH_RECIPIENT_SW_RESPONSE_INVALID'), null);
            if (!reply.ok) return finish(new PushRecipientStateError('PUSH_RECIPIENT_SW_REJECTED'), null);
            if (!isRecipientState(reply.state) || !isTransitionToken(reply.transitionToken))
                return finish(new PushRecipientStateError('PUSH_RECIPIENT_SW_REJECTED'), null);
            finish(null, { state: reply.state, transitionToken: reply.transitionToken });
        };
        channel.port1.start(); try { worker.postMessage({ source: MESSAGE_SOURCE, type, state, transitionToken }, [channel.port2]); }
        catch { finish(new PushRecipientStateError('PUSH_RECIPIENT_SW_UNAVAILABLE'), null); }
    });
}
export async function setPushRecipientState(state: ActivePushRecipientState, transitionToken: string): Promise<void> {
    if (!isRecipientState(state) || state.recipientGeneration === null || !UUID_PATTERN.test(transitionToken))
        throw new PushRecipientStateError('PUSH_RECIPIENT_STATE_INVALID');
    await sendMessage('push-recipient:set', { recipientGeneration: state.recipientGeneration.toLowerCase(), recipientVersion: state.recipientVersion }, transitionToken);
}
export async function clearPushRecipientState(): Promise<void> { await sendMessage('push-recipient:clear'); }
export async function getPushRecipientState(): Promise<PushRecipientState | null> { return (await sendMessage('push-recipient:get'))?.state ?? null; }
async function beginPushRecipientTransition(): Promise<string> {
    const reply = await sendMessage('push-recipient:clear', undefined, undefined, true);
    if (!reply?.transitionToken) throw new PushRecipientStateError('PUSH_RECIPIENT_SW_RESPONSE_INVALID'); return reply.transitionToken;
}
export async function runAfterPushRecipientClear<Result>(action: () => Promise<Result>): Promise<Result> { await clearPushRecipientState(); return action(); }
export async function savePushSubscriptionForCurrentRecipient(subscription: PushSubscription): Promise<void> {
    const transitionToken = await beginPushRecipientTransition();
    let response: Response;
    try { response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) }); }
    catch { throw new PushRecipientStateError('PUSH_SUBSCRIPTION_REQUEST_FAILED'); }
    const body: unknown = await response.json().catch(() => null), state = response.ok ? activeState(body) : null;
    if (!state) throw new PushRecipientStateError('PUSH_SUBSCRIPTION_RESPONSE_INVALID');
    await setPushRecipientState(state, transitionToken);
}
export async function releasePushSubscriptionForCurrentRecipient(subscription: PushSubscription): Promise<void> {
    await beginPushRecipientTransition();
    let response: Response;
    try { response = await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) }); }
    catch { throw new PushRecipientStateError('PUSH_SUBSCRIPTION_REQUEST_FAILED'); }
    if (!response.ok) throw new PushRecipientStateError('PUSH_SUBSCRIPTION_RELEASE_FAILED');
    await subscription.unsubscribe();
}
