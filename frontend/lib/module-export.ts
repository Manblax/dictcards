import type { Term } from "@/types/module";

export interface ExportOptions {
  fieldSeparator: "tab" | "comma" | "custom";
  rowSeparator: "newline" | "semicolon" | "custom";
  customFieldSeparator: string;
  customRowSeparator: string;
  alphabetical: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  fieldSeparator: "tab",
  rowSeparator: "newline",
  customFieldSeparator: "-",
  customRowSeparator: "\\n\\n",
  alphabetical: false,
};

export function decodeExportSeparator(value: string) {
  return value.replace(/\\([nt\\])/g, (_, escape: string) =>
    escape === "n" ? "\n" : escape === "t" ? "\t" : "\\",
  );
}

export function formatModuleExport(
  terms: readonly Pick<Term, "term" | "definition">[],
  options: ExportOptions,
) {
  const field = options.fieldSeparator === "custom"
    ? decodeExportSeparator(options.customFieldSeparator)
    : options.fieldSeparator === "tab" ? "\t" : ",";
  const row = options.rowSeparator === "custom"
    ? decodeExportSeparator(options.customRowSeparator)
    : options.rowSeparator === "newline" ? "\n" : ";";
  if (!field || !row) return { text: "", valid: false };

  const ordered = [...terms];
  if (options.alphabetical) {
    const collator = new Intl.Collator("en", { sensitivity: "base" });
    ordered.sort((a, b) => collator.compare(a.term, b.term));
  }
  return {
    text: ordered.map(({ term, definition }) => `${term}${field}${definition}`).join(row),
    valid: true,
  };
}
