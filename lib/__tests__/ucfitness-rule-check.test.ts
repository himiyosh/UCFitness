import { spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    checkChallengeProgressAuthLogBoundary,
    checkDateOnlyParse,
    renderRuleTargetResult,
    runRuleTargetsCli,
} from '../../scripts/ucfitness-rule-targets.mjs';

const repositoryRoot = process.cwd();
const ruleChecker = join(repositoryRoot, 'scripts/check-ucfitness-rules.sh');
const singleRoute = 'app/api/challenge/[challengeId]/progress/route.ts';
const batchRoute = 'app/api/challenge/progress/route.ts';
const fixturePaths = [
    singleRoute,
    batchRoute,
    'app/api/challenge/error-sink.test.ts',
    'lib/services/challenge-progress-service.test.ts',
    'lib/services/challenge-progress-service.ts',
    'app/api/challenge/[challengeId]/operation-authorization.test.ts',
    'app/api/challenge/progress/route.test.ts',
] as const;
const originalSources = new Map(
    fixturePaths.map((path) => [
        path,
        readFileSync(join(repositoryRoot, path), 'utf8'),
    ]),
);
const fixtureRoot = mkdtempSync(join(tmpdir(), 'ucfitness-rule-check-'));
const dateBoundaryFixtureRoot = mkdtempSync(
    join(tmpdir(), 'ucfitness-date-boundary-rule-'),
);
const DATE_RULE_CHECK_TIMEOUT_MS = 15_000;
const productionDirectories = [
    'app',
    'components',
    'contexts',
    'hooks',
    'lib',
    'types',
] as const;

afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(dateBoundaryFixtureRoot, { recursive: true, force: true });
});

interface RuleCheckResult {
    status: number | null;
    output: string;
}

interface InvalidBoundary {
    label: string;
    path: (typeof fixturePaths)[number];
    expected: string;
    replacement: string;
    expectedIds: readonly string[];
    expectedRecordCount: number;
    expectedRenderedViolationCount: number;
}

interface UnsafeDateParseCase {
    label: string;
    source: string;
    callKind: 'new Date' | 'Date.parse';
}

const invalidBoundaries: InvalidBoundary[] = [
    {
        label: 'single reportError境界が欠落した場合',
        path: singleRoute,
        expected: 'reportError("challenge:progress", normalized);',
        replacement: 'void normalized;',
        expectedIds: [
            'single-report-error-count',
            'single-report-error-operation',
        ],
        expectedRecordCount: 2,
        expectedRenderedViolationCount: 2,
    },
    {
        label: 'single operationが異なる場合',
        path: singleRoute,
        expected: 'reportError("challenge:progress", normalized);',
        replacement: 'reportError("challenge:progress:wrong", normalized);',
        expectedIds: ['single-report-error-operation'],
        expectedRecordCount: 1,
        expectedRenderedViolationCount: 1,
    },
    {
        label: 'batch固定messageが異なる場合',
        path: batchRoute,
        expected: '"Challenge progress batch request failed"',
        replacement: '"Wrong batch request message"',
        expectedIds: ['batch-error-message'],
        expectedRecordCount: 1,
        expectedRenderedViolationCount: 1,
    },
    {
        label: 'batch固定codeが異なる場合',
        path: batchRoute,
        expected: '"CHALLENGE_PROGRESS_BATCH_UNAVAILABLE"',
        replacement: '"CHALLENGE_PROGRESS_BATCH_WRONG"',
        expectedIds: ['batch-error-code'],
        expectedRecordCount: 1,
        expectedRenderedViolationCount: 1,
    },
    {
        label: 'batch operationが異なる場合',
        path: batchRoute,
        expected: 'reportError("challenge:progress:batch", normalized);',
        replacement: 'reportError("challenge:progress:wrong", normalized);',
        expectedIds: ['batch-report-error-operation'],
        expectedRecordCount: 1,
        expectedRenderedViolationCount: 1,
    },
    {
        label: 'batch routeのstage帰属が欠落した場合',
        path: batchRoute,
        expected: 'const stage = authenticationComplete',
        replacement: 'const stage = true',
        expectedIds: ['batch-stage-attribution'],
        expectedRecordCount: 1,
        expectedRenderedViolationCount: 1,
    },
    {
        label: 'serviceの再固定化境界が欠落した場合',
        path: 'lib/services/challenge-progress-service.ts',
        expected: 'return progressFailure(stage);',
        replacement: 'return error as AppError;',
        expectedIds: ['service-refixed-boundary'],
        expectedRecordCount: 1,
        expectedRenderedViolationCount: 1,
    },
];

