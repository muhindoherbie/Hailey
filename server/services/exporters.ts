import type { Paragraph, Table, TextRun } from 'docx';
import type { PDFFont } from 'pdf-lib';

// The file libraries are large and most sessions never make a file, so each one is loaded the
// first time it's needed (this keeps the phone app's start-up fast).
const docxLib = () => import('docx');
const pdfLib = () => import('pdf-lib');
const excelLib = async () => { const m: any = await import('exceljs'); return m.default ?? m; };
const pptxLib = async () => { const m: any = await import('pptxgenjs'); const x = m.default ?? m; return x.default ?? x; };

/** A small, safe Markdown subset parsed into blocks shared by every exporter. */
export type MdBlock =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'li'; text: string; ordered: boolean }
  | { t: 'table'; headers: string[]; rows: string[][] }
  | { t: 'code'; text: string };

export function parseMarkdown(md: string): MdBlock[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', text: para.join(' ').trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      out.push({ t: 'code', text: code.join('\n') });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      out.push({ t: 'h', level: h[1].length, text: h[2].trim() });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const headers = cells(line);
      const rows: string[][] = [];
      i += 1;
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(cells(lines[++i]));
      out.push({ t: 'table', headers, rows });
      continue;
    }
    const li = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      out.push({ t: 'li', text: li[2].trim(), ordered: /\d/.test(li[1]) });
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return out;
}

const stripInline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

function runs(TextRunClass: typeof TextRun, text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => (p.startsWith('**') ? new TextRunClass({ text: stripInline(p.slice(2, -2)), bold: true }) : new TextRunClass(stripInline(p))));
}

export async function toDocx(title: string, md: string): Promise<Buffer> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } = await docxLib();
  const children: (Paragraph | Table)[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  for (const b of parseMarkdown(md)) {
    if (b.t === 'h') children.push(new Paragraph({ text: stripInline(b.text), heading: levels[b.level - 1] }));
    else if (b.t === 'p') children.push(new Paragraph({ children: runs(TextRun, b.text), spacing: { after: 120 } }));
    else if (b.t === 'li') children.push(new Paragraph({ children: runs(TextRun, b.text), bullet: { level: 0 } }));
    else if (b.t === 'code') children.push(new Paragraph({ children: [new TextRun({ text: b.text, font: 'Consolas' })] }));
    else if (b.t === 'table') {
      const mk = (cells: string[], bold = false) =>
        new TableRow({ children: cells.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: stripInline(c), bold })] })] })) });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [mk(b.headers, true), ...b.rows.map((r) => mk(r))] }));
      children.push(new Paragraph(''));
    }
  }
  const doc = new Document({ creator: 'Hailey', title, sections: [{ children }] });
  // ArrayBuffer, not Node's buffer type: the phone app runs this code in its WebView too.
  return Buffer.from(await Packer.toArrayBuffer(doc));
}

/** Standard PDF fonts only cover WinAnsi; replace anything else so generation never fails. */
function winAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/•/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

export async function toPdf(title: string, md: string): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await pdfLib();
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('Hailey');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const W = 595, H = 842, M = 56;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const write = (text: string, f: PDFFont, size: number, indent = 0, gap = 4) => {
    const words = winAnsi(text).split(/\s+/);
    let line = '';
    const maxW = W - 2 * M - indent;
    const lines: string[] = [];
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    for (const l of lines) {
      ensure(size + gap);
      page.drawText(l, { x: M + indent, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.12) });
      y -= size + gap;
    }
  };
  write(title, bold, 20, 0, 8);
  y -= 8;
  for (const b of parseMarkdown(md)) {
    if (b.t === 'h') {
      y -= 6;
      write(stripInline(b.text), bold, Math.max(16 - b.level * 1.5, 11), 0, 6);
    } else if (b.t === 'p') {
      write(stripInline(b.text), font, 11);
      y -= 6;
    } else if (b.t === 'li') write(`-  ${stripInline(b.text)}`, font, 11, 10);
    else if (b.t === 'code') {
      for (const l of b.text.split('\n')) write(l || ' ', mono, 9, 10, 2);
      y -= 6;
    } else if (b.t === 'table') {
      write(b.headers.map(stripInline).join('  |  '), bold, 10, 0, 3);
      for (const r of b.rows) write(r.map(stripInline).join('  |  '), font, 10, 0, 3);
      y -= 8;
    }
  }
  return Buffer.from(await pdf.save());
}

