"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Term } from "@/types/module";
import DeleteModuleButton from "./DeleteModuleButton";
import ModuleDialog from "./ModuleDialog";
import ModuleExportDialog from "./ModuleExportDialog";

const itemClass = "flex min-h-12 w-full items-center gap-3 rounded-lg px-4 py-3 text-left font-medium hover:bg-[var(--app-dropdown-hover)] focus-visible:outline-2 focus-visible:outline-primary";

export default function ModuleActions({ moduleId, terms }: { moduleId: string; terms: readonly Term[] }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});

  function openMenu() {
    const box = triggerRef.current!.getBoundingClientRect();
    setPosition({
      "--menu-top": `${Math.max(16, Math.min(box.bottom + 8, window.innerHeight - 250))}px`,
      "--menu-right": `${Math.max(16, window.innerWidth - box.right)}px`,
    } as CSSProperties);
    setMenuOpen(true);
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="btn btn-square btn-ghost text-neutral-content" aria-label="Действия с модулем" title="Действия с модулем" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={openMenu}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {menuOpen && (
        <ModuleDialog labelId={`${id}-menu-title`} className="module-actions-dialog" style={position} onDismiss={() => setMenuOpen(false)} returnFocusRef={triggerRef}>
          <div className="p-3 sm:p-2">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-content/40 sm:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3 px-3 pb-2 sm:hidden">
              <h2 id={`${id}-menu-title`} className="text-sm font-medium text-neutral-content">Действия с модулем</h2>
              <button type="button" aria-label="Закрыть действия с модулем" className="btn btn-ghost btn-circle text-2xl" onClick={() => setMenuOpen(false)}>×</button>
            </div>
            <div role="menu" aria-label="Действия с модулем" onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
              const current = items.indexOf(document.activeElement as HTMLElement);
              const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
                : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              items[index]?.focus();
            }}>
              <Link autoFocus role="menuitem" href={`/module/${moduleId}/edit`} className={itemClass} onClick={() => setMenuOpen(false)}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="m16 3 5 5-12 12H4v-5L16 3Z" /></svg>
                Редактировать
              </Link>
              <button type="button" role="menuitem" className={itemClass} onClick={() => { setMenuOpen(false); setExportOpen(true); }}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 10V4h16v6M12 8v13m-5-5 5 5 5-5" /></svg>
                Экспортировать
              </button>
              <DeleteModuleButton moduleId={moduleId} presentation="menu" />
            </div>
          </div>
        </ModuleDialog>
      )}
      {exportOpen && <ModuleExportDialog terms={terms} onClose={() => setExportOpen(false)} returnFocusRef={triggerRef} />}
    </>
  );
}
