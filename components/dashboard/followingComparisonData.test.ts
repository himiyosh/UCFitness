import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFollowingTrendData, getFollowingTrendValue, parseFollowingComparisonPayload } from "./FollowingTrendChart";
const sourcePath = fileURLToPath(new URL("./FollowingTrendChart.tsx", import.meta.url));
describe("followingComparisonData", () => {
    const dates = ["2026-07-18", "2026-07-19", "2026-07-20"];
    const rawUser = {
        userId: "viewer", name: "Viewer", image: null, username: "viewer",
        isMe: true, totalSteps: 120,
        dailySteps: [
            { date: dates[0], steps: 120, hasRecord: true }, { date: dates[1], steps: 0, hasRecord: true },
            { date: dates[2], steps: 0, hasRecord: false },
        ],
    };
    it("変換時に正歩数・記録済み0歩・未記録を数値・数値0・nullへ分離する", () => {
        const payload = parseFollowingComparisonPayload({ comparison: [rawUser], dates });
        expect(payload).not.toBeNull();
        const points = buildFollowingTrendData(payload?.users ?? [], dates);
        expect(points.map((point) => getFollowingTrendValue(point, "viewer"))).toEqual([120, 0, null]);
    });
    it("旧応答でhasRecordが欠落した場合、0歩と誤認せず未記録にする", () => {
        const payload = parseFollowingComparisonPayload({
            comparison: [{
                ...rawUser,
                dailySteps: [{ date: dates[2], steps: 0 }],
            }],
            dates: [dates[2]],
        });
        expect(payload?.users[0].dailySteps[0]).toEqual({ date: dates[2], steps: 0, hasRecord: false });
        expect(parseFollowingComparisonPayload({ comparison: [], period: "WEEKLY" })).toEqual({ users: [], dates: [] });
    });
    it("視覚チャートが欠測を結ばずtooltipとwrapper内数値表を共有する", () => {
        const source = readFileSync(sourcePath, "utf8");
        expect(source).toContain("connectNulls={false}");
        expect(source).toContain("filterNull={false}");
        expect(source).toContain('<div className="sr-only">');
        expect(source).not.toContain('<table className="sr-only">');
        expect(source).toContain("getFollowingTrendValue(point, user.userId)");
    });
});