const unsafeDateParseCases: UnsafeDateParseCase[] = [
    {
        label: 'new DateのISO date-only literal',
        source: 'export const dateOnlyConstructor = new Date("2026-07-28");',
        callKind: 'new Date',
    },
    {
        label: 'Date.parseのISO date-only literal',
        source: 'export const dateOnlyParser = Date.parse("2026-07-28");',
        callKind: 'Date.parse',
    },
    {
        label: '空白付きISO date-only literal',
        source: 'export const paddedDateOnly = new Date(" 2026-07-28 ");',
        callKind: 'new Date',
    },
    {
        label: 'no-substitution templateのISO date-only literal',
        source: 'export const templateDateOnly = Date.parse(`2026-07-28`);',
        callKind: 'Date.parse',
    },
    {
        label: 'new Dateのend_date property',
        source: 'export function parseEndProperty(event: { end_date: string }) { return new Date(event.end_date); }',
        callKind: 'new Date',
    },
    {
        label: 'Date.parseのstart_date element access',
        source: 'export function parseStartElement(event: { start_date: string }) { return Date.parse(event["start_date"]); }',
        callKind: 'Date.parse',
    },
    {
        label: 'date-only identifier',
        source: 'export function parseDateIdentifier(dateStr: string) { return new Date(dateStr); }',
        callKind: 'new Date',
    },
    {
        label: '未知のDate.parse identifier',
        source: 'export function parseUnknownIdentifier(value: string) { return Date.parse(value); }',
        callKind: 'Date.parse',
    },
    {
        label: 'offsetなしT00:00:00 template',
        source: 'export function parseStartTemplate(event: { start_date: string }) { return new Date(`${event.start_date}T00:00:00`); }',
        callKind: 'new Date',
    },
    {
        label: 'offsetなしT23:59:59 template',
        source: 'export function parseEndTemplate(endDate: string) { return Date.parse(`${endDate}T23:59:59`); }',
        callKind: 'Date.parse',
    },
    {
        label: 'offsetなしT00:00:00 binary',
        source: 'export function parseEndBinary(event: { end_date: string }) { return new Date(event.end_date + "T00:00:00"); }',
        callKind: 'new Date',
    },
    {
        label: 'offsetなしT23:59:59 binary',
        source: 'export function parseStartBinary(startDate: string) { return Date.parse(startDate + "T23:59:59"); }',
        callKind: 'Date.parse',
    },
    {
        label: 'date-only安全を証明できないtemplate',
        source: 'export function parseUnknownTemplate(value: string) { return new Date(`${value}`); }',
        callKind: 'new Date',
    },
];

function writeFixtureFile(path: string, source: string): void {
    const fixturePath = join(fixtureRoot, path);
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, source, 'utf8');
}

function writeOriginalFixtures(): void {
    for (const [path, source] of originalSources) {
        writeFixtureFile(path, source);
    }
}

function writeDoubleQuotedFixture(): Map<string, string> {
    const sources = new Map<string, string>();
    for (const path of fixturePaths) {
        const originalSource = originalSources.get(path);
        if (originalSource === undefined) {
            throw new Error(`Missing fixture source: ${path}`);
        }
        const source =
            path === singleRoute || path === batchRoute
                ? originalSource.replaceAll("'", '"')
                : originalSource;
        sources.set(path, source);
        writeFixtureFile(path, source);
    }
    return sources;
}

function applyBoundaryMutation(boundary: InvalidBoundary): void {
    const source = readFileSync(join(fixtureRoot, boundary.path), 'utf8');
    expect(source).toContain(boundary.expected);
    writeFixtureFile(
        boundary.path,
        source.replace(boundary.expected, boundary.replacement),
    );
}

