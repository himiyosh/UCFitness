import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    join(process.cwd(), 'migrations/20260720_harden_api_keys_rls.sql'),
    'utf8',
);
const rankingRoute = readFileSync(
    join(process.cwd(), 'app/api/group/[groupId]/ranking/route.ts'),
    'utf8',
);

describe('F016 api_keys RLS migration', () => {
    it('api_keysだけをPhase 1のRLS対象にする', () => {
        const targets = [...migration.matchAll(
            /ALTER TABLE public\.([a-z_]+) ENABLE ROW LEVEL SECURITY/gi,
        )].map((match) => match[1]);

        expect(targets).toEqual(['api_keys']);
        expect(migration).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
        expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    });

    it('NextAuthのpublic.users契約を検証しSupabase Authへ依存しない', () => {
        expect(migration).toContain("'public.users'::regclass");
        expect(migration).toContain("attname = 'user_id'");
        expect(migration).toContain("attname = 'id'");
        expect(migration).not.toMatch(/auth\.users/i);
        expect(migration).not.toMatch(/auth\.uid\s*\(/i);
    });

    it('不明なschema・policy・service role状態をfail closedにする', () => {
        expect(migration).toContain("to_regclass('public.api_keys')");
        expect(migration).toMatch(/SELECT relkind[\s\S]+<> 'r'/);
        expect(migration).toContain('missing_columns');
        expect(migration).toContain('pg_catalog.format_type');
        expect(migration).toContain("('is_admin', 'boolean')");
        expect(migration).toContain("IN ('text[]', 'jsonb')");
        expect(migration).toContain('pg_catalog.pg_policy');
        expect(migration).toContain('rolbypassrls');
        expect(migration).toContain('relforcerowsecurity');
        expect(migration).toMatch(/RAISE EXCEPTION/g);
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(migration).toContain("SET LOCAL search_path = ''");
    });

    it('通常roleと列・sequence権限を剥奪する', () => {
        expect(migration).toMatch(
            /REVOKE ALL PRIVILEGES ON TABLE public\.api_keys\s+FROM PUBLIC, anon, authenticated, service_role/i,
        );
        expect(migration).toContain('REVOKE ALL PRIVILEGES (%I) ON TABLE public.api_keys');
        expect(migration).toContain('REVOKE ALL PRIVILEGES ON SEQUENCE %s');
        expect(migration).toContain('has_any_column_privilege');
    });

    it('service_roleを稼働中のSELECTとlast_used_at更新だけに限定する', () => {
        expect(migration).toMatch(
            /GRANT SELECT \([\s\S]+key_hash,[\s\S]+key[\s\S]+\) ON TABLE public\.api_keys TO service_role/i,
        );
        expect(migration).toMatch(
            /GRANT UPDATE \(last_used_at\) ON TABLE public\.api_keys TO service_role/i,
        );
        expect(migration).toContain('required_select_columns');
        expect(migration).toContain("attribute.attname <> 'last_used_at'");
        expect(migration).toContain(
            "has_any_column_privilege(\n           'service_role',\n           target_table,\n           'INSERT'",
        );
        expect(migration).toContain(
            "has_column_privilege(\n           'service_role',\n           target_table,\n           'last_used_at',",
        );
        expect(migration).not.toMatch(/GRANT EXECUTE/i);
        expect(migration).not.toMatch(/GRANT (INSERT|DELETE)/i);
    });

    it('実アプリ経路がsupabaseAdminと許可済み列だけを使う', () => {
        expect(rankingRoute).toContain("import { supabaseAdmin } from '@/lib/supabase'");
        expect(rankingRoute).not.toMatch(/import\s+\{\s*supabase\s*\}/);
        expect(rankingRoute).toContain(
            ".select('id, user_id, scopes, is_admin, expires_at, revoked_at')",
        );
        expect(rankingRoute).toContain(".select('id, user_id, scopes, is_admin')");
        expect(rankingRoute).toContain(".update({ last_used_at:");
        expect(rankingRoute).toMatch(/queryApiKey\('key_hash'/);
        expect(rankingRoute).toMatch(/queryApiKey\('key'/);
    });
});
