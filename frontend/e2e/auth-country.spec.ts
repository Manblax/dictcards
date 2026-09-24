import { expect, test } from "@playwright/test";

for (const [ip, visible] of [
  ["77.88.8.8", false],
  ["2a02:6b8::feed:0ff", false],
  ["::ffff:77.88.8.8", false],
  ["8.8.8.8", true],
  ["2001:4860:4860::8888", true],
  ["invalid", true],
] as const) {
  test(`Google visibility for ${ip} is ${visible}`, async ({ page }) => {
    // Emulate the trusted proxy on the directly accessed test server.
    await page.setExtraHTTPHeaders({ "X-Real-IP": ip });
    for (const path of ["/login", "/register"]) {
      const response = await page.goto(path);
      const html = await response!.text();
      expect(/<a[^>]*href="http:\/\/localhost:3001\/auth\/google"/.test(html)).toBe(visible);
      expect(/<a[^>]*href="http:\/\/localhost:3001\/auth\/yandex"/.test(html)).toBe(!visible);
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('a[href$="/auth/google"]')).toHaveCount(visible ? 1 : 0);
      await expect(page.locator('a[href$="/auth/yandex"]')).toHaveCount(visible ? 0 : 1);
      if (!visible) {
        await expect(page.getByRole("link", { name: path === "/login" ? "Войти через Яндекс" : "Продолжить через Яндекс" })).toBeVisible();
      }
    }
    await page.getByRole("main").getByRole("link", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await expect(page.locator('a[href$="/auth/google"]')).toHaveCount(visible ? 1 : 0);
    await expect(page.locator('a[href$="/auth/yandex"]')).toHaveCount(visible ? 0 : 1);
    await page.getByRole("main").getByRole("link", { name: "Зарегистрироваться", exact: true }).click();
    await expect(page).toHaveURL("/register");
    await expect(page.locator('a[href$="/auth/google"]')).toHaveCount(visible ? 1 : 0);
    await expect(page.locator('a[href$="/auth/yandex"]')).toHaveCount(visible ? 0 : 1);
  });
}

test("language and untrusted country headers do not hide Google", async ({ page }) => {
  await page.setExtraHTTPHeaders({
    "Accept-Language": "ru-RU", "CF-IPCountry": "RU", "X-Forwarded-For": "77.88.8.8",
  });
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Войти через Google" })).toBeVisible();
  await expect(page.locator('a[href$="/auth/yandex"]')).toHaveCount(0);
});
