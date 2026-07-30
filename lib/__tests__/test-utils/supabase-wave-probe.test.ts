import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    createSupabaseWaveProbe,
    waveOperation,
} from './supabase-wave-probe';

import type { SupabaseWaveQuerySpec } from './supabase-wave-probe';

const SUCCESS = { data: [], error: null };

function querySpec(
    label: string,
    wave: number,
    table: string,
    operations: SupabaseWaveQuerySpec['operations'] = [],
): SupabaseWaveQuerySpec {
    return { label, wave, table, operations, result: SUCCESS };
}

function productionTypeScriptFiles(root: string): string[] {
    const files = readdirSync(root, { withFileTypes: true })
        .filter((entry) => (
            entry.isFile()
            && /\.(?:ts|tsx)$/.test(entry.name)
            && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
        ))
        .map((entry) => join(root, entry.name));
    const pending = ['app', 'components', 'contexts', 'hooks', 'lib']
        .map((directory) => join(root, directory))
        .filter((directory) => existsSync(directory));

    while (pending.length > 0) {
        const current = pending.pop();
        if (!current) continue;
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const path = join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '__tests__') pending.push(path);
                continue;
            }
            if (
                /\.(?:ts|tsx)$/.test(entry.name)
                && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
            ) {
                files.push(path);
            }
        }
    }
    return files;
}

describe('supabase-wave-probe', () => {
    it('query builderを構築しただけでは開始せず、then開始時に固定labelを記録する', async () => {
        const probe = createSupabaseWaveProbe([
            querySpec('probe:users', 1, 'users', [
                waveOperation('eq', 'id', 'fixture-id'),
            ]),
        ]);
        const builder = probe.from('users').select('id').eq('id', 'fixture-id');

        expect(probe.getStartedLabels()).toEqual([]);
        const resultPromise = builder.then((result) => result);
        await probe.whenStarted(['probe:users']);
        expect(probe.getStartedLabels()).toEqual(['probe:users']);

        probe.releaseWave(['probe:users']);
        await expect(resultPromise).resolves.toEqual(SUCCESS);
        probe.assertComplete();
    });

    it('同じwaveの開始順に依存せずunordered label setとして扱う', async () => {
        const probe = createSupabaseWaveProbe([
            querySpec('probe:first', 1, 'first'),
            querySpec('probe:second', 1, 'second'),
        ]);
        const second = probe.from('second').then((result) => result);
        const first = probe.from('first').then((result) => result);

        await probe.whenStarted(['probe:first', 'probe:second']);
        probe.releaseWave(['probe:second', 'probe:first']);
        await expect(Promise.all([first, second])).resolves.toEqual([SUCCESS, SUCCESS]);
        expect(probe.getCompletedWaves()).toEqual([
            ['probe:first', 'probe:second'],
        ]);
        probe.assertComplete();
    });

    it('group_reactionsをperiod filterとrange signatureでcall順に依存せず識別する', async () => {
        const probe = createSupabaseWaveProbe([
            querySpec('probe:reactions:page-1', 1, 'group_reactions', [
                waveOperation('neq', 'period', 'GEAR'),
                waveOperation('range', 0, 899),
            ]),
            querySpec('probe:gear:page-2', 1, 'group_reactions', [
                waveOperation('eq', 'period', 'GEAR'),
                waveOperation('range', 900, 1799),
            ]),
        ]);
        const gear = probe.from('group_reactions')
            .eq('period', 'GEAR')
            .range(900, 1799)
            .then((result) => result);
        const reactions = probe.from('group_reactions')
            .neq('period', 'GEAR')
            .range(0, 899)
            .then((result) => result);

        await probe.whenStarted(['probe:reactions:page-1', 'probe:gear:page-2']);
        probe.releaseWave(['probe:gear:page-2', 'probe:reactions:page-1']);
        await expect(Promise.all([gear, reactions])).resolves.toEqual([SUCCESS, SUCCESS]);
        probe.assertComplete();
    });

    it('未定義queryが開始した場合、固定エラーで失敗する', async () => {
        const probe = createSupabaseWaveProbe([]);

        await expect(
            probe.from('unexpected_table').select('id'),
        ).rejects.toThrow('Unexpected query: unexpected_table');
        expect(() => probe.assertComplete()).toThrow('Unexpected query: unexpected_table');
    });

    it('query labelが定義時または実行時に重複した場合、失敗する', async () => {
        expect(() => createSupabaseWaveProbe([
            querySpec('probe:duplicate', 1, 'first'),
            querySpec('probe:duplicate', 1, 'second'),
        ])).toThrow('Duplicate query label: probe:duplicate');

        const probe = createSupabaseWaveProbe([
            querySpec('probe:once', 1, 'users'),
        ]);
        const first = probe.from('users').then((result) => result);
        await probe.whenStarted(['probe:once']);
        probe.releaseWave(['probe:once']);
        await first;

        await expect(probe.from('users')).rejects.toThrow(
            'Duplicate query label: probe:once',
        );
    });

    it('開始済みqueryのgateを解除しない場合、完了扱いにしない', async () => {
        const probe = createSupabaseWaveProbe([
            querySpec('probe:pending', 1, 'users'),
        ]);
        const pending = probe.from('users').then((result) => result);
        await probe.whenStarted(['probe:pending']);

        expect(() => probe.assertComplete()).toThrow('Unreleased query gate');

        probe.releaseWave(['probe:pending']);
        await pending;
        probe.assertComplete();
    });

    it('前waveを解除する前に後続queryが開始した場合、順序違反にする', async () => {
        const probe = createSupabaseWaveProbe([
            querySpec('probe:wave-1', 1, 'users'),
            querySpec('probe:wave-2', 2, 'user_badges'),
        ]);

        await expect(probe.from('user_badges')).rejects.toThrow(
            'Query order violation: probe:wave-2',
        );
        expect(() => probe.assertComplete()).toThrow(
            'Query order violation: probe:wave-2',
        );
    });

    it('test-only probeとquery-wave testsをproduction moduleがimportしない', () => {
        const root = process.cwd();
        const forbiddenImport = /(?:from\s+|import\()['"][^'"]*(?:supabase-wave-probe|query-wave\.test|ranking-service-query-wave\.test)/;
        const offenders = productionTypeScriptFiles(root)
            .filter((file) => forbiddenImport.test(readFileSync(file, 'utf8')))
            .map((file) => relative(root, file))
            .sort();

        expect(offenders).toEqual([]);
    });
});
