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
