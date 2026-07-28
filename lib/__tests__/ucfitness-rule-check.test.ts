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

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

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
const dateBoundaryFixtureRoot = mkdtempSync(join(tmpdir(), 'ucfitness-date-boundary-rule-'));
const DATE_RULE_CHECK_TIMEOUT_MS = 15_000;

interface RuleCheckResult {
    status: number | null;
    output: string;
}

interface InvalidBoundary {
    label: string;
    path: (typeof fixturePaths)[number];
    expected: string;
    replacement: string;
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
    },
    {
        label: 'single operationが異なる場合',
        path: singleRoute,
        expected: 'reportError("challenge:progress", normalized);',
        replacement: 'reportError("challenge:progress:wrong", normalized);',
    },
    {
        label: 'batch固定messageが異なる場合',
        path: batchRoute,
        expected: '"Challenge progress batch request failed"',
        replacement: '"Wrong batch request message"',
    },
    {
        label: 'batch固定codeが異なる場合',
        path: batchRoute,
        expected: '"CHALLENGE_PROGRESS_BATCH_UNAVAILABLE"',
        replacement: '"CHALLENGE_PROGRESS_BATCH_WRONG"',
    },
    {
        label: 'batch operationが異なる場合',
        path: batchRoute,
        expected: 'reportError("challenge:progress:batch", normalized);',
        replacement: 'reportError("challenge:progress:wrong", normalized);',
    },
    {
        label: 'batch routeのstage帰属が欠落した場合',
        path: batchRoute,
        expected: 'const stage = authenticationComplete',
        replacement: 'const stage = true',
    },
    {
        label: 'serviceの再固定化境界が欠落した場合',
        path: 'lib/services/challenge-progress-service.ts',
        expected: 'return progressFailure(stage);',
        replacement: 'return error as AppError;',
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
        label: 'slash区切りのlocal midnight literal',
        source: 'export const slashDateConstructor = new Date("2026/07/28");',
        callKind: 'new Date',
    },
    {
        label: '英語月名のlocal midnight literal',
        source: 'export const namedDateConstructor = new Date("July 28, 2026");',
        callKind: 'new Date',
    },
    {
        label: 'new Dateのoffsetなし完全timestamp literal',
        source: 'export const localTimestampConstructor = new Date("2026-07-28T12:34:56");',
        callKind: 'new Date',
    },
    {
        label: 'Date.parseのoffsetなし小数秒timestamp literal',
        source: 'export const localTimestampParser = Date.parse("2026-07-28T12:34:56.123");',
        callKind: 'Date.parse',
    },
    {
        label: '空白付きISO date-only literal',
        source: 'export const paddedDateOnly = new Date(" 2026-07-28 ");',
        callKind: 'new Date',
    },
    {
        label: '空白付きoffset timestamp literal',
        source: 'export const paddedTimestamp = new Date(" 2026-07-28T12:34:56Z ");',
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
    {
        label: 'full timestamp構造を持たないoffset付きtemplate',
        source: 'export function parseOffsetOnlyTemplate(value: string) { return new Date(`${value}+09:00`); }',
        callKind: 'new Date',
    },
    {
        label: '未検証変数へZだけを付けるtemplate',
        source: 'export function parseUnvalidatedZulu(unvalidatedVar: string) { return new Date(`${unvalidatedVar}Z`); }',
        callKind: 'new Date',
    },
    {
        label: 'full timestamp構造を持たないZ付きbinary',
        source: 'export function parseOffsetOnlyBinary(value: string) { return Date.parse(value + "Z"); }',
        callKind: 'Date.parse',
    },
];

function writeFixtureFile(path: string, source: string): void {
    const fixturePath = join(fixtureRoot, path);
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, source, 'utf8');
}

