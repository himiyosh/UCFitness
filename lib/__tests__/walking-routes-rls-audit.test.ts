import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const readRepositoryFile = (filePath: string): string =>
  readFileSync(path.join(root, filePath), "utf8");
const collectRuntimeSourceFiles = (relativeDirectory: string): string[] => {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(
    (entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        return entry.name === "__tests__"
          ? []
          : collectRuntimeSourceFiles(relativePath);
      }
      return entry.isFile() &&
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
        ? [relativePath]
        : [];
    },
  );
};
const collectionRoute = readRepositoryFile(
  "app/api/user/walking-routes/route.ts",
);
const itemRoute = readRepositoryFile(
  "app/api/user/walking-routes/[routeId]/route.ts",
);
const browserComponent = readRepositoryFile("components/WalkingRoutes.tsx");

describe("walking_routes RLS audit", () => {
  it("Phase 1から6のmigrationが変更されていない", () => {
    const expectedHashes = new Map([
      [
        "20260720_harden_api_keys_rls.sql",
        "5138a2695ed34f0fe8f17112e586a82ee089bc7b0f202d6770af990475391636",
      ],
      [
        "20260720_harden_push_subscriptions_rls.sql",
        "5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66",
      ],
      [
        "20260720_harden_coin_transactions_rls.sql",
        "32324ceae1333fefb67a0d8788facf23ea2fd435332e78c4ac103bbcabdf426f",
      ],
      [
        "20260720_harden_coin_balances_rls.sql",
        "31c7de8805482777c21b2b5f48b9a99d5325528505df9cbe1f2664a56e8750c0",
      ],
      [
        "20260720_harden_user_badges_rls.sql",
        "afb875da92a405b692b12ef702ea7a7b739088f9a4179cab452be02df9eccc3d",
      ],
      [
        "20260720_harden_badges_rls.sql",
        "b584c8edc85db244c9e8412a8b5a1bc58d95006448e1f492eb67a58283d8d06c",
      ],
    ]);

    for (const [fileName, expectedHash] of expectedHashes) {
      const content = readFileSync(path.join(root, "migrations", fileName));
      expect(createHash("sha256").update(content).digest("hex")).toBe(
        expectedHash,
      );
    }
  });

  it("6つのPostgREST経路をsupabaseAdminだけに限定する", () => {
    const routeSource = `${collectionRoute}\n${itemRoute}`;
    const runtimeReferences = ["app", "components", "hooks", "lib"]
      .flatMap(collectRuntimeSourceFiles)
      .filter((filePath) =>
        /\.from\(["']walking_routes["']\)/.test(readRepositoryFile(filePath)),
      )
      .sort();

    expect(runtimeReferences).toEqual([
      "app/api/user/walking-routes/[routeId]/route.ts",
      "app/api/user/walking-routes/route.ts",
    ]);
    expect(
      routeSource.match(/supabaseAdmin\s*\.from\(["']walking_routes["']\)/g),
    ).toHaveLength(6);
    expect(collectionRoute).toContain(
      "import { supabaseAdmin } from '@/lib/supabase'",
    );
    expect(itemRoute).toContain(
      "import { supabaseAdmin } from '@/lib/supabase'",
    );
    expect(routeSource).not.toMatch(/import\s+\{\s*supabase\s*\}/);
    expect(browserComponent).not.toContain("@/lib/supabase");
    expect(browserComponent).toContain("fetch('/api/user/walking-routes')");
    expect(browserComponent).toContain(
      "fetch(`/api/user/walking-routes/${routeId}`",
    );
  });

  it("現行CRUDとuser_id所有者filterを固定する", () => {
    const routeColumns =
      "id, name, description, distance_km, duration_minutes, difficulty, is_favorite, walk_count, last_walked_at, created_at";
    expect(collectionRoute).toMatch(
      new RegExp(
        String.raw`supabaseAdmin\s*\.from\('walking_routes'\)\s*\.select\('${routeColumns}'\)\s*\.eq\('user_id', session\.user\.id\)\s*\.order\('is_favorite'`,
      ),
    );
    expect(collectionRoute).toMatch(
      /supabaseAdmin\s*\.from\('walking_routes'\)\s*\.select\('id', \{ count: 'exact', head: true \}\)\s*\.eq\('user_id', session\.user\.id\)/,
    );
    expect(collectionRoute).toMatch(
      new RegExp(
        String.raw`supabaseAdmin\s*\.from\('walking_routes'\)\s*\.insert\(\{\s*user_id: session\.user\.id,\s*name,\s*description,\s*distance_km: distanceKm,\s*duration_minutes: durationMinutes,\s*difficulty,\s*\}\)\s*\.select\('${routeColumns}'\)\s*\.single\(\)`,
      ),
    );
    expect(itemRoute).toMatch(
      /supabaseAdmin\s*\.from\('walking_routes'\)\s*\.select\('id, walk_count'\)\s*\.eq\('id', routeId\)\s*\.eq\('user_id', session\.user\.id\)\s*\.single\(\)/,
    );
    expect(itemRoute).toMatch(
      new RegExp(
        String.raw`supabaseAdmin\s*\.from\('walking_routes'\)\s*\.update\(updates\)\s*\.eq\('id', routeId\)\s*\.eq\('user_id', session\.user\.id\)\s*\.select\('${routeColumns}'\)\s*\.single\(\)`,
      ),
    );
    expect(itemRoute).toMatch(
      /supabaseAdmin\s*\.from\('walking_routes'\)\s*\.delete\(\)\s*\.eq\('id', routeId\)\s*\.eq\('user_id', session\.user\.id\)/,
    );
  });

  it("追跡schema証拠がない間はwalking_routes migrationを作らない", () => {
    const migrationReferences = readdirSync(path.join(root, "migrations"))
      .filter((fileName) => fileName.endsWith(".sql"))
      .filter((fileName) =>
        /\bwalking_routes\b/i.test(
          readRepositoryFile(`migrations/${fileName}`),
        ),
      );
    const databaseTypes = readRepositoryFile("types/database.ts");

    expect(databaseTypes).not.toContain("walking_routes");
    expect(migrationReferences).toEqual([]);
    expect(
      existsSync(path.join(root, "migrations/023_walking_routes.sql")),
    ).toBe(false);
  });

  it("F001を変更せずF016をin-progressで維持する", () => {
    const features = JSON.parse(
      readRepositoryFile(".github/ucfitness-features.json"),
    ) as { features: Array<{ id: string; status: string }> };
    expect(
      features.features
        .filter(({ id }) => ["F001", "F016"].includes(id))
        .map(({ id, status }) => [id, status]),
    ).toEqual([
      ["F001", "not-started"],
      ["F016", "in-progress"],
    ]);
  });

  it("Phase 7のaudit-only進捗をdate・action・commitで固定する", () => {
    const progress = JSON.parse(
      readRepositoryFile(".github/ucfitness-progress.json"),
    ) as {
      lastCommit: string;
      sessionLog: Array<{
        date: string;
        action: string;
        commit: string;
      }>;
    };
    const auditCommit = "b34076de8376076b5ff5b5eb524e0ebfe5d18265";
    const phase = progress.sessionLog.find(
      ({ commit }) => commit === auditCommit,
    );

    expect(progress.lastCommit).toBe(auditCommit);
    expect(phase?.date).toBe("2026-07-20");
    expect(phase?.action).toContain(
      "追跡DDL・完全Database型・read-only実catalog接続がなく完全schemaを確定できないためmigrationを推測せずaudit-only",
    );
  });
});
