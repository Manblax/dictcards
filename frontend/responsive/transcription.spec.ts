import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: "token", value: "responsive-test", url: "http://127.0.0.1:3100" }]);
  await page.addInitScript(() => {
    localStorage.setItem("token", "responsive-test");
    localStorage.setItem("user", JSON.stringify({ id: "test", username: "responsive_tester", email: "responsive@example.com" }));
  });
});

test("transcription wraps beside audio controls in the list only", async ({ page }, info) => {
  let ipa = "/ˌkæri ˈɒn/";
  await page.route("**/dictionary/lookup?**", route => route.fulfill({ json: {
    word: "carry on", normalizedWord: "carry on", definitions: [],
    ipa: { uk: ipa, us: "/ˌkæri ˈɑːn/" }, audio: {}, cached: true,
  } }));
  for (const scenario of ["normal", "long"]) {
    if (scenario === "long") ipa = `/${"ˌkæriˈɒn".repeat(12)}/`;
    await page.goto("/module/responsive");
    const row = page.locator(".module-term-body").first();
    await row.scrollIntoViewIfNeeded();
    await expect(row.getByLabel("UK транскрипция", { exact: true })).toHaveText(ipa);
    await expect(row.getByLabel("US транскрипция", { exact: true })).toHaveText("/ˌkæri ˈɑːn/");
    for (const accent of ["UK", "US"]) {
      const button = row.getByRole("button", { name: `Воспроизвести ${accent} произношение: carry on`, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport({ ratio: 1 });
      await button.click({ trial: true });
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: info.outputPath(`list-transcription-${scenario}.png`) });
  }

  for (const path of ["/create", ...["edit", "card", "learn", "test", "write", "spell"].map(mode => `/module/responsive/${mode}`)]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator(".loading-spinner")).toHaveCount(0);
    await expect(page.getByLabel(/^(UK|US) транскрипция$/)).toHaveCount(0);
    await expect(page.getByText(ipa, { exact: true })).toHaveCount(0);
  }
});
