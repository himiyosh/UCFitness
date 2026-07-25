import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const migration = read('migrations/20260727_add_push_recipient_protocol_readiness.sql');
const ownershipMigration = read('migrations/20260726_create_push_subscription_ownership.sql');
const readme = read('README.md');
const instructions = read('.github/copilot-instructions.md');
const appLayer = [
    'app/api/push/subscribe/route.ts',
    'lib/api/web-push.ts',
    'public/sw.js',
    'scripts/test-push-generation-postgres.ts',
].map(read).join('\n');
const body = (name: string): string => migration.match(new RegExp(
    `CREATE FUNCTION public\\.${name}[\\s\\S]+?AS \\$function\\$([\\s\\S]+?)\\$function\\$;`,
))?.[1] ?? '';
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('LL-090 push recipient protocol readiness Layer 1 migration', () => {
    it('migration bytes_確定後_SHA-256と追加順序を維持する', () => {
        expect(digest(ownershipMigration)).toBe('918c6f9a6aefaf556d60c241f2f6db0f59037192b484e55f4b86e39795aa6b51');
        expect(digest(migration)).toBe('e55909943fb6e9c9218afae31c10bb90695e2551a970872cdaa361ef48c0981b');
        expect(migration).toMatch(/^BEGIN;\nSET LOCAL search_path = '';/);
        expect(migration).toMatch(/COMMIT;\s*$/);
    });

    it('schema_既存authorityをprotocol 0へfail closedで初期化する', () => {
        expect(migration).toContain('ADD COLUMN recipient_protocol_version smallint NOT NULL DEFAULT 0');
        expect(migration).toContain('CHECK (recipient_protocol_version >= 0 AND recipient_protocol_version <= 1)');
        expect(migration).not.toMatch(/UPDATE public\.push_subscription_ownership[\s\S]+SET recipient_protocol_version = 1/);
        expect(migration).toContain('recipient_protocol_version:smallint:true:true:0');
        expect(migration).toContain('push_subscription_ownership_protocol_check:true:CHECKrecipient_protocol_version>=0ANDrecipient_protocol_version<=1');
    });

    it('save_旧経路を0へ戻しversion 1だけをcurrent authorityへ原子的に保存する', () => {
        const reset = body('reset_push_recipient_protocol_version');
        const save = body('save_push_subscription_with_generation');
        expect(reset).toContain('NEW.recipient_protocol_version := 0');
        expect(migration).toContain('BEFORE INSERT OR UPDATE OF owner_user_id, subscription_id, recipient_generation, ownership_version');
        expect(save).toContain('p_protocol_version <> ALL (ARRAY[1]::smallint[])');
        expect(save).toContain('FROM public.save_push_subscription_with_generation(');
        for (const condition of [
            'ownership.owner_user_id = p_user_id',
            'ownership.subscription_id = v_saved.subscription_id',
            'ownership.recipient_generation = v_saved.recipient_generation',
            'ownership.ownership_version = v_saved.ownership_version',
        ]) expect(save).toContain(condition);
        expect(save.indexOf('FROM public.save_push_subscription_with_generation('))
            .toBeLessThan(save.indexOf('SET recipient_protocol_version = p_protocol_version'));
        expect(ownershipMigration).toMatch(/SET owner_user_id = NULL, subscription_id = NULL,[\s\S]+ownership_version = ownership\.ownership_version \+ 1/);
    });

    it('read_最大20件のexact current authorityだけにprotocol versionを返す', () => {
        const readRpc = body('read_push_subscription_generations');
        for (const value of [
            'cardinality(p_subscription_ids) NOT BETWEEN 1 AND 20',
            'ownership.owner_user_id = p_user_id',
            'ownership.subscription_id = requested.subscription_id',
            'subscription.id = requested.subscription_id AND subscription.user_id = p_user_id',
            'ownership.recipient_protocol_version',
            'ORDER BY ownership.subscription_id',
        ]) expect(readRpc).toContain(value);
        expect(readRpc).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b|recipient_protocol_version\s*[>=]/i);
        expect(migration).toContain('TABLE(subscription_id uuid, recipient_generation uuid, ownership_version bigint, recipient_protocol_version smallint)');
    });

    it('security_既知catalogとservice-role-only RPC以外をfail closedにする', () => {
        for (const value of [
            'LL090: recipient protocol catalog changed',
            'LL090: recipient protocol keys or triggers changed',
            'LL090: recipient protocol RPC security changed',
            'LL090: recipient protocol RLS or ACL changed',
            "procedure.proconfig IS DISTINCT FROM ARRAY['search_path=\"\"']::text[]",
            "trigger_record.tgtype = 23 AND trigger_record.tgattr::text = '2 3 4 5'",
        ]) expect(migration).toContain(value);
        expect(migration.match(/GRANT EXECUTE ON FUNCTION public\./g)).toHaveLength(2);
        expect(migration).not.toMatch(/CREATE\s+POLICY|GRANT\s+.+\s+ON\s+TABLE/i);
    });

    it('layers_PR blockerとrollbackを文書化しruntimeとapp配線を次Layerへ残す', () => {
        for (const value of [
            'PR #314', 'PR #315', 'PR #300', 'PR #301',
            'recipient_protocol_version', '既存authorityはdefault 0',
            'generic通知', 'production適用は禁止',
            'read RPCを20260726の定義へ戻す',
        ]) expect(readme).toContain(value);
        expect(instructions.match(/^### LL-090:/gm)).toHaveLength(1);
        expect(appLayer).not.toContain('recipient_protocol_version');
        expect(migration).toContain('runtime proof, server/client/SW wiring, and rollout remain mandatory');
    });
});
