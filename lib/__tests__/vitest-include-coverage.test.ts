import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import packageManifest from "../../package.json";
import vitestConfig from "../../vitest.config";

const REPOSITORY_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const SKIPPED_DIRECTORIES = new Set([
    ".git",
    ".next",
    ".open-next",
    ".venv",
    ".wrangler",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "playwright-report",
    "test-results",
    "vendor",
]);
const VITEST_FILE_PATTERN = /\.test\.tsx?$/;

function collectVitestFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) {
            return SKIPPED_DIRECTORIES.has(entry.name)
                ? []
                : collectVitestFiles(path.join(directory, entry.name));
        }
        return VITEST_FILE_PATTERN.test(entry.name)
            ? [path.join(directory, entry.name)]
            : [];
    });
}

function normalizePath(filePath: string): string {
    return filePath.split(path.sep).join("/");
}

function isIncluded(file: string, includePatterns: readonly string[]): boolean {
    if (typeof path.posix.matchesGlob !== "function") {
        throw new Error("Vitest include coverage requires Node.js 22.5 or newer");
    }
    return includePatterns.some((pattern) => path.posix.matchesGlob(file, pattern));
}

describe("Vitest include coverage", () => {
    const includePatterns = vitestConfig.test?.include;

    it("include patternが1件以上定義されている場合、収集契約として利用できる", () => {
        expect(includePatterns).toBeDefined();
        expect(includePatterns?.length).toBeGreaterThan(0);
    });

    it("directory rootではなくglob全体を照合する場合、拡張子差を検出する", () => {
        expect(isIncluded("app/error.test.tsx", ["app/**/*.test.ts"])).toBe(false);
        expect(isIncluded("app/error.test.tsx", ["app/**/*.test.{ts,tsx}"])).toBe(true);
    });

    it("通常・watch・coverageはinclude外でも動くcollection preflightを先に実行する", () => {
        expect(packageManifest.scripts["test:collection"]).toBe(
            "vitest run lib/__tests__/vitest-include-coverage.test.ts",
        );
        for (const scriptName of ["test", "test:watch", "test:coverage"] as const) {
            expect(packageManifest.scripts[scriptName]).toMatch(
                /^npm run test:collection && /,
            );
        }
    });

    it("repository内の全test.tsとtest.tsxがincludeに一致する場合、未収集fileを残さない", () => {
        const uncovered = collectVitestFiles(REPOSITORY_ROOT)
            .map((file) => normalizePath(path.relative(REPOSITORY_ROOT, file)))
            .filter((file) => !isIncluded(file, includePatterns ?? []))
            .sort();

        expect(
            uncovered,
            `These test files are never collected by Vitest include [${includePatterns?.join(", ")}]. `
                + "Update test.include or move the files into a collected path.",
        ).toEqual([]);
    });
});