function runChallengeProgressRule(): RuleCheckResult {
    const result = spawnSync(
        'bash',
        [ruleChecker, '--challenge-progress-auth-log-boundary-only'],
        {
            cwd: fixtureRoot,
            encoding: 'utf8',
        },
    );
    return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
    };
}

function writeDateBoundaryFixtureFile(path: string, source: string): void {
    const fixturePath = join(dateBoundaryFixtureRoot, path);
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, source, 'utf8');
}

function writeSafeDateBoundaryFixtures(): void {
    writeDateBoundaryFixtureFile(
        'components/group/SafeBoundary.ts',
        [
            'interface Schedule { start_date: string; end_date: string; created_at: string }',
            'declare function getChallengeScheduleMetrics(schedule: Schedule, now: number): unknown;',
            'export function parseSafeValues(existingDate: Date, timestamp: string, epoch: number, schedule: Schedule) {',
            '  return [',
            '    new Date(),',
            '    new Date(existingDate),',
            '    new Date(epoch),',
            '    new Date(Date.now()),',
            '    new Date(2026, 6, 28),',
            '    new Date("2026-07-28T12:34:56"),',
            '    new Date("2026-07-28T12:34:56Z"),',
            '    Date.parse("2026-07-28T12:34:56+09:00"),',
            '    Date.parse("2026-07-28T12:34:56+0900"),',
            '    new Date(timestamp),',
            '    Date.parse(schedule.created_at),',
            '    new Date(`${schedule.end_date}T00:00:00+09:00`),',
            '    Date.parse(schedule.start_date + "T00:00:00Z"),',
            '    new Date(schedule.end_date + "T00:00:00+0900"),',
            '    getChallengeScheduleMetrics(schedule, Date.now()),',
            '  ];',
            '}',
            '',
        ].join('\n'),
    );
    writeDateBoundaryFixtureFile(
        'components/group/CommentOnly.ts',
        '// new Date(event.end_date)\n// Date.parse(`${event.start_date}T00:00:00`)\nexport const safe = true;\n',
    );
    writeDateBoundaryFixtureFile(
        'components/group/UnsafeBoundary.test.ts',
        'export function parseEnd(event: { end_date: string }) { return new Date(event.end_date); }\n',
    );
    writeDateBoundaryFixtureFile(
        'components/group/UnsafeBoundary.spec.tsx',
        'export function parseStart(event: { start_date: string }) { return Date.parse(event.start_date); }\n',
    );
    writeDateBoundaryFixtureFile(
        'components/group/__fixtures__/UnsafeBoundary.ts',
        'export function parseEnd(endDate: string) { return new Date(endDate); }\n',
    );
    writeDateBoundaryFixtureFile(
        'components/group/fixture/UnsafeBoundary.tsx',
        'export function parseEnd(endDate: string) { return Date.parse(endDate); }\n',
    );
    writeDateBoundaryFixtureFile(
        'docs/date-boundary.md',
        '```ts\nnew Date(event.end_date)\nDate.parse(`${event.start_date}T00:00:00`)\n```\n',
    );
}

function runDateBoundaryRule(
    option:
        | '--date-only-parse-only'
        | '--date-only-jst-end-boundary-only',
): RuleCheckResult {
    const result = spawnSync(
        'bash',
        [ruleChecker, option, dateBoundaryFixtureRoot],
        {
            cwd: repositoryRoot,
            encoding: 'utf8',
        },
    );
    return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
    };
}