export async function toXlsx(title: string, sheets: { name: string; headers: string[]; rows: (string | number | null)[][] }[]): Promise<Buffer> {
  const ExcelJS = await excelLib();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hailey';
  wb.title = title;
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet');
    ws.addRow(s.headers);
    ws.getRow(1).font = { bold: true };
    for (const r of s.rows) {
      // Prefix values that spreadsheet apps would treat as formulas (CSV/XLSX injection).
      ws.addRow(r.map((c) => (typeof c === 'string' && /^[=+\-@\t\r]/.test(c) ? `'${c}` : c)));
    }
    ws.columns.forEach((col: any) => (col.width = 18));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPptx(title: string, md: string): Promise<Buffer> {
  const PptxGenJS = await pptxLib();
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  const first = pptx.addSlide();
  first.background = { color: '1F2A44' };
  first.addText(title, { x: 0.6, y: 2.6, w: 12, h: 1.4, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: 'Calibri' });
  let slide: any = null;
  let bullets: string[] = [];
  const flush = () => {
    if (slide && bullets.length) slide.addText(bullets.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.6, y: 1.5, w: 12, h: 5.5, fontSize: 20, color: '1F2A44', valign: 'top' });
    bullets = [];
  };
  for (const b of parseMarkdown(md)) {
    if (b.t === 'h' && b.level <= 2) {
      flush();
      slide = pptx.addSlide();
      slide.addText(stripInline(b.text), { x: 0.6, y: 0.4, w: 12, h: 0.9, fontSize: 30, bold: true, color: '1F2A44' });
    } else {
      if (!slide) {
        slide = pptx.addSlide();
        slide.addText(title, { x: 0.6, y: 0.4, w: 12, h: 0.9, fontSize: 30, bold: true, color: '1F2A44' });
      }
      if (b.t === 'table') {
        flush();
        slide.addTable([b.headers, ...b.rows].map((r, i) => r.map((c) => ({ text: stripInline(c), options: { bold: i === 0 } }))), { x: 0.6, y: 1.5, w: 12, fontSize: 14 });
      } else if (b.t !== 'code') bullets.push(stripInline(b.t === 'h' ? b.text : b.text));
    }
  }
  flush();
  const out = await pptx.write({ outputType: 'arraybuffer' });
  return Buffer.from(out as ArrayBuffer);
}

export const EXPORT_TYPES = {
  md: { mime: 'text/markdown; charset=utf-8', ext: 'md' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
  csv: { mime: 'text/csv; charset=utf-8', ext: 'csv' },
} as const;
export type ExportFormat = keyof typeof EXPORT_TYPES;

/** Builds an export from Markdown content. Tables in the Markdown become spreadsheet sheets. */
export async function exportContent(format: ExportFormat, title: string, md: string): Promise<Buffer> {
  switch (format) {
    case 'md':
      return Buffer.from(`# ${title}\n\n${md}\n`, 'utf8');
    case 'docx':
      return toDocx(title, md);
    case 'pdf':
      return toPdf(title, md);
    case 'pptx':
      return toPptx(title, md);
    case 'xlsx': {
      const tables = parseMarkdown(md).filter((b): b is Extract<MdBlock, { t: 'table' }> => b.t === 'table');
      const sheets = tables.length
        ? tables.map((t, i) => ({ name: `Table ${i + 1}`, headers: t.headers, rows: t.rows.map((r) => r.map(numOrText)) }))
        : [{ name: 'Content', headers: ['Line'], rows: md.split('\n').filter(Boolean).map((l) => [l]) }];
      return toXlsx(title, sheets);
    }
    case 'csv': {
      const t = parseMarkdown(md).find((b) => b.t === 'table') as Extract<MdBlock, { t: 'table' }> | undefined;
      const rows = t ? [t.headers, ...t.rows] : md.split('\n').filter(Boolean).map((l) => [l]);
      return Buffer.from(rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'utf8');
    }
  }
}

function numOrText(s: string): string | number {
  const n = Number(s.replace(/,/g, ''));
  return s.trim() !== '' && Number.isFinite(n) && /^[-\d.,\s]+$/.test(s) ? n : s;
}

function csvCell(s: string) {
  let v = s;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportFilename(title: string, format: ExportFormat) {
  const base = title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'hailey-export';
  return `${base}.${EXPORT_TYPES[format].ext}`;
}
