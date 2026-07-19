import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "migrations/20260721_harden_badges_rls.sql",
);
const migration = readFileSync(migrationPath, "utf8");

function readSourceTree(directory: string): string {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readSourceTree(relativePath);
      }
      return /\.(?:ts|tsx|js|mjs)$/.test(entry.name)
        ? [`// ${relativePath}\n${readFileSync(path.join(root, relativePath), "utf8")}`]
        : [];
    })
    .join("\n");
}

const serviceRoleSource = ["app", "lib", "scripts"]
  .map(readSourceTree)
  .join("\n");

describe("badges RLS migration", () => {
  it("Phase 1から5のmigrationが変更されていない", () => {
    const expectedHashes = new Map([
      ["20260720_harden_api_keys_rls.sql", "5138a2695ed34f0fe8f17112e586a82ee089bc7b0f202d6770af990475391636"],
      ["20260720_harden_push_subscriptions_rls.sql", "5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66"],
      ["20260720_harden_coin_transactions_rls.sql", "32324ceae1333fefb67a0d8788facf23ea2fd435332e78c4ac103bbcabdf426f"],
      ["20260720_harden_coin_balances_rls.sql", "31c7de8805482777c21b2b5f48b9a99d5325528505df9cbe1f2664a56e8750c0"],
      ["20260720_harden_user_badges_rls.sql", "afb875da92a405b692b12ef702ea7a7b739088f9a4179cab452be02df9eccc3d"],
    ]);

    for (const [fileName, expectedHash] of expectedHashes) {
      const content = readFileSync(path.join(root, "migrations", fileName));
      expect(createHash("sha256").update(content).digest("hex")).toBe(
        expectedHash,
      );
    }
  });

  it("現行PostgREST経路は2件のSELECTと2件のrelation SELECTだけを使う", () => {
    const directAccesses = [
      ...serviceRoleSource.matchAll(/\.from\((["'])badges\1\)/g),
    ];
    expect(directAccesses).toHaveLength(2);
    for (const access of directAccesses) {
      expect(serviceRoleSource.slice(access.index, access.index + 500)).toMatch(
        /\.select\(/,
      );
    }
    expect(serviceRoleSource).not.toMatch(
      /\.from\((["'])badges\1\)[\s\S]{0,500}\.(?:insert|upsert|update|delete)\(/,
    );
    expect(serviceRoleSource.match(/\bbadges\s*\(\s*name,/g)).toHaveLength(2);

    const requiredSelections = new Map([
      ["lib/services/badge-allocator.ts", "id, code, name, category, type, rank"],
      ["lib/services/badge-awards.ts", "name, image_url, description"],
      [
        "lib/services/badge-service.ts",
        "name, image_url, description, category, type, rank",
      ],
      [
        "app/api/user/feed/route.ts",
        "name, image_url, description, category, rank",
      ],
    ]);
    for (const [fileName, expectedSelection] of requiredSelections) {
      const source = readFileSync(path.join(root, fileName), "utf8").replace(
        /\s+/g,
        " ",
      );
      expect(source).toContain(expectedSelection);
    }
  });

  it("raw SQL seedをservice-roleのPostgREST upsert権限と混同しない", () => {
    const seedMigration = readFileSync(
      path.join(root, "migrations/20260718_add_streak_milestone_rewards.sql"),
      "utf8",
    );
    expect(seedMigration).toMatch(/INSERT INTO public\.badges/);
    expect(seedMigration).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
    expect(migration).not.toMatch(
      /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)/i,
    );
  });

  it("schema、key、FK、owner、RLS状態をtransaction内でfail closed検証する", () => {
    expect(migration).toMatch(/^BEGIN;\nSET LOCAL search_path = '';/);
    expect(migration).toContain(
      "LOCK TABLE public.badges IN ACCESS EXCLUSIVE MODE",
    );
    expect(migration).toContain("target must be an ordinary table");
    expect(migration).toContain("'id:uuid:t:t:'");
    expect(migration).toContain("'code:text:t:f:'");
    expect(migration).toContain("'rank:integer:t:f:'");
    expect(migration).toContain("'created_at:timestamp with time zone:t:t:'");
    expect(migration).toContain("primary or unique key mismatch");
    expect(migration).toContain("user_badges foreign key mismatch");
    expect(migration).toContain("owner_name IS DISTINCT FROM 'postgres'");
    expect(migration).toContain("service_bypass IS DISTINCT FROM true");
    expect(migration).toContain("unexpected owned sequence");
    expect(migration).toContain("unexpected RLS state or policy");
  });

  it("policyなしdefault denyと8列だけのservice-role SELECTを固定する", () => {
    expect(migration).toContain(
      "ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY",
    );
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(migration).toContain(
        `REVOKE ALL PRIVILEGES ON TABLE public.badges FROM ${role}`,
      );
    }
    expect(migration).toContain(
      "GRANT SELECT (id, code, name, description, category, type, rank, image_url)",
    );
    expect(migration).not.toMatch(/CREATE POLICY|FORCE ROW LEVEL SECURITY/);
    expect(migration).not.toMatch(/\bauth\.(?:uid|users)\b/);
    expect(migration).not.toMatch(
      /\b(?:SELECT[\s\S]*FROM|INSERT INTO|UPDATE|DELETE FROM)\s+public\.badges\b/i,
    );
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
  });
});
