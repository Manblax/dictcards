import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallbackPage from "./page";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), persist: vi.fn(), query: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () => mocks.query,
}));
vi.mock("@/lib/auth", () => ({ persistAuthSession: mocks.persist }));

describe("OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = new URLSearchParams("provider=yandex");
    window.history.replaceState({}, "", "/auth/callback?provider=yandex#access_token=token&id=42&username=demo&email=demo%40yandex.ru");
  });

  it("clears the fragment before persisting and handles Strict Mode only once", async () => {
    mocks.persist.mockImplementation(() => { expect(window.location.hash).toBe(""); });
    render(<StrictMode><AuthCallbackPage /></StrictMode>);
    await waitFor(() => expect(mocks.persist).toHaveBeenCalledExactlyOnceWith("token", { id: "42", username: "demo", email: "demo@yandex.ru" }));
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("clears invalid fragments and reports the correct provider", async () => {
    window.history.replaceState({}, "", "/auth/callback?provider=yandex#access_token=token");
    render(<AuthCallbackPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login?error=yandex_auth_invalid_response"));
    expect(window.location.hash).toBe("");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("continues accepting legacy Google query credentials", async () => {
    mocks.query = new URLSearchParams("access_token=google&id=42&username=demo&email=demo%40gmail.com");
    window.history.replaceState({}, "", `/auth/callback?${mocks.query}`);
    render(<AuthCallbackPage />);
    await waitFor(() => expect(mocks.persist).toHaveBeenCalledWith("google", { id: "42", username: "demo", email: "demo@gmail.com" }));
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });
});
