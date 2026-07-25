import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPushRecipientState, releasePushSubscriptionForCurrentRecipient, runAfterPushRecipientClear, savePushSubscriptionForCurrentRecipient } from '@/lib/push-recipient-state';
const SOURCE = 'ucfitness-push-recipient-v1', OLD = '10000000-0000-4000-8000-000000000001', NEW = '20000000-0000-4000-8000-000000000002',
    swSource = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8'), helperSource = readFileSync(join(process.cwd(), 'lib/push-recipient-state.ts'), 'utf8');
class Port { peer?: Port; onmessage: ((event: { data: unknown }) => void) | null = null; start(): void {} close(): void {} postMessage(data: unknown): void { queueMicrotask(() => this.peer?.onmessage?.({ data })); } }
class Channel { port1 = new Port(); port2 = new Port(); constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1; } }
interface EventFixture { data?: unknown; ports?: Port[]; waitUntil: (promise: Promise<unknown>) => void } interface Harness { message: (data: unknown, port?: Port) => Promise<unknown>; push: (payload?: unknown) => Promise<void>; shown: ReturnType<typeof vi.fn>; worker: { postMessage: (data: unknown, ports: Port[]) => void } }
function createHarness(storage = new Map<string, Response>()): Harness {
    const listeners = new Map<string, (event: EventFixture) => void>(), shown = vi.fn().mockResolvedValue(undefined);
    const cache = { match: async (key: string) => storage.get(key)?.clone(), put: async (key: string, response: Response) => { storage.set(key, response.clone()); } };
    const context: Record<string, unknown> = { URL, Response, Request, crypto, console: { warn: vi.fn(), error: vi.fn() },
        caches: { open: async () => cache }, clients: { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn() },
        location: { origin: 'https://ucfitness.test' }, navigator: { language: 'ja' }, registration: { showNotification: shown },
        skipWaiting: vi.fn(), addEventListener: (type: string, listener: (event: EventFixture) => void) => listeners.set(type, listener) };
    context.self = context; vm.runInNewContext(swSource, context);
    const dispatch = async (type: string, event: Omit<EventFixture, 'waitUntil'>): Promise<void> => {
        let pending: Promise<unknown> = Promise.resolve(); listeners.get(type)?.({
            ...event, waitUntil: (promise) => { pending = Promise.resolve(promise); } }); await pending;
    };
    const message = async (data: unknown, port = new Port()): Promise<unknown> => {
        let reply: unknown; port.peer = new Port(); port.peer.peer = port; port.peer.onmessage = (event) => { reply = event.data; };
        await dispatch('message', { data, ports: [port] }); await Promise.resolve(); return reply;
    };
    return { message, shown, worker: { postMessage: (data, ports) => { void dispatch('message', { data, ports }); } }, push: async (payload) => dispatch('push', { data: payload === undefined ? undefined : { json: () => payload }, ports: [] }) };
}
async function clearState(harness: Harness): Promise<string> { const reply = await harness.message({ source: SOURCE, type: 'push-recipient:clear' }) as { transitionToken?: unknown };
    if (typeof reply.transitionToken !== 'string') throw new Error('Expected transition token'); return reply.transitionToken; }
function rawSet(harness: Harness, generation: string, version: number, transitionToken?: string): Promise<unknown> {
    return harness.message({ source: SOURCE, type: 'push-recipient:set', state: { recipientGeneration: generation, recipientVersion: version }, transitionToken }); }
