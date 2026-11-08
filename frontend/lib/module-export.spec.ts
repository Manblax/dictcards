import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_OPTIONS, decodeExportSeparator, formatModuleExport } from "./module-export";

describe("module export", () => {
  const terms = [
    { term: "pear", definition: 'fruit, sweet; "green"' },
    { term: "Apple", definition: "First\nsecond\tline — яблоко" },
    { term: "apple", definition: "another" },
    { term: "pear", definition: "duplicate" },
  ];
  it("preserves text, duplicates and order without trailing separators", () => {
    expect(formatModuleExport(terms, DEFAULT_EXPORT_OPTIONS)).toEqual({
      valid: true,
      text: 'pear\tfruit, sweet; "green"\nApple\tFirst\nsecond\tline — яблоко\napple\tanother\npear\tduplicate',
    });
  });
  it("supports comma and semicolon separators without CSV quotes", () => {
    expect(formatModuleExport(terms.slice(0, 1), { ...DEFAULT_EXPORT_OPTIONS, fieldSeparator: "comma", rowSeparator: "semicolon" }).text)
      .toBe('pear,fruit, sweet; "green"');
    expect(formatModuleExport([{ term: "a", definition: "A" }, { term: "b", definition: "B" }], { ...DEFAULT_EXPORT_OPTIONS, rowSeparator: "semicolon" }).text).toBe("a\tA;b\tB");
  });
  it("decodes supported custom escapes once and preserves unknown ones", () => {
    expect(decodeExportSeparator(String.raw`\n\t\\\x`)).toBe("\n\t\\\\x");
    expect(decodeExportSeparator(String.raw`\\n`)).toBe(String.raw`\n`);
    expect(formatModuleExport(terms.slice(2), { ...DEFAULT_EXPORT_OPTIONS, fieldSeparator: "custom", customFieldSeparator: " -> ", rowSeparator: "custom" }).text)
      .toBe("apple -> another\n\npear -> duplicate");
  });
  it("sorts stably without modifying the input", () => {
    const original = structuredClone(terms);
    const text = formatModuleExport(terms, { ...DEFAULT_EXPORT_OPTIONS, alphabetical: true }).text;
    expect(text).toBe('Apple\tFirst\nsecond\tline — яблоко\napple\tanother\npear\tfruit, sweet; "green"\npear\tduplicate');
    expect(terms).toEqual(original);
  });
  it("handles empty modules and validates only active custom separators", () => {
    expect(formatModuleExport([], DEFAULT_EXPORT_OPTIONS)).toEqual({ text: "", valid: true });
    expect(formatModuleExport(terms, { ...DEFAULT_EXPORT_OPTIONS, customFieldSeparator: "" }).valid).toBe(true);
    expect(formatModuleExport(terms, { ...DEFAULT_EXPORT_OPTIONS, fieldSeparator: "custom", customFieldSeparator: "" })).toEqual({ text: "", valid: false });
    expect(formatModuleExport(terms, { ...DEFAULT_EXPORT_OPTIONS, rowSeparator: "custom", customRowSeparator: "" }).valid).toBe(false);
  });
});
