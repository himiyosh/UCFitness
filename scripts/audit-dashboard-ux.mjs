import assert from "node:assert/strict";
import { access } from "node:fs/promises";

import { encode } from "@auth/core/jwt";
import { chromium } from "playwright";

const baseUrl = process.env.DASHBOARD_E2E_BASE_URL ?? "http://localhost:3000";
const storageState = process.env.DASHBOARD_E2E_STORAGE_STATE;
const localSecret = process.env.DASHBOARD_E2E_LOCAL_SECRET;
if (!storageState && !localSecret) {
  throw new Error("DASHBOARD_E2E_STORAGE_STATE or DASHBOARD_E2E_LOCAL_SECRET is required");
}
if (storageState) await access(storageState);

const localToken = localSecret ? await encode({
  token: {
    id: "11111111-1111-4111-8111-111111111111",
    sub: "fixture-provider",
    provider: "fitbit",
    provider_account_id: "fixture-provider",
    username: "fixture-runner",
    name: "Fixture Runner",
    email: "fixture@example.invalid",
    language: "ja",
  },
  secret: localSecret,
  salt: "authjs.session-token",
  maxAge: 3600,
}) : null;
const mission = {
  id: "mission-1",
  mission_type: "WALK_100",
  title: "100 steps",
  description: "Walk 100 steps",
  reward_uc: 5,
  is_completed: false,
  completed_at: null,
};
const gear = {
  asin: "B000000001",
  title: "Lightweight walking shoes",
  image_url: "https://images.example.invalid/shoes.jpg",
  affiliate_link: "https://www.amazon.co.jp/dp/B000000001?tag=ucfitness-22",
  count: 2,
  users: [{ username: "walker-one", image: null, comment: "Easy to wear" }],
};

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { name: "mobile", width: 375, height: 812 },
    { name: "desktop", width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({
      storageState: storageState || undefined,
      viewport: { width: viewport.width, height: viewport.height },
    });
    if (localToken) {
      await context.addCookies([{
        name: "authjs.session-token",
        value: localToken,
        domain: new URL(baseUrl).hostname,
        path: "/",
      }]);
    }
    const page = await context.newPage();
    let prepared = false;
    let failedGearImages = 0;
    await page.route("**/api/user/missions", (route) => route.fulfill({
      contentType: "application/json",
      json: route.request().method() === "POST"
        ? (prepared = true, {
          success: true, missions: [mission], allCompleted: false, streak: 0,
          streakUnavailable: false, newlyCompleted: 0, bonusAwarded: false,
        })
        : {
          missions: prepared ? [mission] : [], date: "2026-07-24",
          allCompleted: false, streak: 0, streakUnavailable: false,
        },
    }));
    await page.route("**/api/amazon/trending", (route) => route.fulfill({
      contentType: "application/json",
      json: { items: [gear] },
    }));
    await page.route("**/api/gear-reactions", (route) => route.fulfill({
      contentType: "application/json",
      json: { reactions: [] },
    }));
    await page.route(
      /https:\/\/(?:images\.example\.invalid|ws-fe\.amazon-adsystem\.com)\/.*/,
      (route) => {
        failedGearImages += 1;
        return route.abort();
      },
    );

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const prepare = page.getByRole("button", {
      name: /今日のミッションを準備|Prepare today's missions/,
    });
    await prepare.waitFor({ state: "visible", timeout: 30_000 });
    await prepare.click();
    await page.locator(".home-mission-row").waitFor({ state: "visible" });
    const gearPanel = page.locator(".trending-gear-module");
    await gearPanel.waitFor({ state: "visible" });
    await page.waitForTimeout(500);

    assert.equal(await page.locator(".home-mission-row").count(), 1);
    assert.equal(await gearPanel.getByText(/価格:|Price:|配送:|Delivery:/).count(), 0);
    assert.equal(failedGearImages <= 2, true, "Gear image fallback loop detected");
    const metrics = await page.evaluate(() => ({
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
        - document.documentElement.clientWidth,
      undersized: Array.from(document.querySelectorAll(
        ".home-mission-module button,.trending-gear-module button,.trending-gear-module a[href]",
      )).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      }).length,
    }));
    assert.deepEqual(metrics, { overflow: 0, undersized: 0 });
    console.log(`OK: dashboard UX ${viewport.name}`);
    await context.close();
  }
} finally {
  await browser.close();
}
