"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteModule } from "@/lib/api";

export default function DeleteModuleButton({ moduleId, presentation = "icon" }: { moduleId: string; presentation?: "icon" | "menu" }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Вы уверены, что хотите удалить этот модуль? Это действие необратимо.")) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteModule(moduleId);
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Failed to delete module:", error);
      alert("Не удалось удалить модуль");
      setIsDeleting(false);
    }
  };

  return (
    <button
      type="button"
      role={presentation === "menu" ? "menuitem" : undefined}
      className={presentation === "menu"
        ? "flex min-h-12 w-full items-center gap-3 rounded-lg px-4 py-3 text-left font-medium text-error hover:bg-[var(--app-dropdown-hover)] focus-visible:outline-2 focus-visible:outline-primary"
        : "btn btn-square btn-ghost text-neutral-content hover:text-error"}
      title="Удалить"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? (
        <span className="loading loading-spinner loading-xs"></span>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      )}
      {presentation === "menu" && <span>{isDeleting ? "Удаление…" : "Удалить"}</span>}
    </button>
  );
}
