import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteModule } from "@/lib/api";
import ModuleActions from "./ModuleActions";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", () => ({ deleteModule: vi.fn() }));
const terms = [
  { id: "1", term: "pear", definition: "a fruit", image: "/image.png", isFavorite: true },
  { id: "2", term: "Apple", definition: "another fruit" },
];

describe("module actions and export", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.mocked(deleteModule).mockReset();
    // jsdom does not implement native modal behavior; browser tests cover focus trapping.
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
  });

  async function openExport(customTerms = terms) {
    const user = userEvent.setup();
    render(<ModuleActions moduleId="module-1" terms={customTerms} />);
    await user.click(screen.getByRole("button", { name: "Действия с модулем" }));
    await user.click(screen.getByRole("menuitem", { name: "Экспортировать" }));
    return user;
  }

  it("copies exactly the read-only preview and announces success", async () => {
    const user = await openExport();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const preview = screen.getByRole("textbox", { name: "Содержание модуля" });
    expect(preview).toHaveAttribute("readonly");
    expect(preview).toHaveValue("pear\ta fruit\nApple\tanother fruit");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Копировать текст" }));
    expect(write).toHaveBeenCalledExactlyOnceWith("pear\ta fruit\nApple\tanother fruit");
    expect(screen.getByRole("status")).toHaveTextContent("Текст скопирован");
    await user.click(screen.getByRole("checkbox", { name: "В алфавитном порядке" }));
    expect(preview).toHaveValue("Apple\tanother fruit\npear\ta fruit");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("updates separators, validates custom input and resets when reopened", async () => {
    const user = await openExport();
    await user.click(screen.getByRole("radio", { name: "Запятая" }));
    await user.click(screen.getByRole("radio", { name: "Точка с запятой" }));
    expect(screen.getByRole("textbox", { name: "Содержание модуля" })).toHaveValue("pear,a fruit;Apple,another fruit");
    const custom = screen.getByRole("textbox", { name: "Свой разделитель: между строками" });
    await user.click(custom);
    expect(screen.getByRole("textbox", { name: "Содержание модуля" })).toHaveValue("pear,a fruit\n\nApple,another fruit");
    await user.clear(custom);
    expect(screen.getByRole("button", { name: "Копировать текст" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Введите свой разделитель");
    await user.click(screen.getByRole("button", { name: "Закрыть экспорт" }));
    expect(screen.getByRole("button", { name: "Действия с модулем" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Действия с модулем" }));
    await user.click(screen.getByRole("menuitem", { name: "Экспортировать" }));
    expect(screen.getByRole("radio", { name: "Tab" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Разрыв строки" })).toBeChecked();
  });

  it("selects the preview for manual copy when clipboard access fails", async () => {
    const user = await openExport();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"));
    await user.click(screen.getByRole("button", { name: "Копировать текст" }));
    const preview = screen.getByRole("textbox", { name: "Содержание модуля" }) as HTMLTextAreaElement;
    expect(preview).toHaveFocus();
    expect(preview.selectionStart).toBe(0);
    expect(preview.selectionEnd).toBe(preview.value.length);
    expect(screen.getByRole("status")).toHaveTextContent("скопируйте его вручную");
  });

  it("disables copying an empty module", async () => {
    await openExport([]);
    expect(screen.getByRole("button", { name: "Копировать текст" })).toBeDisabled();
    expect(screen.getByText("В модуле нет терминов для экспорта.")).toBeVisible();
  });

  it("dismisses using native Escape or backdrop and restores focus", async () => {
    await openExport();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent(screen.getByRole("dialog", { name: "Экспортировать" }), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Действия с модулем" }));
    fireEvent.click(screen.getByRole("dialog", { name: "Действия с модулем" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Действия с модулем" })).toHaveFocus();
  });

  it("keeps edit navigation and confirmed delete behavior in the menu", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true));
    vi.mocked(deleteModule).mockResolvedValue({});
    render(<ModuleActions moduleId="module-1" terms={terms} />);
    await user.click(screen.getByRole("button", { name: "Действия с модулем" }));
    expect(screen.getByRole("menuitem", { name: "Редактировать" })).toHaveAttribute("href", "/module/module-1/edit");
    await user.click(screen.getByRole("menuitem", { name: "Удалить" }));
    expect(deleteModule).not.toHaveBeenCalled();
    await user.click(screen.getByRole("menuitem", { name: "Удалить" }));
    await waitFor(() => expect(deleteModule).toHaveBeenCalledWith("module-1"));
    expect(push).toHaveBeenCalledWith("/");
    expect(refresh).toHaveBeenCalled();
  });
});
