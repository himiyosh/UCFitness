import { expect, test } from "playwright/test";

import type { BrowserContext, Page } from "playwright/test";

interface ViewportCase {
  name: string;
  width: number;
  height: number;
}

type StatusMode = "pending" | "success" | "failure";

interface Deferred {
  promise: Promise<void>;
  release: () => void;
}

interface SetupTestState {
  consoleErrors: string[];
  externalRequests: string[];
  pageErrors: string[];
  sessionGate: Deferred;
  sessionRequests: number;
  setupPosts: unknown[];
  statusGate: Deferred;
  statusMode: StatusMode;
  statusRequests: number;
  unexpectedApiRequests: string[];
}

const BASE_ORIGIN = "http://localhost:3000";
const FIXTURE_USER_ID = "11111111-1111-4111-8111-111111111111";
const VIEWPORTS: readonly ViewportCase[] = [
  { name: "320px", width: 320, height: 720 },
  { name: "375px", width: 375, height: 812 },
  { name: "1280px", width: 1280, height: 900 },
];
const SESSION = {
  user: {
    id: FIXTURE_USER_ID,
    name: "Fixture Walker",
    email: "fixture@example.invalid",
    image: null,
    username: null,
  },
  expires: "2099-01-01T00:00:00.000Z",
};
const STATUS_RESPONSE = {
  isSetup: false,
  username: null,
  provider: "fitbit",
  step_goal: 5_000,
  is_custom_image: false,
};
const RAW_STATUS_FAILURE = {
  error: "raw-status-message",
  name: "RawStatusError",
  stack: "raw-status-stack",
  cause: { accountId: FIXTURE_USER_ID },
  code: "RAW_STATUS_CODE",
  nested: { secret: "raw-nested-value" },
  context: { userId: FIXTURE_USER_ID },
};

function createDeferred(): Deferred {
  let release = (): void => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function createState(statusMode: StatusMode): SetupTestState {
  return {
    consoleErrors: [],
    externalRequests: [],
    pageErrors: [],
    sessionGate: createDeferred(),
    sessionRequests: 0,
    setupPosts: [],
    statusGate: createDeferred(),
    statusMode,
    statusRequests: 0,
    unexpectedApiRequests: [],
  };
}

async function installRoutes(
  context: BrowserContext,
  state: SetupTestState,
  delayInitialSession: boolean,
): Promise<void> {
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === BASE_ORIGIN) {
      await route.fallback();
      return;
    }
    state.externalRequests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  await context.route("**/api/**", async (route) => {
    state.unexpectedApiRequests.push(
      `${route.request().method()} ${route.request().url()}`,
    );
    await route.abort("blockedbyclient");
  });
  await context.route("**/api/auth/session**", async (route) => {
    state.sessionRequests += 1;
    if (delayInitialSession && state.sessionRequests === 1) {
      await state.sessionGate.promise;
    }
    await route.fulfill({ contentType: "application/json", json: SESSION });
  });
  await context.route("**/api/auth/csrf**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { csrfToken: "fixture-csrf-token" },
    });
  });
  await context.route("**/api/user/status", async (route) => {
    state.statusRequests += 1;
    if (state.statusMode === "pending") {
      await state.statusGate.promise;
    }
    const response = state.statusMode === "failure"
      ? { status: 503, json: RAW_STATUS_FAILURE }
      : { status: 200, json: STATUS_RESPONSE };
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      json: response.json,
    }).catch(() => undefined);
  });
  await context.route("**/api/user/setup", async (route) => {
    state.setupPosts.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      json: { success: true, merged: false },
    });
  });
}

function captureBrowserErrors(page: Page, state: SetupTestState): void {
  page.on("console", (message) => {
    if (
      message.type() === "error"
      && !message.text().startsWith("Failed to load resource:")
    ) {
      state.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => state.pageErrors.push(error.message));
}

async function expectSingleMain(page: Page, description: string): Promise<void> {
  await expect(page.locator("main"), description).toHaveCount(1);
  await expect(page.getByRole("main"), description).toHaveCount(1);
}

async function expectResponsiveControls(page: Page): Promise<void> {
  const skipLink = page.getByRole("link", {
    name: /Skip to content|メインコンテンツへ/,
  });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  const skipBox = await skipLink.boundingBox();
  expect(skipBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(skipBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await skipLink.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  const metrics = await page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.display !== "none"
        && style.visibility !== "hidden"
        && !element.matches(".sr-only:not(:focus)");
    };
    const undersizedControls = Array.from(document.querySelectorAll(
      'a[href],button,input:not([type="hidden"]),select,textarea,summary',
    )).filter(visible).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
        width: rect.width,
        height: rect.height,
      };
    }).filter(({ width, height }) => width + 0.01 < 44 || height + 0.01 < 44);

    return {
      horizontalOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
        - document.documentElement.clientWidth,
      undersizedControls,
    };
  });

  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(metrics.undersizedControls).toEqual([]);
}

