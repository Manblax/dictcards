import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getModules } from "@/lib/api";
import type { Module } from "@/types/module";
import InfiniteModuleList from "./InfiniteModuleList";

vi.mock("@/lib/api", () => ({
  getModules: vi.fn(),
}));

let triggerIntersection: (isIntersecting?: boolean) => void;
const observe = vi.fn();
const unobserve = vi.fn();

function installIntersectionObserverMock() {
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((callback: IntersectionObserverCallback) => {
      triggerIntersection = (isIntersecting = true) => {
        callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      };

      return {
        observe,
        unobserve,
        disconnect: vi.fn(),
        takeRecords: vi.fn(() => []),
      };
    }),
  );
}

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: "module-1",
    title: "Module 1",
    description: "",
    termCount: 3,
    author: "alice",
    createdAt: new Date("2026-07-01T10:00:00Z"),
    updatedAt: new Date("2026-07-01T10:00:00Z"),
    ...overrides,
  };
}

describe("InfiniteModuleList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00Z"));
    vi.mocked(getModules).mockReset();
    observe.mockClear();
    unobserve.mockClear();
    installIntersectionObserverMock();
  });

  it("groups initial modules by creation period", () => {
    render(
      <InfiniteModuleList
        initialModules={[
          makeModule({
            id: "this-week",
            title: "This Week Module",
            createdAt: new Date("2026-07-06T10:00:00Z"),
          }),
          makeModule({
            id: "last-week",
            title: "Last Week Module",
            createdAt: new Date("2026-06-28T10:00:00Z"),
          }),
          makeModule({
            id: "older",
            title: "Older Module",
            createdAt: new Date("2026-05-15T10:00:00Z"),
          }),
        ]}
      />,
    );

    expect(screen.getByText("НА ЭТОЙ НЕДЕЛЕ")).toBeInTheDocument();
    expect(screen.getByText("This Week Module")).toBeInTheDocument();
    expect(screen.getByText("НА ПРОШЛОЙ НЕДЕЛЕ")).toBeInTheDocument();
    expect(screen.getByText("Last Week Module")).toBeInTheDocument();
    expect(screen.getByText("Older Module")).toBeInTheDocument();
  });

  it("loads the next page when the sentinel intersects", async () => {
    const initialModules = Array.from({ length: 20 }, (_, index) =>
      makeModule({
        id: `module-${index}`,
        title: `Module ${index}`,
        createdAt: new Date("2026-07-06T10:00:00Z"),
      }),
    );
    vi.mocked(getModules).mockResolvedValue([
      makeModule({
        id: "module-20",
        title: "Loaded Module",
        createdAt: new Date("2026-07-06T10:00:00Z"),
      }),
    ]);

    render(<InfiniteModuleList initialModules={initialModules} />);

    expect(observe).toHaveBeenCalled();

    await act(async () => {
      triggerIntersection();
      await Promise.resolve();
    });

    expect(getModules).toHaveBeenCalledWith(20, 20, { query: undefined });
    expect(screen.getByText("Loaded Module")).toBeInTheDocument();
    expect(screen.getByText("Все модули загружены")).toBeInTheDocument();
  });

  it("keeps the title filter when loading more search results and renders module cards", async () => {
    const initialModules = Array.from({ length: 20 }, (_, index) =>
      makeModule({ id: `result-${index}`, title: `Lesson ${index}` }),
    );
    vi.mocked(getModules).mockResolvedValue([
      makeModule({ id: "next-result", title: "Lesson 20" }),
    ]);
    render(<InfiniteModuleList initialModules={initialModules} query="Lesson" />);

    expect(screen.queryByText("НА ПРОШЛОЙ НЕДЕЛЕ")).not.toBeInTheDocument();
    await act(async () => {
      triggerIntersection();
    });

    expect(getModules).toHaveBeenCalledWith(20, 20, { query: "Lesson" });
    expect(screen.getByRole("link", { name: /Lesson 20/ })).toHaveAttribute("href", "/module/next-result");
  });
});
