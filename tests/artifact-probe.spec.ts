import { expect, test } from "playwright/test";

test("artifact upload probe_一時的な失敗成果物を生成する", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/ja");
  await expect(page.getByRole("main")).toHaveCount(1);
  expect("artifact-probe").toBe("forced-failure");
});
