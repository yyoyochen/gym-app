// Minimal RFC 4180 CSV parser: quoted fields with commas, doubled quotes,
// newlines inside quotes, CRLF/LF, leading BOM. Comma or semicolon (Strong's
// Android export). No dependencies.

/** The delimiter of the header line: ';' when it has more semicolons than commas outside quotes. */
export function sniffDelimiter(text: string): ',' | ';' {
  let commas = 0, semis = 0, quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && c === ',') commas++;
    else if (!quoted && c === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

export function parseCsv(text: string, delimiter: ',' | ';' = ','): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === delimiter) { row.push(field); field = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop fully blank lines.
  return rows.filter(r => r.some(f => f.trim() !== ''));
}
