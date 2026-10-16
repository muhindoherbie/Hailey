import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { setup, signup, text, toolCall, parseSSE, type TestCtx } from './helpers.ts';
import { exportContent, toDocx } from '../server/services/exporters.ts';
import { toXlsx } from '../server/services/exporters.ts';
import { parseXlsx } from '../server/services/spreadsheet.ts';

let ctx: TestCtx;
beforeEach(() => (ctx = setup()));
afterEach(() => ctx.cleanup());

const fileForm = (name: string, content: BlobPart | Buffer, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.append('file', new File([content as BlobPart], name));
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
};

const SALES_CSV = 'date,branch,amount\n2026-01-05,Kampala,1200\n2026-01-20,Entebbe,800\n2026-02-03,Kampala,1500\n2026-02-17,Entebbe,700\n2026-03-02,Kampala,1600\n2026-03-15,Entebbe,,\n2026-03-20,Kampala,90000\n2026-03-25,Jinja,950\n2026-03-28,Jinja,1000\n';

describe('document upload and processing', () => {
  it('uploads text, makes it searchable with source locations, and downloads the original', async () => {
    const c = await signup(ctx);
    const r = await c.req('POST', '/api/documents', fileForm('policy.md', '# Returns policy\n\nCustomers may return unopened medicine within 7 days.'));
    expect(r.status).toBe(201);
    const doc = r.data.document;
    expect(doc.kind).toBe('markdown');
    const hits = (await c.get('/api/search?q=unopened medicine')).data.results;
    expect(hits[0]).toMatchObject({ entity: 'document', id: doc.id, title: 'policy.md' });
    const dl = await c.get(`/api/documents/${doc.id}/download`);
    expect(dl.headers.get('content-type')).toBe('application/octet-stream');
    expect(dl.headers.get('content-disposition')).toMatch(/attachment; filename="policy.md"/);
    expect(Buffer.from(dl.data).toString()).toContain('Returns policy');
  });

  it('extracts text from PDF and DOCX with page markers', async () => {
    const c = await signup(ctx);
    const pdf = await exportContent('pdf', 'Stock report', 'Paracetamol stock is low.\n\n## Next steps\n- Reorder by Friday');
    const p = (await c.req('POST', '/api/documents', fileForm('report.pdf', pdf))).data.document;
    expect(p.kind).toBe('pdf');
    const detail = (await c.get(`/api/documents/${p.id}`)).data;
    expect(detail.chunks[0].locator).toBe('page 1');
    expect(detail.chunks[0].text).toContain('Paracetamol stock is low');
    const docx = await toDocx('Minutes', 'The board approved the new pharmacy branch.');
    const d = (await c.req('POST', '/api/documents', fileForm('minutes.docx', docx))).data.document;
    expect((await c.get(`/api/documents/${d.id}`)).data.chunks[0].text).toContain('approved the new pharmacy branch');
  });

  it('rejects unsupported, disguised, empty and oversized files', async () => {
    const c = await signup(ctx);
    const exe = await c.req('POST', '/api/documents', fileForm('virus.exe', 'MZ\x90\x00'));
    expect(exe.status).toBe(400);
    expect(exe.data.error).toMatch(/Unsupported file type/);
    const fakePdf = await c.req('POST', '/api/documents', fileForm('report.pdf', 'just text'));
    expect(fakePdf.status).toBe(400);
    const fakeXlsx = await c.req('POST', '/api/documents', fileForm('sheet.xlsx', 'not a zip'));
    expect(fakeXlsx.status).toBe(400);
    const binaryTxt = await c.req('POST', '/api/documents', fileForm('notes.txt', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])));
    expect(binaryTxt.status).toBe(400);
    expect((await c.req('POST', '/api/documents', fileForm('empty.txt', ''))).status).toBe(400);
    const small = setup({ env: { MAX_UPLOAD_MB: '1' } });
    try {
      const s = await signup(small);
      const big = await s.req('POST', '/api/documents', fileForm('big.txt', 'a'.repeat(1.5 * 1024 * 1024)));
      expect(big.status).toBe(400);
      expect(big.data.error).toMatch(/too large/);
    } finally {
      small.cleanup();
    }
  });

  it('sanitises file names to prevent path tricks', async () => {
    const c = await signup(ctx);
    const r = await c.req('POST', '/api/documents', fileForm('../../etc/passwd.txt', 'hello'));
    expect(r.status).toBe(201);
    expect(r.data.document.filename).not.toContain('/');
    expect(r.data.document.filename).not.toMatch(/^\./);
  });

  it('deletes the stored file and its index entries', async () => {
    const c = await signup(ctx);
    const doc = (await c.req('POST', '/api/documents', fileForm('temp.txt', 'ephemeral kangaroo content'))).data.document;
    const path = ctx.services.db.get('SELECT storage_path FROM documents WHERE id = ?', doc.id)!.storage_path;
    expect(existsSync(path)).toBe(true);
    await c.del(`/api/documents/${doc.id}`);
    expect(existsSync(path)).toBe(false);
    expect((await c.get('/api/search?q=kangaroo')).data.results).toHaveLength(0);
  });
});

