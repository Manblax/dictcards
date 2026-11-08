"use client";

import { useId, useMemo, useRef, useState, type RefObject } from "react";
import type { Term } from "@/types/module";
import { DEFAULT_EXPORT_OPTIONS, formatModuleExport, type ExportOptions } from "@/lib/module-export";
import ModuleDialog from "./ModuleDialog";

export default function ModuleExportDialog({ terms, onClose, returnFocusRef }: {
  terms: readonly Term[];
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const id = useId();
  const [options, setOptions] = useState(DEFAULT_EXPORT_OPTIONS);
  const [status, setStatus] = useState("");
  const [copying, setCopying] = useState(false);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const revision = useRef(0);
  const result = useMemo(() => formatModuleExport(terms, options), [terms, options]);

  function update(patch: Partial<ExportOptions>) {
    revision.current++;
    setOptions((current) => ({ ...current, ...patch }));
    setStatus("");
  }

  async function copy() {
    const started = revision.current;
    setCopying(true);
    setStatus("");
    try {
      await navigator.clipboard.writeText(result.text);
      if (started === revision.current) setStatus("Текст скопирован");
    } catch {
      if (started === revision.current) {
        previewRef.current?.focus();
        previewRef.current?.select();
        setStatus("Не удалось скопировать автоматически. Текст выделен — скопируйте его вручную через меню устройства или Ctrl+C / ⌘C.");
      }
    } finally {
      setCopying(false);
    }
  }

  return (
    <ModuleDialog labelId={`${id}-title`} className="module-export-dialog" onDismiss={onClose} returnFocusRef={returnFocusRef}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-6">
          <h2 id={`${id}-title`} className="text-2xl font-bold sm:text-3xl">Экспортировать</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть экспорт" className="btn btn-circle btn-ghost shrink-0 bg-[var(--app-panel-strong)] text-3xl">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 sm:px-8 sm:pb-8">
          <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 sm:gap-10">
            <SeparatorGroup
              title="Между термином и определением" name={`${id}-field`}
              value={options.fieldSeparator} customValue={options.customFieldSeparator}
              choices={[{ value: "tab", label: "Tab" }, { value: "comma", label: "Запятая" }]}
              onChange={(fieldSeparator) => update({ fieldSeparator })}
              onCustomChange={(customFieldSeparator) => update({ fieldSeparator: "custom", customFieldSeparator })}
            />
            <SeparatorGroup
              title="Между строками" name={`${id}-row`}
              value={options.rowSeparator} customValue={options.customRowSeparator}
              choices={[{ value: "newline", label: "Разрыв строки" }, { value: "semicolon", label: "Точка с запятой" }]}
              onChange={(rowSeparator) => update({ rowSeparator })}
              onCustomChange={(customRowSeparator) => update({ rowSeparator: "custom", customRowSeparator })}
            />
          </div>
          <fieldset className="mt-7">
            <legend className="mb-4 text-lg font-semibold">Параметры</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" className="checkbox rounded-sm border-[var(--app-text-strong)]" checked={options.alphabetical} onChange={(event) => update({ alphabetical: event.target.checked })} />
              В алфавитном порядке
            </label>
          </fieldset>
          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-relaxed text-neutral-content sm:text-base">Скопируйте и вставьте приведённый ниже текст. Он защищён от редактирования.</p>
            <button type="button" className="btn btn-primary shrink-0 rounded-full px-7" disabled={!result.valid || !terms.length || copying} onClick={() => void copy()}>
              {copying ? "Копирование…" : "Копировать текст"}
            </button>
          </div>
          {!result.valid && <p role="alert" className="mt-3 text-sm text-error">Введите свой разделитель.</p>}
          {!terms.length && <p className="mt-3 text-sm text-neutral-content">В модуле нет терминов для экспорта.</p>}
          <p role="status" aria-live="polite" className="mt-3 text-sm text-neutral-content">{status}</p>
          <div className="mt-4 rounded-xl bg-[var(--app-panel-strong)] p-4 sm:p-5">
            <label htmlFor={`${id}-preview`} className="mb-2 block text-sm font-medium text-neutral-content">Содержание модуля</label>
            <textarea
              ref={previewRef} id={`${id}-preview`} readOnly value={result.text} spellCheck={false}
              className="block h-64 min-h-40 w-full resize-y bg-transparent text-base leading-7 text-[var(--app-text-strong)] outline-offset-4 sm:h-72"
            />
          </div>
        </div>
      </div>
    </ModuleDialog>
  );
}

function SeparatorGroup<T extends string>({ title, name, value, customValue, choices, onChange, onCustomChange }: {
  title: string;
  name: string;
  value: T | "custom";
  customValue: string;
  choices: { value: T; label: string }[];
  onChange: (value: T | "custom") => void;
  onCustomChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-base font-semibold sm:text-lg">{title}</legend>
      <div className="space-y-2">
        {choices.map((choice) => (
          <label key={choice.value} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="radio" className="radio border-[var(--app-text-strong)]" name={name} value={choice.value} checked={value === choice.value} onChange={() => onChange(choice.value)} />
            {choice.label}
          </label>
        ))}
        <div className="flex items-center gap-3">
          <input type="radio" className="radio shrink-0 border-[var(--app-text-strong)]" name={name} value="custom" aria-label={`Свой разделитель: ${title.toLowerCase()}`} checked={value === "custom"} onChange={() => onChange("custom")} />
          <label className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg bg-[var(--app-panel-strong)] px-4 py-2">
            <span className="text-xs text-neutral-content">На выбор</span>
            <input type="text" aria-label={`Свой разделитель: ${title.toLowerCase()}`} className="min-h-8 min-w-0 bg-transparent text-base outline-offset-2" value={customValue} onFocus={() => onChange("custom")} onChange={(event) => onCustomChange(event.target.value)} />
          </label>
        </div>
      </div>
    </fieldset>
  );
}
