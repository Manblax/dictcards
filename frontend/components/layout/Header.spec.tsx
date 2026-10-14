import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Header from "./Header";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

describe("Header", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  it("renders guest branding and auth links", () => {
    render(<Header isAuthenticated={false} />);

    expect(screen.getByRole("link", { name: "DictCards" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Регистрация" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("searches module titles on Enter or the search button", async () => {
    const user = userEvent.setup();
    render(<Header isAuthenticated />);

    await user.type(screen.getByRole("searchbox"), "  Test & lesson  {Enter}");
    expect(push).toHaveBeenLastCalledWith("/search?q=Test+%26+lesson");

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "Урок");
    await user.click(screen.getByRole("button", { name: "Найти модули" }));
    expect(push).toHaveBeenLastCalledWith(`/search?${new URLSearchParams({ q: "Урок" })}`);
  });

  it("renders authenticated search and create controls", () => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: "user-1",
        username: "demo",
        email: "demo@example.com",
      }),
    );

    render(<Header isAuthenticated />);

    expect(screen.getByLabelText("Открыть меню")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Поиск")).toBeInTheDocument();
    expect(screen.getByTitle("Создать модуль")).toHaveAttribute(
      "href",
      "/create",
    );
  });
});