describe('spreadsheet analysis', () => {
  it('computes totals, missing data, rankings, trends and outliers from a CSV', async () => {
    const c = await signup(ctx);
    const doc = (await c.req('POST', '/api/documents', fileForm('sales.csv', SALES_CSV))).data.document;
    const a = (await c.get(`/api/documents/${doc.id}/analysis`)).data.analysis;
    const amount = a.columns.find((x: any) => x.name === 'amount');
    expect(amount.type).toBe('number');
    expect(amount.sum).toBe(97750);
    expect(amount.missing).toBe(1);
    expect(a.rankings[0].items[0]).toEqual({ label: 'Kampala', total: 94300 });
    expect(a.trends[0].points.map((p: any) => p.period)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(a.anomalies[0]).toMatchObject({ column: 'amount', value: 90000 });
    expect(a.notes.join(' ')).toMatch(/missing cells are excluded/);
  });

  it('reads XLSX values without running formulas', async () => {
    const buf = await toXlsx('t', [{ name: 'Data', headers: ['Item', 'Qty', 'Formula'], rows: [['A', 5, '=1+1'], ['B', 7, '=SUM(B2:B3)']] }]);
    const sheets = await parseXlsx(buf);
    expect(sheets[0].rows[0]).toEqual(['A', 5, "'=1+1"]); // stored safely as text, not evaluated
  });

  it('generates a real analysis report in each format', async () => {
    const c = await signup(ctx);
    const doc = (await c.req('POST', '/api/documents', fileForm('sales.csv', SALES_CSV))).data.document;
    const magic: Record<string, string> = { pdf: '%PDF', docx: 'PK', xlsx: 'PK', md: '# An' };
    for (const format of ['pdf', 'docx', 'xlsx', 'md']) {
      const r = (await c.post(`/api/documents/${doc.id}/report`, { format })).data;
      const file = await c.get(r.download_url);
      expect(file.status).toBe(200);
      expect(Buffer.from(file.data).subarray(0, magic[format].length).toString()).toBe(magic[format]);
    }
    const md = await c.get((await c.post(`/api/documents/${doc.id}/report`, { format: 'md' })).data.download_url);
    expect(Buffer.from(md.data).toString()).toContain('| Kampala | 94300 |');
  });

  it('the assistant can analyse an uploaded spreadsheet through its tool', async () => {
    const c = await signup(ctx);
    const doc = (await c.req('POST', '/api/documents', fileForm('sales.csv', SALES_CSV))).data.document;
    const conv = (await c.post('/api/conversations', {})).data;
    ctx.provider.steps.push(() => toolCall('analyze_spreadsheet', { document_id: doc.id }), (req) => {
      const res = JSON.parse((req.messages.at(-1)!.content[0] as any).content);
      expect(res.analysis.rowCount).toBe(9);
      return text('Kampala leads with 94,300.');
    });
    const r = await c.post(`/api/conversations/${conv.id}/messages`, { text: 'Analyse my sales', attachments: [doc.id] });
    const msg = parseSSE(r.data).find((e) => e.event === 'message')!.data.message;
    expect(msg.meta.sources[0].title).toContain('sales.csv');
  });
});

describe('exports', () => {
  it('creates downloadable files from content in every supported format', async () => {
    const c = await signup(ctx);
    const md = '## Summary\nRevenue rose.\n\n| Branch | Sales |\n|---|---|\n| Kampala | 1200 |';
    const magic: Record<string, string> = { md: '#', docx: 'PK', pdf: '%PDF', xlsx: 'PK', pptx: 'PK', csv: 'Branch' };
    for (const format of Object.keys(magic)) {
      const r = await c.post('/api/exports', { title: 'Quarterly summary', format, markdown: md });
      expect(r.status, format).toBe(201);
      expect(r.data.filename).toBe(`Quarterly-summary.${format}`);
      const f = await c.get(r.data.download_url);
      expect(Buffer.from(f.data).subarray(0, magic[format].length).toString(), format).toBe(magic[format]);
    }
    expect((await c.get('/api/exports')).data.exports).toHaveLength(6);
  });

  it('neutralises spreadsheet formula injection in CSV exports', async () => {
    const out = (await exportContent('csv', 't', '| a | b |\n|---|---|\n| =HYPERLINK("x") | ok |')).toString();
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('the assistant can create an export and the link works', async () => {
    const c = await signup(ctx);
    const conv = (await c.post('/api/conversations', {})).data;
    ctx.provider.steps.push(() => toolCall('create_export', { title: 'Letter to supplier', format: 'docx', markdown: 'Dear supplier,\n\nPlease deliver 20 cartons.' }), () => text('Here is your letter.'));
    const r = await c.post(`/api/conversations/${conv.id}/messages`, { text: 'Draft a letter as Word' });
    const msg = parseSSE(r.data).find((e) => e.event === 'message')!.data.message;
    const url = msg.meta.tools[0].result.download_url;
    const f = await c.get(url);
    expect(f.status).toBe(200);
    expect(f.headers.get('content-disposition')).toContain('Letter-to-supplier.docx');
    // Another user cannot download it.
    const other = await signup(ctx, 'Eve');
    expect((await other.get(url)).status).toBe(404);
  });
});