function expectPrivateStatusSink(consoleErrors: readonly string[]): void {
  const prefix = "[ERROR] setup:status: ";
  const setupReports = consoleErrors.filter((message) => message.startsWith(prefix));
  expect(setupReports.length).toBeGreaterThan(0);
  expect(setupReports).toHaveLength(consoleErrors.length);

  for (const report of setupReports) {
    const serializedEntry = report.slice(prefix.length);
    const entry: unknown = JSON.parse(serializedEntry);
    expect(entry).toEqual({
      timestamp: expect.any(String),
      operation: "setup:status",
      error: { message: "Setup status unavailable" },
    });
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Setup report must be a JSON object");
    }
    expect(Object.keys(entry).sort()).toEqual(["error", "operation", "timestamp"]);

    for (const forbiddenValue of [
      FIXTURE_USER_ID,
      "fixture-provider",
      "raw-status-message",
      "RawStatusError",
      "raw-status-stack",
      "RAW_STATUS_CODE",
      "raw-nested-value",
      "Failed to load setup status",
      '"name"',
      '"stack"',
      '"cause"',
      '"code"',
      '"nested"',
      '"context"',
    ]) {
      expect(serializedEntry).not.toContain(forbiddenValue);
    }
  }
}

async function completeSetup(page: Page): Promise<void> {
  await page.getByLabel(/User ID|ユーザー\s*ID/).fill("fixture-walker");
  await page.getByLabel(/Display Name|表示名/).fill("Fixture Walker");
  await page.getByRole("button", { name: /^(Continue|次へ進む)$/ }).click();
  await page.getByLabel(/Daily step goal|1日の歩数目標/).fill("5000");
  await page.getByRole("button", { name: /^(Continue|次へ進む)$/ }).click();
  await page.getByRole("button", {
    name: /Choose a community later and finish setup|コミュニティはあとで・セットアップ完了/,
  }).click();
}

test.describe("Setup recovery", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}_通常遷移で全状態にmainが1つあり安全に完了する`, async ({
      context,
      page,
    }) => {
      await page.setViewportSize(viewport);
      const state = createState("pending");
      await installRoutes(context, state, true);
      captureBrowserErrors(page, state);

      await page.goto("/setup", { waitUntil: "domcontentloaded" });
      await expectSingleMain(page, "session loading state");
      await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");

      state.sessionGate.release();
      await expect(page.getByText(
        /Checking your connection and goal|接続状態と目標を確認中/,
      )).toHaveCount(1);
      await expectSingleMain(page, "status loading state");

      state.statusMode = "success";
      state.statusGate.release();
      await expect(page.getByLabel(/User ID|ユーザー\s*ID/)).toBeEditable();
      await expect(page.getByRole("button", {
        name: /^(Continue|次へ進む)$/,
      })).toBeEnabled();
      await expectSingleMain(page, "active setup state");
      await expectResponsiveControls(page);

      await completeSetup(page);
      await expect(page.getByRole("heading", {
        level: 1,
        name: /You're ready to start walking|歩き始める準備ができました/,
      })).toBeFocused();
      await expectSingleMain(page, "completed setup state");
      await expectResponsiveControls(page);

      expect(state.setupPosts).toEqual([{
        username: "fixture-walker",
        name: "Fixture Walker",
        step_goal: 5_000,
      }]);
      expect(state.consoleErrors).toEqual([]);
      expect(state.pageErrors).toEqual([]);
      expect(state.externalRequests).toEqual([]);
      expect(state.unexpectedApiRequests).toEqual([]);
    });

    test(`${viewport.name}_状態取得失敗を安全に通知して再試行で復旧する`, async ({
      context,
      page,
    }) => {
      await page.setViewportSize(viewport);
      const state = createState("failure");
      await installRoutes(context, state, false);
      captureBrowserErrors(page, state);

      await page.goto("/setup", { waitUntil: "domcontentloaded" });
      const retryButton = page.getByRole("button", {
        name: /Reload status|状態を再取得/,
      });
      await expect(retryButton).toBeEnabled();
      const setupAlert = page.getByRole("main").getByRole("alert");
      await expect(setupAlert).toContainText(
        /couldn't load the connection status|接続状態と歩数目標を読み込めませんでした/,
      );
      await expectSingleMain(page, "retryable error state");
      await expectResponsiveControls(page);
      expectPrivateStatusSink(state.consoleErrors);

      state.statusMode = "success";
      await retryButton.click();
      await expect(setupAlert).toHaveCount(0);
      await expect(page.getByLabel(/User ID|ユーザー\s*ID/)).toBeEditable();
      await expectSingleMain(page, "recovered setup state");
      await expectResponsiveControls(page);

      expect(state.statusRequests).toBeGreaterThanOrEqual(2);
      expect(state.pageErrors).toEqual([]);
      expect(state.externalRequests).toEqual([]);
      expect(state.unexpectedApiRequests).toEqual([]);
    });
  }
});
