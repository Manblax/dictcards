"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

export default function ModuleDialog({ children, labelId, className, style, onDismiss, returnFocusRef }: {
  children: ReactNode;
  labelId: string;
  className: string;
  style?: CSSProperties;
  onDismiss: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      returnFocusRef.current?.focus();
    };
  }, [returnFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      className={`module-dialog ${className}`}
      style={style}
      onCancel={(event) => { event.preventDefault(); onDismiss(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button, input, textarea, select, [tabindex]',
        )).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if ((!event.shiftKey && document.activeElement === last) ||
            (event.shiftKey && document.activeElement === first)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onDismiss(); }}
    >
      {children}
    </dialog>
  );
}
