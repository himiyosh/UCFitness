import { test, expect } from "playwright/test";

import type { Page } from "playwright/test";

interface PublicLocaleCase {
  locale: "ja" | "en";
  viewport: { width: number; height: number };
  oppositeLocale: "ja" | "en";
  switchAwayLabel: string;
  switchToLabel: string;
  skipLabel: string;
  loginLabel: string;
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
    landingTitle: "Walk, Compete, Persist.Turn steps into a habit.",
    termsLabel: "Terms of Service",
    privacyLabel: "Privacy Policy",
    privacyLinkLabel: "Privacy Policy",
    homeLabel: "Back to home",
  },
];

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