async function setState(harness: Harness, generation: string, version: number): Promise<unknown> { return rawSet(harness, generation, version, await clearState(harness)); }
function installClient(harness: Harness): void {
    vi.stubGlobal('MessageChannel', Channel); vi.stubGlobal('window', { setTimeout }); vi.stubGlobal('navigator',
        { serviceWorker: { controller: null, getRegistration: vi.fn().mockResolvedValue({ active: harness.worker }) } });
}
function subscription(unsubscribe = vi.fn().mockResolvedValue(true)): PushSubscription {
    return { endpoint: 'https://fcm.googleapis.com/x', unsubscribe, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x' }) } as unknown as PushSubscription; }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); }); describe('Service Worker recipient fence', () => {
    it('clearとnew setの前後に届くold personalized pushを表示しない', async () => {
        const h = createHarness(); await setState(h, OLD, 1); const staleTransition = await clearState(h);
        await h.push({ tag: 'weekly-summary', recipientGeneration: OLD, recipientVersion: 1 }); await clearState(h);
        expect(await rawSet(h, OLD, 2, staleTransition)).toMatchObject({ ok: false });
        await setState(h, NEW, 3); await h.push({ tag: 'weekly-summary', recipientGeneration: OLD, recipientVersion: 1 });
        await h.push({ tag: 'weekly-summary', recipientGeneration: NEW, recipientVersion: 3 });
        expect(h.shown).toHaveBeenCalledTimes(1);
    });
    it('restart後もstateを読みmissing fenceをdropしgenericを表示する', async () => {
        const storage = new Map<string, Response>(); await setState(createHarness(storage), NEW, 3);
        const h = createHarness(storage); await h.push({ tag: 'step-reminder', recipientGeneration: NEW, recipientVersion: 3 });
        await h.push({ tag: 'step-reminder' }); await h.push({ tag: 'public-update' }); await h.push();
        expect(h.shown).toHaveBeenCalledTimes(3);
    });
    it('lowerとequal-different setを拒否しequal-sameだけ冪等にする', async () => {
        const h = createHarness(); await setState(h, NEW, 4); const transition = await clearState(h);
        expect(await rawSet(h, OLD, 3, transition)).toMatchObject({ ok: false }); expect(await rawSet(h, OLD, 4, transition)).toMatchObject({ ok: false });
        expect(await rawSet(h, NEW, 5, transition)).toMatchObject({ ok: true }); expect(await rawSet(h, OLD, 6, transition)).toMatchObject({ ok: false }); expect(await rawSet(h, NEW, 5)).toMatchObject({ ok: true });
    });
});
describe('client recipient transitions', () => {
    it('POST前clearとresponse後set、DELETE前clearとrelease後unsubscribeを守る', async () => {
        const h = createHarness(); installClient(h); const order: string[] = [], original = h.worker.postMessage;
        h.worker.postMessage = (data, ports) => { order.push((data as { type: string }).type); original(data, ports); };
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            order.push(`fetch:${init?.method}`); return Response.json({ success: true, recipientGeneration: NEW, recipientVersion: 2 });
        }));
        const unsubscribe = vi.fn(async () => { order.push('unsubscribe'); return true; }), sub = subscription(unsubscribe);
        await savePushSubscriptionForCurrentRecipient(sub); await releasePushSubscriptionForCurrentRecipient(sub);
        expect(order).toEqual(['push-recipient:clear', 'fetch:POST', 'push-recipient:set', 'push-recipient:clear', 'fetch:DELETE', 'unsubscribe']);
    });
    it('clear失敗時はlogout actionを実行せず再試行可能にする', async () => {
        const h = createHarness(); h.worker.postMessage = (_data, ports) => ports[0].postMessage({ source: SOURCE, ok: false, state: null });
        installClient(h); const action = vi.fn().mockResolvedValue(undefined);
        await expect(runAfterPushRecipientClear(action)).rejects.toThrow('Push recipient state operation failed'); expect(action).not.toHaveBeenCalled();
    });
    it('late old POST responseがmulti-tab shared stateのnew versionを上書きしない', async () => {
        const h = createHarness(); installClient(h); const resolve: Array<(value: Response) => void> = [];
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => resolve.push(done))));
        const oldRequest = savePushSubscriptionForCurrentRecipient(subscription()); await vi.waitFor(() => expect(resolve).toHaveLength(1));
        const newRequest = savePushSubscriptionForCurrentRecipient(subscription()); await vi.waitFor(() => expect(resolve).toHaveLength(2));
        resolve[1](Response.json({ success: true, recipientGeneration: NEW, recipientVersion: 3 })); await newRequest;
        resolve[0](Response.json({ success: true, recipientGeneration: OLD, recipientVersion: 4 })); await expect(oldRequest).rejects.toThrow('Push recipient state operation failed');
        expect(await h.message({ source: SOURCE, type: 'push-recipient:get' })).toMatchObject({ state: { recipientGeneration: NEW, recipientVersion: 3 } });
    });
    it('in-flight POST後のlogout clearが将来versionの旧応答を拒否する', async () => {
        const h = createHarness(); installClient(h); let resolve!: (value: Response) => void;
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
        const pending = savePushSubscriptionForCurrentRecipient(subscription());
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function')); await clearPushRecipientState();
        resolve(Response.json({ success: true, recipientGeneration: OLD, recipientVersion: 1 })); await expect(pending).rejects.toThrow('Push recipient state operation failed');
        expect(await h.message({ source: SOURCE, type: 'push-recipient:get' })).toMatchObject({ state: { recipientGeneration: null, recipientVersion: 0 } });
    });
    it('required SWが未登録ならPOST前に失敗する', async () => {
        const h = createHarness(); installClient(h); const fetchMock = vi.fn();
        vi.stubGlobal('navigator', { serviceWorker: { controller: null, getRegistration: vi.fn().mockResolvedValue(null) } });
        vi.stubGlobal('fetch', fetchMock);
        await expect(savePushSubscriptionForCurrentRecipient(subscription())).rejects.toThrow('Push recipient state operation failed'); expect(fetchMock).not.toHaveBeenCalled();
    });
    it('clientとSWがserver-only境界をimportせず全signOutがclear wrapperを通る', () => {
        expect(helperSource).not.toContain("from '@/lib/services/push-subscription-ownership'");
        expect(swSource).not.toContain('server-only');
        for (const file of ['components/layout/UserMenu.tsx', 'app/[locale]/setup/page.tsx']) {
            const source = readFileSync(join(process.cwd(), file), 'utf8');
            expect(source.match(/runAfterPushRecipientClear\s*\(/g)?.length).toBeGreaterThanOrEqual(source.match(/\bsignOut\s*\(/g)?.length ?? 0);
        }
    });
});
