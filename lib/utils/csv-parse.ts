/**
 * Minimal CSV parser (handles quoted fields containing commas, and "" as an
 * escaped quote inside a quoted field). No external dependency is added for
 * this — the format is simple enough that a hand-rolled parser is safer than
 * pulling in a library just for admin-side file import.
 *
 * Returns an array of objects keyed by the header row.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter(hasContent).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = (row[i] ?? "").trim();
    });
    return record;
  });
}

function hasContent(row: string[]): boolean {
  return row.some((cell) => cell.trim().length > 0);
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // skip; \r\n line endings are handled by the following \n
    } else {
      field += char;
    }
  }
  // final field/row if the file doesn't end with a newline
  if (field.length > 0 || row.length > 0) pushRow();

  return rows;
}
