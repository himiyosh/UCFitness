import { test, expect } from "playwright/test";

import type { Locator, Page } from "playwright/test";

interface PublicLocaleCase {
  locale: "ja" | "en";
  viewport: { width: number; height: number };
  oppositeLocale: "ja" | "en";
  switchAwayLabel: string;
  switchToLabel: string;
  skipLabel: string;
  loginLabel: string;
  connectFitbitCopy: string;
  landingTitle: string;
  termsLabel: string;
  privacyLabel: string;
  privacyLinkLabel: string;
  homeLabel: string;
}

const PUBLIC_LOCALE_CASES: readonly PublicLocaleCase[] = [
  {
    locale: "ja",
    viewport: { width: 320, height: 800 },
    oppositeLocale: "en",
    switchAwayLabel: "Switch to English",
    switchToLabel: "日本語に切り替え",
    skipLabel: "メインコンテンツへ",
    loginLabel: "Fitbit でログイン",
    connectFitbitCopy: "30秒で連携。歩数は自動で反映されます。",
    landingTitle: "歩く、競う、続く。歩数を習慣に変える。",
    termsLabel: "利用規約",
    privacyLabel: "プライバシーポリシー",
    privacyLinkLabel: "プライバシー",
    homeLabel: "ホームへ戻る",
  },
  {
    locale: "en",
    viewport: { width: 1280, height: 800 },
    oppositeLocale: "ja",
    switchAwayLabel: "日本語に切り替え",
    switchToLabel: "Switch to English",
    skipLabel: "Skip to content",
    loginLabel: "Sign in with Fitbit",
    connectFitbitCopy: "Connect in about 30 seconds. Steps sync automatically.",
    landingTitle: "Walk, Compete, Persist.Turn steps into a habit.",
    termsLabel: "Terms of Service",
    privacyLabel: "Privacy Policy",
    privacyLinkLabel: "Privacy Policy",
    homeLabel: "Back to home",
  },
];

const ACTIVATION_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
] as const;

async function switchToLocale(page: Page, localeCase: PublicLocaleCase): Promise<void> {
  const html = page.locator("html");
  const currentLocale = await html.getAttribute("lang");

  if (currentLocale === localeCase.locale) {
    await page.getByRole("button", { name: localeCase.switchAwayLabel, exact: true }).click();
    await expect(html).toHaveAttribute("lang", localeCase.oppositeLocale);
    await expect(
      page.getByRole("button", { name: localeCase.switchToLabel, exact: true }),
    ).toBeFocused();
  }

  await page.getByRole("button", { name: localeCase.switchToLabel, exact: true }).click();
  await expect(html).toHaveAttribute("lang", localeCase.locale);
  await expect(
    page.getByRole("button", { name: localeCase.switchAwayLabel, exact: true }),
  ).toBeFocused();
}

async function expectPublicShell(page: Page, title: string): Promise<void> {
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  await expect(page.locator("header + main + footer")).toHaveCount(1);

  const pageHeading = page.getByRole("heading", { level: 1 });
  await expect(pageHeading).toHaveCount(1);
  await expect(pageHeading).toHaveText(title);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function getVisibleBox(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Visible element did not expose layout geometry");
  }
  return box;
}

interface VisualTreatment {
  backgroundAlpha: number;
  fontWeight: number;
  hasShadow: boolean;
}

async function getVisualTreatment(locator: Locator): Promise<VisualTreatment> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const colorParts = style.backgroundColor
      .match(/rgba?\(([^)]+)\)/)?.[1]
      .split(/[\s,/]+/)
      .filter(Boolean);
    const alphaToken = colorParts?.[3];
    const backgroundAlpha = alphaToken
      ? Number.parseFloat(alphaToken) / (alphaToken.endsWith("%") ? 100 : 1)
      : style.backgroundColor === "transparent"
        ? 0
        : 1;

    return {
      backgroundAlpha,
      fontWeight: Number.parseInt(style.fontWeight, 10),
      hasShadow: style.boxShadow !== "none",
    };
  });
}

