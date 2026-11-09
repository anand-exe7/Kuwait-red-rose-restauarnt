"use client";

// A tiny .xlsx writer.
//
// Real Excel workbooks, built in the browser with no dependency: an .xlsx is
// just a ZIP of XML parts, and we store the entries uncompressed, which every
// version of Excel, Numbers, LibreOffice and Google Sheets opens happily.
//
// Why not a CSV: a CSV loses the number/date types and mangles Arabic names
// and leading zeros, and the shop opens these in Excel on a phone.

export type Cell = string | number | null | undefined;

const enc = new TextEncoder();

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Excel refuses control characters outright.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** 0 → A, 25 → Z, 26 → AA … */
function colName(i: number): string {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${colName(c)}${r + 1}`;
          const style = r === 0 ? ' s="1"' : '';
          if (v === null || v === undefined || v === '') return `<c r="${ref}"${style}/>`;
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const widths = (rows[0] ?? [])
    .map((_, c) => `<col min="${c + 1}" max="${c + 1}" width="18" customWidth="1"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${body}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

// ---- minimal ZIP (stored, no compression) ----

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface Entry { name: string; bytes: Uint8Array; crc: number; offset: number }

function zip(files: { name: string; text: string }[]): Blob {
  const chunks: Uint8Array[] = [];
  const entries: Entry[] = [];
  let offset = 0;
  const now = new Date();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const push = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const bytes = enc.encode(f.text);
    const crc = crc32(bytes);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // UTF-8 names
    head.setUint16(8, 0, true); // stored
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, bytes.length, true);
    head.setUint32(22, bytes.length, true);
    head.setUint16(26, nameBytes.length, true);
    head.setUint16(28, 0, true);
    entries.push({ name: f.name, bytes, crc, offset });
    push(new Uint8Array(head.buffer));
    push(nameBytes);
    push(bytes);
  }

  const dirStart = offset;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, 0, true);
    head.setUint16(12, time, true);
    head.setUint16(14, date, true);
    head.setUint32(16, e.crc, true);
    head.setUint32(20, e.bytes.length, true);
    head.setUint32(24, e.bytes.length, true);
    head.setUint16(28, nameBytes.length, true);
    head.setUint32(42, e.offset, true);
    push(new Uint8Array(head.buffer));
    push(nameBytes);
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, offset - dirStart, true);
  end.setUint32(16, dirStart, true);
  push(new Uint8Array(end.buffer));

  return new Blob(chunks as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export interface XlsxSheet {
  name: string;
  /** Row 0 is the header: bold and frozen. */
  rows: Cell[][];
}

const safeSheetName = (name: string, i: number) =>
  (name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || `Sheet${i + 1}`;

/** Build a workbook with one tab per sheet. */
export function buildXlsxWorkbook(sheets: XlsxSheet[]): Blob {
  const list = sheets.length ? sheets : [{ name: 'Sheet1', rows: [] as Cell[][] }];
  const overrides = list
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const sheetTags = list
    .map((s, i) => `<sheet name="${xmlEscape(safeSheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const rels = list
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('');
  const styleRel = `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

  return zip([
    {
      name: '[Content_Types].xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}${styleRel}</Relationships>`,
    },
    { name: 'xl/styles.xml', text: STYLES },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s.rows) })),
  ]);
}

/** Build a one-sheet workbook. Row 0 is treated as the (bold, frozen) header. */
export function buildXlsx(sheetName: string, rows: Cell[][]): Blob {
  return buildXlsxWorkbook([{ name: sheetName, rows }]);
}

/** Build and download a workbook (one sheet, or several). */
export function downloadXlsx(filename: string, sheetName: string, rows: Cell[][]): void;
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void;
export function downloadXlsx(filename: string, a: string | XlsxSheet[], rows?: Cell[][]): void {
  const blob = typeof a === 'string' ? buildXlsx(a, rows ?? []) : buildXlsxWorkbook(a);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
