import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: "token", value: "responsive-test", url: "http://127.0.0.1:3100" }]);
  await page.addInitScript(() => {
    localStorage.setItem("token", "responsive-test");
    localStorage.setItem("user", JSON.stringify({ id: "test", username: "tester", email: "test@example.com" }));
  });
});

test("export is usable by keyboard on desktop and as a sheet on phones", async ({ page }, info) => {
  await page.goto("/module/responsive");
  const trigger = page.getByRole("button", { name: "Действия с модулем", exact: true });
  await trigger.click();
  const actions = page.getByRole("dialog", { name: "Действия с модулем", exact: true });
  await expect(actions).toBeVisible();
  await page.mouse.click(1, 1);
  await expect(actions).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  if (page.viewportSize()!.width < 640) {
    const box = (await actions.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(page.viewportSize()!.height);
  }
  await page.screenshot({ path: info.outputPath("module-actions.png") });
  await page.getByRole("menuitem", { name: "Редактировать", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Экспортировать", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Экспортировать", exact: true });
  await expect(dialog).toBeVisible();
  await expect(actions).not.toBeVisible();
  const preview = page.getByRole("textbox", { name: "Содержание модуля", exact: true });
  await expect(preview).toHaveAttribute("readonly", "");
  await expect(preview).toHaveValue(/^carry on\tA long definition/);
  await expect(page.getByRole("button", { name: "Закрыть экспорт", exact: true })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

  await preview.focus();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(preview).toBeFocused();
  await dialog.locator(".overflow-y-auto").evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: info.outputPath("module-export-dark.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light-classic"; });
  await page.screenshot({ path: info.outputPath("module-export-light.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Редактировать", exact: true }).click();
  await expect(page).toHaveURL(/\/module\/responsive\/edit$/);
});

test("long exports fit and clipboard failure offers a selected manual copy", async ({ page }) => {
  await page.goto("/module/stress");
  await page.getByRole("button", { name: "Действия с модулем", exact: true }).click();
  await page.getByRole("menuitem", { name: "Экспортировать", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } });
  });
  const copy = page.getByRole("button", { name: "Копировать текст", exact: true });
  await copy.click();
  await expect(page.getByRole("status")).toContainText("скопируйте его вручную");
  const preview = page.getByRole("textbox", { name: "Содержание модуля", exact: true });
  await expect(preview).toBeFocused();
  expect(await preview.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBe((await preview.inputValue()).length);
  const dialog = page.getByRole("dialog", { name: "Экспортировать", exact: true });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Закрыть экспорт", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
