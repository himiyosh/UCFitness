import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const readRepositoryFile = (filePath: string): string =>
  readFileSync(path.join(root, filePath), "utf8");

function collectRuntimeSourceFiles(relativeDirectory: string): string[] {
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
}

const runtimeSources = ["app", "components", "hooks", "lib"]
  .flatMap(collectRuntimeSourceFiles);
const routePaths = [
  "app/api/user/feed/route.ts",
  "app/api/user/feed/unread-count/route.ts",
  "app/api/user/follow/route.ts",
  "app/api/user/follow/status/route.ts",
  "app/api/user/followers/route.ts",
  "app/api/user/following/route.ts",
  "app/api/user/following-comparison/route.ts",
  "app/api/user/group/route.ts",
] as const;
const routeSource = routePaths
  .map((filePath) => readRepositoryFile(filePath))
  .join("\n");
const userFollowReferences = runtimeSources.flatMap((filePath) => {
  const source = readRepositoryFile(filePath);
  return [...source.matchAll(/\.from\(["']user_follows["']\)/g)].map(
    (match) => ({
      filePath,
      clientPrefix: source.slice(Math.max(0, match.index - 120), match.index),
      segment: source.slice(match.index, match.index + 700),
    }),
  );
});

describe("user_follows RLS audit", () => {
  it("Phase 1から7の成果が変更されていない", () => {
    const expectedHashes = new Map([
      [
        "migrations/20260720_harden_api_keys_rls.sql",
        "5138a2695ed34f0fe8f17112e586a82ee089bc7b0f202d6770af990475391636",
      ],
      [
        "migrations/20260720_harden_push_subscriptions_rls.sql",
        "5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66",
      ],
      [
        "migrations/20260720_harden_coin_transactions_rls.sql",
        "32324ceae1333fefb67a0d8788facf23ea2fd435332e78c4ac103bbcabdf426f",
      ],
      [
        "migrations/20260720_harden_coin_balances_rls.sql",
        "31c7de8805482777c21b2b5f48b9a99d5325528505df9cbe1f2664a56e8750c0",
      ],
      [
        "migrations/20260720_harden_user_badges_rls.sql",
        "afb875da92a405b692b12ef702ea7a7b739088f9a4179cab452be02df9eccc3d",
      ],
      [
        "migrations/20260720_harden_badges_rls.sql",
        "b584c8edc85db244c9e8412a8b5a1bc58d95006448e1f492eb67a58283d8d06c",
      ],
      [
        "lib/__tests__/walking-routes-rls-audit.test.ts",
        "7a2240f6228a5c153ac17d21b3bd4d89d0988410288463089410772b05358d23",
      ],
    ]);

    for (const [filePath, expectedHash] of expectedHashes) {
      const content = readFileSync(path.join(root, filePath));
      expect(createHash("sha256").update(content).digest("hex")).toBe(
        expectedHash,
      );
    }
  });

  it("9つのPostgREST経路を8つのserver routeとsupabaseAdminに限定する", () => {
    const referenceCounts = userFollowReferences.reduce<Record<string, number>>(
      (counts, { filePath }) => ({
        ...counts,
        [filePath]: (counts[filePath] ?? 0) + 1,
      }),
      {},
    );

    expect(referenceCounts).toEqual({
      "app/api/user/feed/route.ts": 1,
      "app/api/user/feed/unread-count/route.ts": 1,
      "app/api/user/follow/route.ts": 2,
      "app/api/user/follow/status/route.ts": 1,
      "app/api/user/followers/route.ts": 1,
      "app/api/user/following/route.ts": 1,
      "app/api/user/following-comparison/route.ts": 1,
      "app/api/user/group/route.ts": 1,
    });
    expect(userFollowReferences).toHaveLength(9);
    for (const { clientPrefix } of userFollowReferences) {
      expect(clientPrefix).toMatch(/supabaseAdmin\s*$/);
    }
  });

  it("現行CRUDとschema確定後の最小grant候補を固定する", () => {
    const operation = (segment: string): string | undefined =>
      segment.match(
        /^\s*\.from\(["']user_follows["']\)\s*\.(\w+)/,
      )?.[1];
    const operations = userFollowReferences.map(({ segment }) =>
      operation(segment)
    );
    const signatures = userFollowReferences.map(({ filePath, segment }) => {
      const columns = segment.match(
        /\.select\(\s*["']([^"']+)["']/,
      )?.[1] ?? "";
      return `${filePath}|${operation(segment)}|${columns}`;
    }).sort();

    expect(signatures).toEqual([
      "app/api/user/feed/route.ts|select|following_id",
      "app/api/user/feed/unread-count/route.ts|select|following_id",
      "app/api/user/follow/route.ts|delete|",
      "app/api/user/follow/route.ts|insert|",
      "app/api/user/follow/status/route.ts|select|id",
      "app/api/user/followers/route.ts|select|follower_id, created_at",
      "app/api/user/following-comparison/route.ts|select|following_id",
      "app/api/user/following/route.ts|select|following_id, created_at",
      "app/api/user/group/route.ts|select|id",
    ]);
    expect(operations.filter((value) => value === "select")).toHaveLength(7);
    expect(operations.filter((value) => value === "insert")).toHaveLength(1);
    expect(operations.filter((value) => value === "delete")).toHaveLength(1);
    expect(operations).not.toContain("update");
    expect(operations).not.toContain("upsert");
    expect(routeSource).toMatch(/\.select\(["']id["']\)/);
    expect(routeSource).toContain('.select("following_id, created_at"');
    expect(routeSource).toContain('.select("follower_id, created_at")');
    expect(routeSource).toMatch(/\.select\(["']following_id["']\)/);
    expect(routeSource).toMatch(
      /\.insert\(\{\s*follower_id: userId,\s*following_id: targetUserId,\s*\}\)/,
    );
    expect(routeSource).toMatch(
      /\.delete\(\)\s*\.eq\(["']follower_id["'], userId\)\s*\.eq\(["']following_id["'], targetUserId\)/,
    );

    const readme = readRepositoryFile("README.md");
    expect(readme).toContain(
      "`service_role`へのgrant候補は4列のcolumn `SELECT`、",
    );
    expect(readme).toContain(
      "`follower_id` / `following_id`のcolumn `INSERT`、table `DELETE`",
    );
    expect(readme).toContain("直接`UPDATE` / upsertは存在しない");
  });

  it("browserをsame-origin APIに限定してSupabase直接接続を許可しない", () => {
    const browserRequests = runtimeSources.flatMap((filePath) => {
      const source = readRepositoryFile(filePath);
      if (!/^\s*["']use client["'];/m.test(source)) {
        return [];
      }
      return [
        ...source.matchAll(
          /fetch\(\s*([`"'])([^`"']*\/api\/user\/(?:feed|follow)[^`"']*)\1/g,
        ),
      ].map((match) => ({ filePath, source, url: match[2] }));
    });

    expect(browserRequests.length).toBeGreaterThan(0);
    for (const { source, url } of browserRequests) {
      expect(url).toMatch(/^\/api\/user\/(?:feed|follow)/);
      expect(source).not.toContain("@/lib/supabase");
    }
  });

  it("完全schema証拠がない間はuser_follows migrationを作らない", () => {
    const migrationReferences = readdirSync(path.join(root, "migrations"))
      .filter((fileName) => fileName.endsWith(".sql"))
      .filter((fileName) =>
        /\buser_follows\b/i.test(
          readRepositoryFile(`migrations/${fileName}`),
        )
      );
    const databaseTypes = readRepositoryFile("types/database.ts");
    const followRoute = readRepositoryFile("app/api/user/follow/route.ts");

    expect(migrationReferences).toEqual([]);
    expect(databaseTypes).toMatch(
      /user_follows:\s*\{\s*Row:\s*\{\s*id: string;\s*follower_id: string;\s*following_id: string;\s*created_at: string;/,
    );
    expect(followRoute).toMatch(
      /\.insert\(\{\s*follower_id: userId,\s*following_id: targetUserId,\s*\}\)/,
    );
    expect(followRoute).toContain("重複は UNIQUE 制約でエラーになる");
    expect(readRepositoryFile("README.md")).toContain(
      "FROM pg_catalog.pg_trigger",
    );
  });

  it("RLS変更と分離したlookup障害契約を記録する", () => {
    const followRoute = readRepositoryFile("app/api/user/follow/route.ts");
    const followersRoute = readRepositoryFile(
      "app/api/user/followers/route.ts",
    );
    const comparisonRoute = readRepositoryFile(
      "app/api/user/following-comparison/route.ts",
    );
    const groupRoute = readRepositoryFile("app/api/user/group/route.ts");

    expect(followRoute).toContain("error: targetLookupError");
    expect(followRoute).toContain('targetLookupError?.code === "PGRST116"');
    expect(followRoute).toContain('"user/follow:target_lookup"');
    expect(followRoute).toContain('"Failed to load target user"');
    expect(followersRoute).toContain("error: profilesError");
    expect(followersRoute).toContain('"user/followers:profiles"');
    expect(followersRoute).toContain('"Failed to fetch follower profiles"');
    expect(comparisonRoute).toContain("error: followingError");
    expect(comparisonRoute).toContain("'user/following-comparison:follows'");
    expect(comparisonRoute).toContain("'user/following-comparison:profiles'");
    expect(comparisonRoute).toContain("'user/following-comparison:steps'");
    expect(comparisonRoute).not.toContain("'Unknown'");
    expect(groupRoute).toContain("error: followLookupError");
    expect(groupRoute).toContain("followLookupError?.code === 'PGRST116'");
    expect(groupRoute).toContain("'user/group:invite_follow_lookup'");
    expect(groupRoute).toContain('"Failed to verify follow relationship"');
  });

  it("F001を変更せずF016とPhase 7・8のaudit-only成果を維持する", () => {
    const features = JSON.parse(
      readRepositoryFile(".github/ucfitness-features.json"),
    ) as { features: Array<{ id: string; status: string }> };
    const progress = JSON.parse(
      readRepositoryFile(".github/ucfitness-progress.json"),
    ) as {
      sessionLog: Array<{ date: string; action: string; commit: string }>;
    };
    const phase7 = progress.sessionLog.find(
      ({ commit }) => commit === "b34076de8376076b5ff5b5eb524e0ebfe5d18265",
    );
    const phase8 = progress.sessionLog.find(
      ({ commit }) => commit === "6e40ce547b78f04a1cb331e2e29a784459f3357d",
    );

    expect(
      features.features
        .filter(({ id }) => ["F001", "F016"].includes(id))
        .map(({ id, status }) => [id, status]),
    ).toEqual([
      ["F001", "not-started"],
      ["F016", "in-progress"],
    ]);
    expect(phase7?.date).toBe("2026-07-20");
    expect(phase7?.action).toContain(
      "完全schemaを確定できないためmigrationを推測せずaudit-only",
    );
    expect(phase8?.date).toBe("2026-07-20");
    expect(phase8?.action).toContain(
      "7 SELECT・1 INSERT・1 DELETE",
    );
    expect(phase8?.action).toContain("保護済み件数は9/25据え置き");
  });
});
