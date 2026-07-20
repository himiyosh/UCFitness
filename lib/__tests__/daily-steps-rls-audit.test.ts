import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const repositoryFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

const readRepositoryFile = (path: string): string => readFileSync(path, 'utf8');

const stripComments = (source: string): string =>
    source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

const dailyStepsSources = repositoryFiles
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .filter((path) => !path.includes('__tests__'))
    .filter((path) =>
        /\.from\(\s*['"]daily_steps['"]\s*\)/.test(stripComments(readRepositoryFile(path))))
    .sort();

const expectedDailyStepsSources = [
    'app/[locale]/debug/session/page.tsx',
    'app/[locale]/groups/[groupId]/page.tsx',
    'app/[locale]/page.tsx',
    'app/[locale]/user/[username]/page.tsx',
    'app/[locale]/wallet/page.tsx',
    'app/api/amazon/personalized/route.ts',
    'app/api/challenge/[challengeId]/progress/route.ts',
    'app/api/challenge/[challengeId]/route.ts',
    'app/api/cron/step-reminder/route.ts',
    'app/api/cron/weekly-summary/route.ts',
    'app/api/debug/db-check/route.ts',
    'app/api/external/ranking/route.ts',
    'app/api/group/[groupId]/events/[eventId]/route.ts',
    'app/api/group/[groupId]/ranking/route.ts',
    'app/api/group/[groupId]/weekly-report/route.ts',
    'app/api/notify-teams/route.ts',
    'app/api/user/achievement-progress/route.ts',
    'app/api/user/achievements/route.ts',
    'app/api/user/export/route.ts',
    'app/api/user/following-comparison/route.ts',
    'app/api/user/following/route.ts',
    'app/api/user/missions/route.ts',
    'app/api/user/step-calendar/route.ts', 'app/api/user/weekly-goal/route.ts',
    'lib/services/analytics-service.ts', 'lib/services/badge-allocator.ts',
    'lib/services/badge-awards.ts', 'lib/services/coin-service.ts',
    'lib/services/group-comparison-service.ts', 'lib/services/title-achievement-service.ts',
    'lib/supabase-utils.ts', 'scripts/check_group_info.ts',
].sort();

const trackedArtifactHashes: Record<string, string> = {
    'migrations/20260720_harden_api_keys_rls.sql': '5138a2695ed34f0fe8f17112e586a82ee089bc7b0f202d6770af990475391636',
    'migrations/20260720_harden_push_subscriptions_rls.sql': '5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66',
    'migrations/20260720_harden_coin_transactions_rls.sql': '32324ceae1333fefb67a0d8788facf23ea2fd435332e78c4ac103bbcabdf426f',
    'migrations/20260720_harden_coin_balances_rls.sql': '31c7de8805482777c21b2b5f48b9a99d5325528505df9cbe1f2664a56e8750c0',
    'migrations/20260720_harden_user_badges_rls.sql': 'afb875da92a405b692b12ef702ea7a7b739088f9a4179cab452be02df9eccc3d',
    'migrations/20260720_harden_badges_rls.sql': 'b584c8edc85db244c9e8412a8b5a1bc58d95006448e1f492eb67a58283d8d06c',
    'lib/__tests__/walking-routes-rls-audit.test.ts': 'b9e3facb93417dd8a5ad0dfbd129e6006388c87d64e4f72c13bba26fa7d090e1',
    'lib/__tests__/user-follows-rls-audit.test.ts': '79585d101e9e25ca5cbd7ac9173b8ac846fd4b48b8d022f2f4b3f776fdf874e1',
};

describe('daily_steps RLS Phase 9 audit', () => {
    it('Phase 1〜8のmigrationとaudit成果を変更していない', () => {
        for (const [path, expectedHash] of Object.entries(trackedArtifactHashes)) {
            const actualHash = createHash('sha256').update(readRepositoryFile(path)).digest('hex');
            expect(actualHash, path).toBe(expectedHash);
        }
    });
    it('direct経路が32ファイル42 SELECTに限定されbrowser clientを含まない', () => {
        expect(dailyStepsSources).toEqual(expectedDailyStepsSources);

        const referenceCount = dailyStepsSources.reduce((count, path) => {
            const source = stripComments(readRepositoryFile(path));
            const matches = source.matchAll(/\.from\(\s*['"]daily_steps['"]\s*\)/g);
            return count + [...matches].length;
        }, 0);
        expect(referenceCount).toBe(42);
        for (const path of dailyStepsSources) {
            const source = stripComments(readRepositoryFile(path));
            expect(source, path).not.toMatch(/^['"]use client['"];?/m);
            if (path === 'scripts/check_group_info.ts') {
                expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY');
            } else {
                expect(source, path).toMatch(
                    /import\s*\{\s*supabaseAdmin(?:\s+as\s+supabase)?\s*\}\s*from\s*['"](?:@\/lib\/supabase|\.\/supabase)['"]/,
                );
            }
            for (const reference of source.matchAll(/\.from\(\s*['"]daily_steps['"]\s*\)/g)) {
                expect(source.slice(Math.max(0, reference.index - 80), reference.index), path)
                    .toMatch(/(?:supabaseAdmin|supabase)\s*$/);
            }
        }
    });
    it('daily_stepsのdirect DMLを追加していない', () => {
        for (const path of dailyStepsSources) {
            const source = stripComments(readRepositoryFile(path));
            const tableReferences = [...source.matchAll(/\.from\(\s*['"]daily_steps['"]\s*\)/g)];

            for (const reference of tableReferences) {
                const chainEnd = source.indexOf(';', reference.index);
                const chain = source.slice(reference.index, chainEnd === -1 ? undefined : chainEnd + 1);
                expect(chain, `${path}:${reference.index}`).toMatch(/\.select\(/);
                expect(chain, `${path}:${reference.index}`).not.toMatch(
                    /\.(?:insert|upsert|update|delete)\(/,
                );
            }
        }
    });
    it('writer・aggregation・streak RPCの呼び出し台帳を固定する', () => {
        const expectedCalls: Record<string, number> = {
            replace_daily_steps_range: 1,
            upsert_daily_steps_max: 1,
            upsert_fitbit_daily_steps_max: 1,
            upsert_fitbit_daily_steps_batch: 1,
            get_user_step_stats: 4,
            get_batch_user_step_totals: 1,
            award_streak_milestones: 1,
        };
        const allSources = repositoryFiles
            .filter((path) => /\.(?:ts|tsx)$/.test(path))
            .filter((path) => !path.includes('__tests__'))
            .map((path) => stripComments(readRepositoryFile(path)))
            .join('\n');

        for (const [routine, expectedCount] of Object.entries(expectedCalls)) {
            const matches = allSources.match(new RegExp(`\\.rpc\\(\\s*['"]${routine}['"]`, 'g'));
            expect(matches?.length ?? 0, routine).toBe(expectedCount);
        }
    });
    it('追跡writer SQLのlease・source競合・単調性・権限契約を保持する', () => {
        const migration = readRepositoryFile(
            'migrations/20260617_add_multi_provider_connections.sql',
        );
        const writerNames = ['replace_daily_steps_range', 'upsert_daily_steps_max',
            'upsert_fitbit_daily_steps_max', 'upsert_fitbit_daily_steps_batch'];

        for (const writerName of writerNames) {
            const functionStart = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${writerName}`);
            const revokeStart = migration.indexOf(`REVOKE ALL ON FUNCTION public.${writerName}`, functionStart);
            const functionDefinition = migration.slice(functionStart, revokeStart);
            expect(functionStart, writerName).toBeGreaterThanOrEqual(0);
            expect(revokeStart, writerName).toBeGreaterThan(functionStart);
            expect(functionDefinition, writerName).toContain("SET search_path = ''");
            expect(functionDefinition, writerName).not.toContain('SECURITY DEFINER');
            expect(migration).toContain(
                `GRANT EXECUTE ON FUNCTION public.${writerName}`,
            );
        }
        expect(migration).toContain('FOR UPDATE');
        expect(migration).toContain('Google Health sync lease is not active');
        expect(migration).toContain('Google Health remains the selected step source');
        expect(migration).toContain('Google Health history remains authoritative');
        expect(migration.match(/GREATEST\(existing\.steps, EXCLUDED\.steps\)/g)?.length)
            .toBe(3);
    });
    it('完全schema証拠がないためmigrationを禁止する', () => {
        const migrations = repositoryFiles
            .filter((path) => path.startsWith('migrations/') && path.endsWith('.sql'))
            .map(readRepositoryFile)
            .join('\n');
        const databaseTypes = readRepositoryFile('types/database.ts');
        const dailyStepRow = databaseTypes.match(
            /daily_steps:\s*\{\s*Row:\s*\{([\s\S]*?)\n\s*\};\s*\};/,
        )?.[1];

        expect(migrations).not.toMatch(
            /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?daily_steps\b/i,
        );
        expect(dailyStepRow?.split('\n').map((line) => line.trim()).filter(Boolean))
            .toEqual(['user_id: string;', 'date: string;', 'steps: number;']);
        expect(
            readRepositoryFile('app/[locale]/user/[username]/page.tsx'),
        ).toContain("select('steps, date, updated_at')");
        expect(repositoryFiles).not.toContain(
            'migrations/20260720_harden_daily_steps_rls.sql',
        );
    });
    it('未追跡aggregation RPCと別Fix候補をREADMEへ明示する', () => {
        const readme = readRepositoryFile('README.md');
        const requiredEvidence = [
            'Phase 9: `daily_steps` audit-only',
            '32 ファイル、42 件',
            '`46a3af7:supabase_schema.sql`',
            '261aa4b63d97ac3b924fc46a57109c2f4371a584c3ab63535f71157b5bedad31',
            '`get_user_step_stats`',
            '`get_batch_user_step_totals`',
            '`award_streak_milestones`',
            'stable orderは',
            'snapshotではない',
            'recorded 0',
            'app/api/user/achievements/route.ts',
            'lib/services/badge-allocator.ts',
            'lib/services/badge-awards.ts',
            'lib/services/title-achievement-service.ts',
            'lib/services/coin-service.ts',
            'app/api/user/following-comparison/route.ts',
        ];

        for (const evidence of requiredEvidence) {
            expect(readme).toContain(evidence);
        }
    });
    it('catalog SQLがtable・function証拠だけをread-onlyで収集する', () => {
        const readme = readRepositoryFile('README.md');
        const phaseNineSection = readme.slice(
            readme.indexOf('Phase 9で必要なtable catalog'),
            readme.indexOf('`walking_routes` の PATCH 所有者確認'),
        );
        const catalogSql = phaseNineSection.match(/```sql\n([\s\S]*?)```/)?.[1] ?? '';

        expect(catalogSql).toContain('BEGIN TRANSACTION READ ONLY');
        expect(catalogSql).toContain("to_regclass('public.daily_steps')");
        expect(catalogSql).toContain('pg_proc');
        expect(catalogSql).toContain('pg_depend');
        expect(catalogSql).toContain('prosecdef');
        expect(catalogSql).toContain('proconfig');
        expect(catalogSql).toContain('proacl');
        expect(catalogSql).toContain('owner_bypassrls');
        expect(catalogSql).toContain('pg_get_functiondef');
        expect(catalogSql).toContain("dependency.classid = 'pg_proc'::regclass");
        expect(catalogSql).toContain("dependency.refclassid = 'pg_class'::regclass");
        expect(catalogSql).toContain('aclexplode');
        expect(catalogSql).toContain("acldefault('f', procedure.proowner)");
        expect(catalogSql).toContain(
            'public.replace_daily_steps_range(uuid,date,date,jsonb,uuid)',
        );
        expect(catalogSql).toContain('public.upsert_daily_steps_max(uuid,date,integer,uuid)');
        expect(catalogSql).toContain('public.upsert_fitbit_daily_steps_max(uuid,date,integer)');
        expect(catalogSql).toContain('ROLLBACK');
        expect(catalogSql).not.toMatch(
            /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/,
        );
    });
    it('F001・F016とPhase 7〜9の進捗anchorを識別子単位で固定する', () => {
        const features = JSON.parse(readRepositoryFile('.github/ucfitness-features.json'));
        const progress = JSON.parse(readRepositoryFile('.github/ucfitness-progress.json'));
        const featureStatuses = new Map(
            features.features.map((feature: { id: string; status: string }) => [
                feature.id,
                feature.status,
            ]),
        );
        const phaseNine = progress.sessionLog.find(
            (entry: { action: string }) =>
                entry.action.includes('Supabase RLS強化Phase 9'),
        );

        expect(featureStatuses.get('F001')).toBe('not-started');
        expect(featureStatuses.get('F016')).toBe('in-progress');
        expect(progress.summary).toContain('保護済み件数は9/25据え置き');
        expect(phaseNine).toMatchObject({
            date: '2026-07-20',
            commit: '9062eb18f7ce99be7ca4985f2606ca58bb699ab6',
        });
        expect(phaseNine.action).toContain('32ファイル42 direct SELECT');
        expect(phaseNine.action).toContain('保護済み件数は9/25据え置き');
    });
});
