import { expect, test } from "@playwright/test";

const authUser = {
  id: "user-1",
  username: "demo",
  email: "demo@example.com",
};

test.describe("auth flows", () => {
  test.use({ extraHTTPHeaders: { "X-Real-IP": "77.88.8.8" } });

  test("logs in with mocked backend response and persists the session", async ({
    page,
  }) => {
    await page.route("http://localhost:3001/auth/login", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        username: "demo@example.com",
        password: "password123",
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          access_token: "login-token",
          user: authUser,
        }),
      });
    });

    await page.goto("/login");
    await page
      .getByLabel("Эл. почта или имя пользователя")
      .pressSequentially("demo@example.com");
    await page.locator("#login-password").pressSequentially("password123");
    await page.getByRole("button", { name: "Войти" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Недавние" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("token")))
      .toBe("login-token");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("user")))
      .toContain('"username":"demo"');
  });

  test("shows login validation returned by the backend", async ({ page }) => {
    await page.route("http://localhost:3001/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ message: "Invalid credentials" }),
      });
    });

    await page.goto("/login");
    await page
      .getByLabel("Эл. почта или имя пользователя")
      .pressSequentially("wrong@example.com");
    await page.locator("#login-password").pressSequentially("bad-password");
    await page.getByRole("button", { name: "Войти" }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText:
          "Неверный email, имя пользователя или пароль. Проверьте данные и попробуйте снова.",
      }),
    ).toBeVisible();
  });

  test("registers with mocked backend response and persists the session", async ({
    page,
  }) => {
    await page.route("http://localhost:3001/auth/register", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        email: "demo@example.com",
        username: "demo",
        password: "password123",
      });

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          access_token: "register-token",
          user: authUser,
        }),
      });
    });

    await page.goto("/register");
    await page.getByLabel("Эл. почта").pressSequentially("demo@example.com");
    await page.getByLabel("Имя пользователя").pressSequentially("demo");
    await page.locator("#register-password").pressSequentially("password123");
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Недавние" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("token")))
      .toBe("register-token");
  });

  test("shows duplicate-user registration errors", async ({ page }) => {
    await page.route("http://localhost:3001/auth/register", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          message: "User with this email or username already exists",
        }),
      });
    });

    await page.goto("/register");
    await page.getByLabel("Эл. почта").pressSequentially("demo@example.com");
    await page.getByLabel("Имя пользователя").pressSequentially("demo");
    await page.locator("#register-password").pressSequentially("password123");
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Пользователь с такой почтой или именем уже существует.",
      }),
    ).toBeVisible();
  });

  test("persists Google callback credentials and returns home", async ({
    page,
  }) => {
    await page.goto(
      "/auth/callback?access_token=google-token&id=user-1&username=demo&email=demo%40example.com",
    );

    await expect(page).toHaveURL("/");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("token")))
      .toBe("google-token");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("user")))
      .toContain('"email":"demo@example.com"');
  });

  test("persists Yandex fragment credentials and removes them from history", async ({ page, context }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto("/auth/callback?provider=yandex#access_token=yandex-token&id=user-1&username=demo&email=demo%40example.com");
    await expect(page).toHaveURL("/");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("token"))).toBe("yandex-token");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("user") || "null"))).toEqual(authUser);
    expect((await context.cookies()).find((cookie) => cookie.name === "token")?.value).toBe("yandex-token");
    expect(requests.some((url) => url.includes("yandex-token"))).toBe(false);
  });

  test("rejects incomplete Yandex fragments and query credentials", async ({ page }) => {
    for (const url of [
      "/auth/callback?provider=yandex#access_token=incomplete",
      "/auth/callback?provider=yandex&access_token=query-token&id=user-1&username=demo&email=demo%40example.com",
    ]) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/login\?error=yandex_auth_invalid_response$/);
      await expect(page.getByText("Не удалось войти через Яндекс. Попробуйте еще раз.")).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
    }
  });

  test("explains a missing Yandex configuration", async ({ page }) => {
    await page.goto("/login?error=yandex_not_configured");
    await expect(page.getByText("Вход через Яндекс пока не настроен. Используйте другой способ входа.")).toBeVisible();
  });

  test("redirects invalid Google callbacks to the login error state", async ({
    page,
  }) => {
    await page.goto("/auth/callback?access_token=missing-profile");

    await expect(page).toHaveURL(/\/login\?error=google_auth_invalid_response$/);
    await expect(
      page.getByText("Не удалось войти через Google. Попробуйте еще раз."),
    ).toBeVisible();
  });
});
