import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { encode } from "@auth/core/jwt";
import { chromium } from "playwright";
const baseUrl = process.env.DASHBOARD_E2E_BASE_URL ?? "http://localhost:3000", storageState = process.env.DASHBOARD_E2E_STORAGE_STATE, secret = process.env.DASHBOARD_E2E_LOCAL_SECRET;
if (!storageState && !secret) throw new Error("Dashboard E2E auth is required");
if (storageState) await access(storageState);
const token = secret ? await encode({
  token: { id: "11111111-1111-4111-8111-111111111111", sub: "fixture-provider", provider: "fitbit", provider_account_id: "fixture-provider", username: "fixture-runner", name: "Fixture Runner", email: "fixture@example.invalid", language: "ja" },
  secret, salt: "authjs.session-token", maxAge: 3600,
}) : null;
const mission = { id: "mission-1", mission_type: "WALK_100", title: "100 steps", description: "Walk 100 steps", reward_uc: 5, is_completed: true, completed_at: "2026-07-24T00:00:00.000Z" };
const gear = { asin: "B000000001", title: "Lightweight walking shoes", image_url: "https://images.example.invalid/shoes.jpg", affiliate_link: "https://www.amazon.co.jp/dp/B000000001?tag=ucfitness-22", count: 2, users: [{ username: "walker-one", image: null, comment: "Easy to wear" }] };
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ name: "mobile", width: 375, height: 812 }, { name: "desktop", width: 1280, height: 900 }]) {
    const context = await browser.newContext({ storageState: storageState || undefined, viewport });
    if (token) await context.addCookies([{ name: "authjs.session-token", value: token, domain: new URL(baseUrl).hostname, path: "/" }]);
    const page = await context.newPage();
    const variant = viewport.name === "mobile" ? "B" : "A"; await page.addInitScript((value) => sessionStorage.setItem("ucfitness:affiliate-experiment:f008-c3-v1", JSON.stringify({ schema: 1, positionVariant: value, copyVariant: value })), variant);
    let postCount = 0, imageFailures = 0;
    const analyticsEvents = [];
    await page.route("**/api/user/missions", (route) => {
      if (route.request().method() === "POST" && ++postCount === 1) return route.fulfill({
        status: 503, contentType: "application/json",
        json: { error: "Reward unavailable", code: "MISSION_REWARD_DATABASE_ERROR" },
      });
      return route.fulfill({ contentType: "application/json", json: route.request().method() === "POST"
        ? { success: true, missions: [mission], allCompleted: true, streak: 1, newlyCompleted: 0, bonusAwarded: true, bonusUc: 100 }
        : { missions: postCount ? [mission] : [], date: "2026-07-24", allCompleted: postCount > 0, streak: postCount ? 1 : 0 } });
    });
    await page.route("**/api/amazon/trending", (route) => route.fulfill({ contentType: "application/json", json: { items: [gear] } }));
    await page.route("**/api/gear-reactions", (route) => route.fulfill({ contentType: "application/json", json: { reactions: [] } }));
    await page.route("**/api/user/login-bonus", (route) => route.fulfill({ contentType: "application/json", json: { claimed: true, alreadyClaimed: false, amount: 100, streak: 1 } }));
    await page.route("**/api/steps/sync", (route) => route.fulfill({ status: 503, json: { error: "Fixture unavailable" } }));
    await page.route("**/api/analytics/affiliate", (route) => { analyticsEvents.push(route.request().postDataJSON()); return route.fulfill({ json: { accepted: true } }); });
    await page.route("https://www.amazon.co.jp/**", (route) => route.fulfill({ contentType: "text/html", body: "fixture" }));
    await page.route(/https:\/\/(?:images\.example\.invalid|ws-fe\.amazon-adsystem\.com)\/.*/, (route) => { imageFailures += 1; return route.abort(); });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const close = page.getByRole("button", { name: /閉じる|Close/ }); await close.waitFor();
    const closeBox = await close.boundingBox(); assert.ok(closeBox.width + 0.01 >= 44 && closeBox.height + 0.01 >= 44);
    await close.click(); await close.waitFor({ state: "detached" });
    const missionPanel = page.locator(".home-mission-module");
    await missionPanel.getByRole("button", { name: /今日のミッションを準備|Prepare today's missions/ }).click();
    await missionPanel.getByText(/報酬を安全に反映できませんでした|reward could not be applied safely/).waitFor();
    await page.reload({ waitUntil: "commit", timeout: 60_000 });
    const retry = missionPanel.getByRole("button", { name: /ミッション再チェック|Refresh missions/ });
    await retry.click();
    await missionPanel.getByText(/獲得した全達成ボーナス|All-clear bonus earned/).waitFor();
    assert.equal(postCount, 2);
    assert.equal(await missionPanel.getByRole("alert").count(), 0);
    const gearPanel = page.locator(".trending-gear-module");
    const product = gearPanel.getByRole("link", { name: /Lightweight walking shoes/ });
    await product.waitFor();
    await product.locator("img[hidden]").waitFor({ state: "attached" });
    assert.equal(await product.locator("img").isHidden(), true);
    assert.equal(await gearPanel.getByText(/価格:|Price:|配送:|Delivery:/).count(), 0);
    assert.equal(await product.getAttribute("data-affiliate-position"), variant);
    assert.equal(await product.getByText(variant === "B" ? /Amazon.co.jpで商品を確認|Check this item on Amazon.co.jp/ : /Amazon.co.jpで詳しく見る|View details on Amazon.co.jp/).count(), 1);
    assert.equal(await product.locator(`span.order-${variant === "B" ? "first" : "last"}`).count(), 1);
    const clickRequest = page.waitForRequest((request) => request.url().includes("/api/analytics/affiliate") && request.postDataJSON().event === "click");
    await Promise.all([clickRequest, product.click()]);
    assert.deepEqual(analyticsEvents.find((event) => event.event === "click"), {
      schema: 1, event: "click", experiment: "f008_c3_v1",
      positionVariant: variant, copyVariant: variant, surface: "dashboard",
      targetType: "product", targetId: "B000000001",
    });
    assert.equal(imageFailures, 4);
    const controls = page.locator(".home-mission-module button,.trending-gear-module button,.trending-gear-module a[href]");
    for (const control of await controls.evaluateAll((elements) => elements.map((element) => ({ label: element.getAttribute("aria-label") ?? element.textContent?.trim(), box: element.getBoundingClientRect() })))) {
      assert.ok(control.box.width + 0.01 >= 44 && control.box.height + 0.01 >= 44, `${control.label}: ${control.box.width}x${control.box.height}`);
    }
    assert.equal(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth), 0);
    console.log(`OK: dashboard UX ${viewport.name}`);
    await context.close();
  }
} finally {
  await browser.close();
}
