import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "./auth-error";

describe("auth error messages", () => {
  it.each(["oauth", "google_auth_failed", "google_auth_invalid_response"])("preserves Google message for %s", (code) => {
    expect(getAuthErrorMessage(code)).toBe("Не удалось войти через Google. Попробуйте еще раз.");
  });
  it.each([
    ["yandex_not_configured", "пока не настроен"],
    ["yandex_access_denied", "отменён"],
    ["yandex_email_missing", "не предоставил адрес"],
    ["yandex_account_conflict", "другим аккаунтом"],
    ["yandex_state_invalid", "Начните вход заново"],
    ["yandex_auth_failed", "Не удалось войти через Яндекс"],
  ])("explains %s", (code, text) => {
    expect(getAuthErrorMessage(code)).toContain(text);
  });
  it("does not echo unknown error text", () => {
    expect(getAuthErrorMessage("unexpected-private-value")).toBe("Не удалось войти. Попробуйте еще раз.");
  });
});
