import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { getModules } from "@/lib/api";
import { getServerAuthToken } from "@/lib/server-auth";
import SearchPage from "./page";

vi.mock("@/lib/api", () => ({ getModules: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ getServerAuthToken: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => { throw new Error("redirect"); }),
}));

describe("SearchPage", () => {
  beforeEach(() => {
    vi.mocked(getServerAuthToken).mockResolvedValue("search-token");
    vi.mocked(getModules).mockReset().mockResolvedValue([]);
    vi.stubGlobal("IntersectionObserver", vi.fn(() => ({
      observe: vi.fn(), unobserve: vi.fn(),
    })));
  });

  it("renders title matches as linked cards with term counts and authors", async () => {
    vi.mocked(getModules).mockResolvedValue([{
      id: "test-lesson", title: "Test lesson", termCount: 3, author: "manblax",
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    render(await SearchPage({ searchParams: Promise.resolve({ q: "  lesson  " }) }));

    expect(getModules).toHaveBeenCalledWith(0, 20, { token: "search-token", query: "lesson" });
    expect(screen.getByRole("link", { name: /Test lesson/ })).toHaveAttribute("href", "/module/test-lesson");
    expect(screen.getByText("3 термина")).toBeInTheDocument();
    expect(screen.getByText("Автор: manblax")).toBeInTheDocument();
  });

  it("prompts for a title without requesting all modules for a blank search", async () => {
    render(await SearchPage({ searchParams: Promise.resolve({ q: "   " }) }));

    expect(getModules).not.toHaveBeenCalled();
    expect(screen.getByText("Введите название модуля в поле поиска.")).toBeInTheDocument();
  });

  it("shows an empty state when no titles match", async () => {
    render(await SearchPage({ searchParams: Promise.resolve({ q: "missing" }) }));

    expect(screen.getByRole("status")).toHaveTextContent("Модули не найдены");
  });

  it("distinguishes request failures from no matches", async () => {
    vi.mocked(getModules).mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(await SearchPage({ searchParams: Promise.resolve({ q: "lesson" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить модули");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("requires sign-in and preserves the search destination", async () => {
    vi.mocked(getServerAuthToken).mockResolvedValue(null);

    await expect(SearchPage({ searchParams: Promise.resolve({ q: "lesson" }) })).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/login?redirect=%2Fsearch%3Fq%3Dlesson");
    expect(getModules).not.toHaveBeenCalled();
  });
});
