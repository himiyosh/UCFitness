import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(process.cwd());
const migrationPath = resolve(root, "migrations/20260720_harden_user_badges_rls.sql");
const migration = readFileSync(migrationPath, "utf8");
const protectedMigrations = {
  "migrations/20260720_harden_api_keys_rls.sql": "5138a2695ed34f0fe8f17112e586a82ee089bc7b0f202d6770af990475391636",
  "migrations/20260720_harden_push_subscriptions_rls.sql": "5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66",
  "migrations/20260720_harden_coin_transactions_rls.sql": "32324ceae1333fefb67a0d8788facf23ea2fd435332e78c4ac103bbcabdf426f",
  "migrations/20260720_harden_coin_balances_rls.sql": "31c7de8805482777c21b2b5f48b9a99d5325528505df9cbe1f2664a56e8750c0",
  "migrations/20260718_add_streak_milestone_rewards.sql": "32d33a968327ce45d19f47377e7c69c4c727069dba447d36deb47d8fba16bf3f",
} as const;
function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === "__tests__" ? [] : collectTypeScriptFiles(path);
    }
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}
function userBadgeReferences(): Array<{ file: string; segment: string }> {
  return ["app", "lib", "scripts"].flatMap((directory) =>
    collectTypeScriptFiles(resolve(root, directory)).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [...source.matchAll(/\.from\(["']user_badges["']\)/g)].map(
        (match) => ({
          file: relative(root, path),
          segment: source.slice(match.index, match.index + 700),
        }),
      );
    }),
  );
}
describe("user_badges RLS hardening migration", () => {
  it("keeps Phase 1-4 and the atomic award migration immutable", () => {
    for (const [path, expectedHash] of Object.entries(protectedMigrations)) {
      const actualHash = createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex");
      expect(actualHash, path).toBe(expectedHash);
    }
  });
  it("locks the fail-closed schema contract without reading badge rows", () => {
    const schemaEvidence = [
      "LOCK TABLE public.user_badges IN ACCESS EXCLUSIVE MODE", "relkind = 'r'",
      "'badge_code:text:t:f:'", "'awarded_at:timezone(''utc''::text, now())'",
      "confrelid = users_table", "confrelid = badges_table",
      "confrelid = groups_table", "confdeltype = 'c'", "unexpected owned sequence",
    ];
    expect(migration).toMatch(/^BEGIN;/);
    schemaEvidence.forEach((evidence) => expect(migration).toContain(evidence));
    expect(migration).not.toMatch(/\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?user_badges\b/i);
  });
  it("matches every direct service-role CRUD path including PostgREST upsert", () => {
    const references = userBadgeReferences();
    const operation = (segment: string): string | undefined =>
      segment.match(/^\s*\.from\(["']user_badges["']\)\s*\.(\w+)/)?.[1];
    const selects = references.filter(({ segment }) => operation(segment) === "select");
    const inserts = references.filter(({ segment }) => operation(segment) === "insert");
    const upserts = references.filter(({ segment }) => operation(segment) === "upsert");
    const mutations = references.filter(({ segment }) =>
      /\.(?:update|delete)\(/.test(segment),
    );
    expect(references).toHaveLength(8);
    expect(selects).toHaveLength(5);
    expect(inserts).toHaveLength(2);
    expect(upserts).toHaveLength(1);
    expect(mutations).toHaveLength(0);
    expect(upserts[0]?.file).toBe("scripts/award_test_badges.ts");
    expect(upserts[0]?.segment).toMatch(/onConflict:\s*["']user_id,\s*badge_code,\s*period_date["']/);
    expect(migration).toMatch(
      /GRANT SELECT \(id, user_id, badge_code, awarded_at, period_date, group_id,\s+created_at\)/,
    );
    ["GRANT INSERT (user_id, badge_code, awarded_at, period_date, group_id)",
      "GRANT UPDATE (user_id, badge_code, period_date)"]
      .forEach((grant) => expect(migration).toContain(grant));
    expect(migration).not.toContain("GRANT DELETE");
    expect(migration).not.toContain("GRANT ALL");
  });
  it("enables policy-free RLS and removes broad role access", () => {
    [
      "ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY",
      "REVOKE ALL PRIVILEGES ON TABLE",
      "FROM PUBLIC, anon, authenticated, service_role",
      "unexpected table privilege", "unexpected ACL grantee",
    ].forEach((evidence) => expect(migration).toContain(evidence));
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    expect(migration).not.toMatch(/FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(migration).not.toContain("auth.uid()");
    expect(migration).not.toContain("auth.users");
  });
  it("requires the existing atomic RPC to remain a safe owner-executed boundary", () => {
    [
      "to_regprocedure('public.award_streak_milestones(date)')",
      "proc.proowner = owner_oid", "proc.prosecdef", "role.rolbypassrls",
      "proc.proconfig = ARRAY['search_path=\"\"']",
      "'service_role', proc.oid, 'EXECUTE'",
      "'authenticated', proc.oid, 'EXECUTE'",
    ].forEach((evidence) => expect(migration).toContain(evidence));
    expect(migration).not.toMatch(/ALTER\s+FUNCTION\s+public\.award_streak_milestones/i);
  });
  it("anchors Phase 5 progress without changing F001 or F016 status", () => {
    const features = JSON.parse(readFileSync(resolve(root, ".github/ucfitness-features.json"), "utf8")) as { features: Array<{ id: string; status: string }> };
    expect(features.features.filter(({ id }) => ["F001", "F016"].includes(id)).map(({ id, status }) => [id, status])).toEqual([["F001", "not-started"], ["F016", "in-progress"]]);
    const progress = JSON.parse(readFileSync(resolve(root, ".github/ucfitness-progress.json"), "utf8")) as { sessionLog: Array<{ date: string; action: string; commit: string }> };
    const phase = progress.sessionLog.find(({ date, action }) => date === "2026-07-20" && action.includes("Phase 5") && action.includes("user_badges"));
    expect(phase?.commit).toBe("83b6ae4ae038b248a2549b3966048aba8dfc2fac");
  });
});