describe('checkChallengeProgressAuthLogBoundary', () => {
    beforeEach(() => {
        writeDoubleQuotedFixture();
    });

    it('既存のsingle quote表記の場合、固定境界を受理する', () => {
        writeOriginalFixtures();

        const records = checkChallengeProgressAuthLogBoundary({
            root: fixtureRoot,
        });

        expect(records).toEqual([]);
        expect(renderRuleTargetResult(records)).toContain(
            'OK: UCFitness rule-check passed',
        );
    });

    it('同値なdouble quoteへ変更した場合、固定境界を受理する', () => {
        const records = checkChallengeProgressAuthLogBoundary({
            root: fixtureRoot,
        });

        expect(records).toEqual([]);
        expect(renderRuleTargetResult(records)).toContain(
            'OK: UCFitness rule-check passed',
        );
    });

    it.each(invalidBoundaries)(
        '$label、exact predicate IDで固定境界違反を拒否する',
        (boundary) => {
            applyBoundaryMutation(boundary);

            const records = checkChallengeProgressAuthLogBoundary({
                root: fixtureRoot,
            });

            expect(records.map(({ id }) => id)).toEqual(boundary.expectedIds);
            expect(records).toHaveLength(boundary.expectedRecordCount);
            const output = renderRuleTargetResult(records);
            expect(output).toContain(
                'challenge progress',
            );
            expect(output).toContain(
                `NG: ${boundary.expectedRenderedViolationCount} rule violation(s) detected`,
            );
        },
    );
});

describe('renderRuleTargetResult', () => {
    it('同じ既存違反単位の2 predicateを1件のNG表示へまとめる', () => {
        const records = [
            {
                id: 'batch-error-message',
                groupId: 'challenge-progress-normalization',
                label: 'challenge progressの固定AppError正規化欠落',
                body: 'single/batch progress routes',
            },
            {
                id: 'batch-error-code',
                groupId: 'challenge-progress-normalization',
                label: 'challenge progressの固定AppError正規化欠落',
                body: 'single/batch progress routes',
            },
        ];

        const output = renderRuleTargetResult(records);

        expect(records.map(({ id }) => id)).toEqual([
            'batch-error-message',
            'batch-error-code',
        ]);
        expect(output).toBe(
            'NG: 1 rule violation(s) detected\n\n' +
                '❌ [challenge progressの固定AppError正規化欠落]\n' +
                'single/batch progress routes\n\n',
        );
    });
});

describe('checkDateOnlyParse', () => {
    beforeEach(() => {
        rmSync(dateBoundaryFixtureRoot, { recursive: true, force: true });
        mkdirSync(dateBoundaryFixtureRoot, { recursive: true });
        writeSafeDateBoundaryFixtures();
    });

    it(
        '明示offset・epoch・Date・完全timestamp・共有helperを受理し、除外対象を走査しない',
        async () => {
            const records = await checkDateOnlyParse({
                scanRoot: dateBoundaryFixtureRoot,
            });

            expect(records).toEqual([]);
            expect(renderRuleTargetResult(records)).toContain(
                'OK: UCFitness rule-check passed',
            );
        },
        DATE_RULE_CHECK_TIMEOUT_MS,
    );

    it(
        '13 unsafe expressionと6 production directory findingを一度の走査ですべて報告する',
        async () => {
            const expressionPath = 'components/group/UnsafeExpressions.ts';
            writeDateBoundaryFixtureFile(
                expressionPath,
                `${unsafeDateParseCases
                    .map(({ source }) => source)
                    .join('\n')}\n`,
            );
            productionDirectories.forEach((directory) => {
                writeDateBoundaryFixtureFile(
                    `${directory}/UnsafeDirectory.ts`,
                    'export function parse(event: { end_date: string }) { return new Date(event.end_date); }\n',
                );
            });

            const records = await checkDateOnlyParse({
                scanRoot: dateBoundaryFixtureRoot,
            });
            const expressionRecords = records.filter(({ body }) =>
                body.startsWith(`${expressionPath}:`),
            );
            const directoryRecords = records.filter(({ body }) =>
                body.includes('/UnsafeDirectory.ts:'),
            );
            const output = renderRuleTargetResult(records);

            expect(records).toHaveLength(19);
            expect(expressionRecords).toHaveLength(13);
            unsafeDateParseCases.forEach((testCase, index) => {
                const line = index + 1;
                const kindId =
                    testCase.callKind === 'new Date'
                        ? 'new-date'
                        : 'date-parse';
                expect(
                    expressionRecords.map(({ id }) => id),
                    testCase.label,
                ).toContain(
                    `date-only-parse:${expressionPath}:${line}:${kindId}`,
                );
                expect(output, testCase.label).toContain(
                    `${expressionPath}:${line} ${testCase.callKind}`,
                );
            });
            expect(directoryRecords.map(({ body }) => body)).toEqual(
                productionDirectories.map(
                    (directory) =>
                        `${directory}/UnsafeDirectory.ts:1 new Date`,
                ),
            );
            productionDirectories.forEach((directory) => {
                expect(output).toContain(
                    `${directory}/UnsafeDirectory.ts:1 new Date`,
                );
            });
            expect(output).toContain(
                'timezone依存のdate-only parse (new Date / Date.parse)',
            );
        },
        DATE_RULE_CHECK_TIMEOUT_MS,
    );
});

