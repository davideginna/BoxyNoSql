/**
 * The document editor's dialect: JSON plus shell-style `ObjectId("…")` and
 * `ISODate("…")`, which stand for the `{$oid}` / `{$date}` Extended JSON the
 * main process sends and expects back. Dates must round-trip as `{$date}`, or
 * a save writes them back as strings.
 */

// Shell-style pretty print: {$oid:"x"} → ObjectId("x"), {$date:"x"} → ISODate("x")
export function prettyDoc(doc: any): string {
  return JSON.stringify(doc, null, 2)
    .replace(/\{\s*"\$oid":\s*"([0-9a-fA-F]{24})"\s*\}/g, 'ObjectId("$1")')
    .replace(/\{\s*"\$date":\s*"([^"\\]+)"\s*\}/g, 'ISODate("$1")');
}

export function normalizePretty(text: string): string {
  return text
    .replace(/ObjectId\(\s*"([0-9a-fA-F]{24})"\s*\)/g, '{"$$oid":"$1"}')
    .replace(/ObjectId\(\s*'([0-9a-fA-F]{24})'\s*\)/g, '{"$$oid":"$1"}')
    .replace(/ISODate\(\s*"([^"]+)"\s*\)/g, '{"$$date":"$1"}')
    .replace(/ISODate\(\s*'([^']+)'\s*\)/g, '{"$$date":"$1"}');
}

export function formatJson(raw: string): string {
  try { return prettyDoc(JSON.parse(normalizePretty(raw))); } catch { return raw; }
}

export function validateJson(raw: string): string | null {
  try { JSON.parse(normalizePretty(raw)); return null; } catch (e: any) { return e.message; }
}

export function parseEditable(raw: string): any {
  return JSON.parse(normalizePretty(raw));
}