function writeDoubleQuotedFixture(): Map<string, string> {
    const sources = new Map<string, string>();
    for (const path of fixturePaths) {
        const originalSource = originalSources.get(path);
        if (originalSource === undefined) {
            throw new Error(`Missing fixture source: ${path}`);
        }
        const source = path === singleRoute || path === batchRoute
            ? originalSource.replaceAll("'", '"')
            : originalSource;
        sources.set(path, source);
        writeFixtureFile(path, source);
    }
    return sources;
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
            '    new Date("2026-07-28T12:34:56Z"),',
            '    new Date("2026-07-28T12:34:56.123456789Z"),',
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
    option = '--date-only-parse-only',
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

describe('check-ucfitness-rules challenge progress認証ログ境界', () => {
    beforeEach(() => {
        writeDoubleQuotedFixture();
    });

    afterAll(() => {
        rmSync(fixtureRoot, { recursive: true, force: true });
    });

    it('既存のsingle quote表記でも固定境界を受理する', () => {
        for (const [path, source] of originalSources) {
            writeFixtureFile(path, source);
        }

        const result = runChallengeProgressRule();

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain('OK: UCFitness rule-check passed');
    });

    it('同値なdouble quoteへ変更した場合、固定境界を受理する', () => {
        const result = runChallengeProgressRule();

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain('OK: UCFitness rule-check passed');
    });

    it.each(invalidBoundaries)('$label、固定境界違反として拒否する', (boundary) => {
        const sources = writeDoubleQuotedFixture();
        const source = sources.get(boundary.path);
        expect(source).toBeDefined();
        if (source === undefined) {
            throw new Error(`Missing fixture source: ${boundary.path}`);
        }
        expect(source).toContain(boundary.expected);
        const mutatedSource = source.replace(
            boundary.expected,
            boundary.replacement,
        );
        writeFixtureFile(boundary.path, mutatedSource);

        const result = runChallengeProgressRule();

        expect(result.status, result.output).toBe(1);
        expect(result.output).toContain('challenge progress');
    });
});

describe('check-ucfitness-rules timezone依存date-only parse', () => {
    beforeEach(() => {
        rmSync(dateBoundaryFixtureRoot, { recursive: true, force: true });
        mkdirSync(dateBoundaryFixtureRoot, { recursive: true });
        writeSafeDateBoundaryFixtures();
    });

    afterAll(() => {
        rmSync(dateBoundaryFixtureRoot, { recursive: true, force: true });
    });

    it('明示offset付きtimestamp・epoch・Date・dynamic timestamp field・共有helperを受理し、除外対象を走査しない', () => {
        const result = runDateBoundaryRule();

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain('OK: UCFitness rule-check passed');
    }, DATE_RULE_CHECK_TIMEOUT_MS);

    it('旧date-only JST終了境界オプションを互換aliasとして維持する', () => {
        const result = runDateBoundaryRule('--date-only-jst-end-boundary-only');

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain('OK: UCFitness rule-check passed');
    }, DATE_RULE_CHECK_TIMEOUT_MS);

    it('literal・property・identifier・template・binaryの違反をすべて報告する', () => {
        writeDateBoundaryFixtureFile(
            'components/group/UnsafeBoundary.ts',
            `${unsafeDateParseCases.map(({ source }) => source).join('\n')}\n`,
        );

        const result = runDateBoundaryRule();

        expect(result.status, result.output).toBe(1);
        expect(result.output).toContain(
            'timezone依存のdate-only parse (new Date / Date.parse)',
        );
        unsafeDateParseCases.forEach((testCase, index) => {
            expect(result.output, testCase.label).toContain(
                `components/group/UnsafeBoundary.ts:${index + 1} ${testCase.callKind}`,
            );
        });
    }, DATE_RULE_CHECK_TIMEOUT_MS);

    it('app・components・contexts・hooks・lib・typesのproduction違反を走査する', () => {
        const directories = [
            'app',
            'components',
            'contexts',
            'hooks',
            'lib',
            'types',
        ];
        directories.forEach((directory) => {
            writeDateBoundaryFixtureFile(
                `${directory}/UnsafeBoundary.ts`,
                'export function parse(event: { end_date: string }) { return new Date(event.end_date); }\n',
            );
        });

        const result = runDateBoundaryRule();

        expect(result.status, result.output).toBe(1);
        directories.forEach((directory) => {
            expect(result.output).toContain(
                `${directory}/UnsafeBoundary.ts:1 new Date`,
            );
        });
    }, DATE_RULE_CHECK_TIMEOUT_MS);
});