describe('runRuleTargetsCli', () => {
    it('TypeScript loader失敗を固定非stack違反へ変換し、processを変更しない', async () => {
        const originalExitCode = process.exitCode;
        const stdoutWrite = vi
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);
        const stderrWrite = vi
            .spyOn(process.stderr, 'write')
            .mockImplementation(() => true);

        try {
            const result = await runRuleTargetsCli(
                ['--date-only-parse-only', dateBoundaryFixtureRoot],
                {
                    cwd: repositoryRoot,
                    loadTypeScript: async () => {
                        throw new Error('loader-secret-stack');
                    },
                },
            );

            expect(result.records.map(({ id }) => id)).toEqual([
                'date-engine-failure',
            ]);
            expect(result.exitCode).toBe(1);
            expect(result.output).toBe(
                'NG: 1 rule violation(s) detected\n\n' +
                    '❌ [UCFitness semantic rule engine failure]\n' +
                    'timezone date-only rule engine failed\n\n',
            );
            expect(result.output).not.toContain('loader-secret-stack');
            expect(stdoutWrite).not.toHaveBeenCalled();
            expect(stderrWrite).not.toHaveBeenCalled();
            expect(process.exitCode).toBe(originalExitCode);
        } finally {
            stdoutWrite.mockRestore();
            stderrWrite.mockRestore();
        }
    });
});

describe('check-ucfitness-rules semantic CLI smoke', () => {
    beforeEach(() => {
        writeDoubleQuotedFixture();
        rmSync(dateBoundaryFixtureRoot, { recursive: true, force: true });
        mkdirSync(dateBoundaryFixtureRoot, { recursive: true });
    });

    it('challenge mutationをBash targeted CLIで拒否する', () => {
        applyBoundaryMutation(invalidBoundaries[1]);

        const result = runChallengeProgressRule();

        expect(result.status, result.output).toBe(1);
        expect(result.output).toContain('NG: 1 rule violation(s) detected');
        expect(result.output).toContain(
            'challenge progressの固定AppError正規化欠落',
        );
        expect(result.output).toContain('single/batch progress routes');
    });

    it(
        'date primary optionのunsafe expressionをBash targeted CLIで拒否する',
        () => {
            writeDateBoundaryFixtureFile(
                'components/group/UnsafeBoundary.ts',
                'export const unsafeDate = new Date("2026-07-28");\n',
            );

            const result = runDateBoundaryRule('--date-only-parse-only');

            expect(result.status, result.output).toBe(1);
            expect(result.output).toContain(
                'timezone依存のdate-only parse (new Date / Date.parse)',
            );
            expect(result.output).toContain(
                'components/group/UnsafeBoundary.ts:1 new Date',
            );
        },
        DATE_RULE_CHECK_TIMEOUT_MS,
    );

    it(
        'date compatibility aliasのunsafe expressionをBash targeted CLIで拒否する',
        () => {
            writeDateBoundaryFixtureFile(
                'components/group/UnsafeBoundary.ts',
                'export const unsafeDate = Date.parse("2026-07-28");\n',
            );

            const result = runDateBoundaryRule(
                '--date-only-jst-end-boundary-only',
            );

            expect(result.status, result.output).toBe(1);
            expect(result.output).toContain(
                'timezone依存のdate-only parse (new Date / Date.parse)',
            );
            expect(result.output).toContain(
                'components/group/UnsafeBoundary.ts:1 Date.parse',
            );
        },
        DATE_RULE_CHECK_TIMEOUT_MS,
    );
});