test.describe("公開主要導線", () => {
  for (const localeCase of PUBLIC_LOCALE_CASES) {
    test(`${localeCase.locale}_LPから法務ページへ迷わず移動できる`, async ({ page }) => {
      await page.setViewportSize(localeCase.viewport);

      await test.step("公開LPを対象言語で開く", async () => {
        await page.goto("/");
        await switchToLocale(page, localeCase);
        await expectPublicShell(page, localeCase.landingTitle);
        await expect(
          page.getByRole("button", { name: localeCase.loginLabel, exact: true }).first(),
        ).toBeVisible();
      });

      await test.step("スキップリンクでmainへ移動する", async () => {
        const skipLink = page.getByRole("link", { name: localeCase.skipLabel, exact: true });
        await skipLink.focus();
        await expect(skipLink).toBeFocused();
        await skipLink.press("Enter");
        await expect(page.getByRole("main")).toBeFocused();
      });

      await test.step("フッターから利用規約へ移動する", async () => {
        await page
          .getByRole("contentinfo")
          .getByRole("link", { name: localeCase.termsLabel, exact: true })
          .click();
        await expect(page).toHaveURL(/\/legal\/terms$/);
        await expectPublicShell(page, localeCase.termsLabel);
        await expect(
          page.getByRole("banner").getByRole("link", {
            name: localeCase.homeLabel,
            exact: true,
          }),
        ).toBeVisible();
      });

      await test.step("利用規約からプライバシーポリシーへ移動する", async () => {
        await page
          .getByRole("contentinfo")
          .getByRole("link", { name: localeCase.privacyLinkLabel, exact: true })
          .click();
        await expect(page).toHaveURL(/\/legal\/privacy$/);
        await expectPublicShell(page, localeCase.privacyLabel);
      });

      await test.step("ブランドリンクで公開LPへ戻る", async () => {
        await page
          .getByRole("banner")
          .getByRole("link", { name: "UCFitness", exact: true })
          .click();
        await expect(page).toHaveURL("/");
        await expectPublicShell(page, localeCase.landingTitle);
      });
    });
  }
});

test.describe("Fitbit連携前のプライバシー導線", () => {
  for (const localeCase of PUBLIC_LOCALE_CASES) {
    for (const viewport of ACTIVATION_VIEWPORTS) {
      test(`${localeCase.locale}_${viewport.width}px_CTA直後からプライバシーポリシーを確認できる`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await switchToLocale(page, localeCase);
        await expectPublicShell(page, localeCase.landingTitle);

        const hero = page.locator('section[aria-labelledby="landing-headline"]');
        const loginButton = hero.getByRole("button", {
          name: localeCase.loginLabel,
          exact: true,
        });
        const connectionCopy = hero.getByText(localeCase.connectFitbitCopy, {
          exact: true,
        });
        const privacyLink = hero.getByRole("link", {
          name: localeCase.privacyLinkLabel,
          exact: true,
        });

        await expect(privacyLink).toHaveText(localeCase.privacyLinkLabel);
        const [loginBox, copyBox, privacyBox, loginTreatment, privacyTreatment] = await Promise.all([
          getVisibleBox(loginButton),
          getVisibleBox(connectionCopy),
          getVisibleBox(privacyLink),
          getVisualTreatment(loginButton),
          getVisualTreatment(privacyLink),
        ]);

        expect(privacyBox.width).toBeGreaterThanOrEqual(44);
        expect(privacyBox.height).toBeGreaterThanOrEqual(44);
        expect(copyBox.y + copyBox.height).toBeLessThanOrEqual(privacyBox.y);
        if (viewport.width < 640) {
          expect(loginBox.y + loginBox.height).toBeLessThanOrEqual(copyBox.y);
        } else {
          const supportingContentLeft = Math.min(copyBox.x, privacyBox.x);
          expect(loginBox.x + loginBox.width).toBeLessThanOrEqual(supportingContentLeft);
        }
        expect(privacyBox.y).toBeGreaterThanOrEqual(0);
        expect(privacyBox.y + privacyBox.height).toBeLessThanOrEqual(viewport.height);
        expect(loginTreatment.backgroundAlpha).toBeGreaterThan(0);
        expect(privacyTreatment.backgroundAlpha).toBe(0);
        expect(loginTreatment.fontWeight).toBeGreaterThan(privacyTreatment.fontWeight);
        expect(loginBox.width * loginBox.height).toBeGreaterThan(privacyBox.width * privacyBox.height);
        expect(loginTreatment.hasShadow).toBe(true);
        expect(privacyTreatment.hasShadow).toBe(false);
        await expect
          .poll(async () => privacyLink.evaluate((element) => getComputedStyle(element).whiteSpace))
          .toBe("nowrap");

        await loginButton.focus();
        await expect(loginButton).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(privacyLink).toBeFocused();
        await expect
          .poll(async () => privacyLink.evaluate((element) => getComputedStyle(element).boxShadow))
          .not.toBe("none");

        await privacyLink.press("Enter");
        await expect(page).toHaveURL(/\/legal\/privacy$/);
        await expect(page.locator("html")).toHaveAttribute("lang", localeCase.locale);
        await expectPublicShell(page, localeCase.privacyLabel);
      });
    }
  }
});
