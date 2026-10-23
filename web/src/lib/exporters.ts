// File exports: PDF study guide, Word document, Excel workbook.
// Libraries load only when you export, so the app stays fast.
import { CONTENT_MOODS, moodFor } from './emotion';
import { linksOf } from './links';
import { actions, takeaways, toolList, type SummaryItem } from './summary';
import { topicLabel } from './topics';
import type { Link, TopicBoard } from './types';

export interface ExportInput {
  title: string;
  items: SummaryItem[];
  links: Link[];
  boards: TopicBoard[];
  summary: string;
  /** Picture of the board for this selection, as a data URL, when one could be taken. */
  boardImage: string | null;
}

function groupByTopic(items: SummaryItem[]) {
  const map = new Map<string, SummaryItem[]>();
  for (const it of items) {
    const t = it.analysis.primaryTopic || 'unsorted';
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(it);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

const typeLabel = (t: string) => (CONTENT_MOODS[t] || CONTENT_MOODS.other).label;
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// ── PDF ────────────────────────────────────────────────────────────────────

// The built-in PDF font covers Western characters only; swap the rest for close equivalents.
function pdfSafe(s: string) {
  return (s || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/→/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function imageSize(dataUrl: string) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
}

export async function exportPdf(input: ExportInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const maxW = W - M * 2;
  let y = M;
  const ink: [number, number, number] = [31, 36, 48];
  const muted: [number, number, number] = [102, 112, 133];

  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const text = (s: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color || ink));
    const lines = doc.splitTextToSize(pdfSafe(s), maxW - (opts.indent || 0));
    const lh = size * 1.35;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, M + (opts.indent || 0), y + size);
      y += lh;
    }
    y += opts.gap ?? 4;
  };
  const linkText = (label: string, url: string, size = 10) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(37, 99, 235);
    ensure(size * 1.4);
    doc.textWithLink(pdfSafe(label), M, y + size, { url });
    y += size * 1.4 + 2;
  };

  // Cover
  doc.setFillColor(255, 216, 77);
  doc.rect(0, 0, W, 6, 'F');
  text(input.title, 24, { bold: true, gap: 2 });
  text(`${input.items.length} reels, exported ${new Date().toLocaleDateString()} from ReelMind`, 10, { color: muted, gap: 14 });
  text(input.summary, 11, { gap: 14 });

  if (input.boardImage) {
    // The board gets a page of its own, as large as fits.
    const { w, h } = await imageSize(input.boardImage);
    doc.addPage();
    y = M;
    text('The board', 14, { bold: true, gap: 6 });
    const scale = Math.min(maxW / w, (H - y - M) / h);
    doc.addImage(input.boardImage, input.boardImage.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M, y, w * scale, h * scale);
    y += h * scale + 16;
  }

  const boardOf = new Map(input.boards.map((b) => [b.topic, b]));
  for (const [topic, list] of groupByTopic(input.items)) {
    doc.addPage();
    y = M;
    const mood = moodFor(list[0].analysis.contentType);
    doc.setFillColor(...hexToRgb(mood.color));
    doc.rect(M, y, 4, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...ink);
    doc.text(pdfSafe(topicLabel(topic)), M + 12, y + 18);
    y += 34;
    text(`${list.length} ${list.length === 1 ? 'reel' : 'reels'}`, 10, { color: muted, gap: 10 });

    const board = boardOf.get(topic);
    if (board) {
      text('Topic board', 12, { bold: true, gap: 2 });
      text(board.overview, 10.5, { gap: 6 });
      board.learningPath.forEach((s, i) => text(`${i + 1}. ${s.title}: ${s.detail}`, 10, { indent: 8, gap: 2 }));
      if (board.project.title) text(`Project: ${board.project.title}. ${board.project.goal}`, 10, { bold: true, gap: 10 });
    }

    for (const it of list) {
      const a = it.analysis;
      ensure(80);
      const m = moodFor(a.contentType);
      doc.setFillColor(...hexToRgb(m.tint));
      doc.setDrawColor(...hexToRgb(m.edge));
      doc.roundedRect(M - 6, y - 4, maxW + 12, 22, 4, 4, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(...ink);
      doc.textWithLink(pdfSafe(a.title), M, y + 11, { url: it.reel.url });
      y += 26;
      text(`${typeLabel(a.contentType)}, ${a.difficulty}${it.reel.creator ? `, @${it.reel.creator}` : ''}${it.reel.savedAt ? `, saved ${dateOf(it.reel.savedAt)}` : ''}${it.reel.practiceDone ? ', practised' : ''}`, 9, { color: muted, gap: 4 });
      text(a.summary, 10.5, { gap: 4 });
      a.keyPoints.forEach((p) => text(`- ${p}`, 10, { indent: 8, gap: 1 }));
      if (a.practiceTask.title) {
        y += 4;
        text(`Practice: ${a.practiceTask.title}`, 10.5, { bold: true, gap: 2 });
        a.practiceTask.steps.forEach((s, i) => text(`${i + 1}. ${s}`, 10, { indent: 8, gap: 1 }));
        if (a.practiceTask.code) {
          doc.setFont('courier', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(...ink);
          const lines = doc.splitTextToSize(pdfSafe(a.practiceTask.code), maxW - 16);
          for (const line of lines) {
            ensure(12);
            doc.text(line, M + 8, y + 9);
            y += 12;
          }
          y += 4;
        }
      }
      if (a.tools.length) {
        text('Tools:', 10, { bold: true, gap: 1 });
        for (const t of a.tools) (t.url ? linkText(`${t.name}: ${t.url}`, t.url, 9.5) : text(t.name, 9.5, { indent: 0, gap: 1 }));
      }
      const related = linksOf(it.reel.shortcode, input.links);
      if (related.length) text(`Connected: ${related.map((r) => input.items.find((x) => x.reel.shortcode === r.other)?.analysis.title).filter(Boolean).join('; ')}`, 9, { color: muted, gap: 4 });
      linkText('Watch on Instagram', it.reel.url, 9.5);
      y += 10;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`ReelMind  |  page ${i} of ${pages}`, M, H - 24);
  }
  return doc.output('blob');
}

// ── Word ───────────────────────────────────────────────────────────────────

export async function exportDocx(input: ExportInput): Promise<Blob> {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, ImageRun, AlignmentType } = d;
  const linkRun = (label: string, url: string) => new ExternalHyperlink({ link: url, children: [new TextRun({ text: label, style: 'Hyperlink' })] });
  const children: InstanceType<typeof Paragraph>[] = [];
  const p = (text: string, opts: { bold?: boolean; color?: string; size?: number; bullet?: boolean; numbered?: boolean } = {}) =>
    new Paragraph({
      children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size })],
      bullet: opts.bullet ? { level: 0 } : undefined,
      numbering: opts.numbered ? { reference: 'steps', level: 0 } : undefined,
      spacing: { after: 80 },
    });

  children.push(new Paragraph({ text: input.title, heading: HeadingLevel.TITLE }));
  children.push(p(`${input.items.length} reels, exported ${new Date().toLocaleDateString()} from ReelMind`, { color: '667085' }));
  input.summary.split('\n').forEach((line) => children.push(p(line)));

  if (input.boardImage) {
    const { w, h } = await imageSize(input.boardImage);
    const maxW = 620;
    const scale = Math.min(1, maxW / w);
    const data = Uint8Array.from(atob(input.boardImage.split(',')[1]), (c) => c.charCodeAt(0));
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: input.boardImage.startsWith('data:image/jpeg') ? 'jpg' : 'png', data, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } })],
      }),
    );
  }

  const boardOf = new Map(input.boards.map((b) => [b.topic, b]));
  for (const [topic, list] of groupByTopic(input.items)) {
    children.push(new Paragraph({ text: `${topicLabel(topic)} (${list.length})`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    const board = boardOf.get(topic);
    if (board) {
      children.push(new Paragraph({ text: 'Topic board', heading: HeadingLevel.HEADING_3 }));
      children.push(p(board.overview));
      board.learningPath.forEach((s, i) => children.push(p(`${i + 1}. ${s.title}: ${s.detail}`)));
      if (board.project.title) children.push(p(`Project: ${board.project.title}. ${board.project.goal}`, { bold: true }));
    }
    for (const it of list) {
      const a = it.analysis;
      const mood = moodFor(a.contentType);
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [linkRun(a.title, it.reel.url)] }));
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: typeLabel(a.contentType), bold: true, color: mood.color.slice(1) }),
            new TextRun({ text: `  ${a.difficulty}${it.reel.creator ? `, @${it.reel.creator}` : ''}${it.reel.savedAt ? `, saved ${dateOf(it.reel.savedAt)}` : ''}${it.reel.practiceDone ? ', practised' : ''}`, color: '667085' }),
          ],
          spacing: { after: 80 },
        }),
      );
      children.push(p(a.summary));
      a.keyPoints.forEach((k) => children.push(p(k, { bullet: true })));
      if (a.practiceTask.title) {
        children.push(p(`Practice: ${a.practiceTask.title}`, { bold: true }));
        a.practiceTask.steps.forEach((s, i) => children.push(p(`${i + 1}. ${s}`)));
        if (a.practiceTask.code) children.push(new Paragraph({ children: a.practiceTask.code.split('\n').flatMap((line, i) => [...(i ? [new TextRun({ break: 1 })] : []), new TextRun({ text: line, font: 'Consolas', size: 18 })]) }));
      }
      if (a.tools.length) {
        children.push(p('Tools', { bold: true }));
        a.tools.forEach((t) => children.push(new Paragraph({ bullet: { level: 0 }, children: t.url ? [linkRun(t.name, t.url), new TextRun({ text: t.note ? `: ${t.note}` : '' })] : [new TextRun(`${t.name}${t.note ? `: ${t.note}` : ''}`)] })));
      }
    }
  }

  const doc = new Document({
    creator: 'ReelMind',
    title: input.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: { config: [{ reference: 'steps', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }] }] },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

// ── Excel ──────────────────────────────────────────────────────────────────

export async function exportXlsx(input: ExportInput): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ReelMind';
  const header = (ws: import('exceljs').Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: 'FF1F2430' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } };
    row.alignment = { vertical: 'middle' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (ws.columnCount) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };
  const link = (text: string, url: string) => (url ? { text, hyperlink: url } : text);

  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ header: input.title, key: 'line', width: 120 }];
  input.summary.split('\n').forEach((line) => summary.addRow({ line }));
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getColumn(1).alignment = { wrapText: true, vertical: 'top' };

  const reels = wb.addWorksheet('Reels');
  reels.columns = [
    { header: 'Title', key: 'title', width: 42 },
    { header: 'Topic', key: 'topic', width: 18 },
    { header: 'Type', key: 'type', width: 11 },
    { header: 'Difficulty', key: 'difficulty', width: 12 },
    { header: 'Creator', key: 'creator', width: 18 },
    { header: 'Saved', key: 'saved', width: 12 },
    { header: 'Summary', key: 'summary', width: 60 },
    { header: 'Key points', key: 'points', width: 60 },
    { header: 'Practice task', key: 'practice', width: 36 },
    { header: 'Practised', key: 'done', width: 10 },
    { header: 'Tools', key: 'tools', width: 30 },
    { header: 'Instagram link', key: 'url', width: 22 },
  ];
  for (const it of input.items) {
    const a = it.analysis;
    const row = reels.addRow({
      title: link(a.title, it.reel.url),
      topic: topicLabel(a.primaryTopic),
      type: typeLabel(a.contentType),
      difficulty: a.difficulty,
      creator: it.reel.creator ? `@${it.reel.creator}` : '',
      saved: it.reel.savedAt ? new Date(it.reel.savedAt) : null,
      summary: a.summary,
      points: a.keyPoints.map((k) => `• ${k}`).join('\n'),
      practice: a.practiceTask.title,
      done: it.reel.practiceDone ? 'Yes' : 'No',
      tools: a.tools.map((t) => t.name).join(', '),
      url: link('Watch', it.reel.url),
    });
    row.alignment = { wrapText: true, vertical: 'top' };
    const mood = moodFor(a.contentType);
    row.getCell('type').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${mood.tint.slice(1).toUpperCase()}` } };
    row.getCell('type').font = { color: { argb: `FF${mood.color.slice(1).toUpperCase()}` }, bold: true };
    for (const key of ['title', 'url']) row.getCell(key).font = { color: { argb: 'FF2563EB' }, underline: true };
  }
  reels.getColumn('saved').numFmt = 'dd mmm yyyy';
  header(reels);

  const topics = wb.addWorksheet('Topics');
  topics.columns = [
    { header: 'Topic', key: 'topic', width: 24 },
    { header: 'Reels', key: 'count', width: 8 },
    { header: 'Practised', key: 'done', width: 10 },
    { header: 'Mostly', key: 'type', width: 12 },
    { header: 'Reel titles', key: 'titles', width: 90 },
  ];
  for (const [topic, list] of groupByTopic(input.items)) {
    topics.addRow({
      topic: topicLabel(topic),
      count: list.length,
      done: list.filter((i) => i.reel.practiceDone).length,
      type: typeLabel(list[0].analysis.contentType),
      titles: list.map((i) => i.analysis.title).join('\n'),
    }).alignment = { wrapText: true, vertical: 'top' };
  }
  header(topics);

  const tools = wb.addWorksheet('Tools');
  tools.columns = [
    { header: 'Tool', key: 'name', width: 28 },
    { header: 'Used in reels', key: 'count', width: 14 },
    { header: 'Link', key: 'url', width: 50 },
  ];
  for (const t of toolList(input.items)) {
    const row = tools.addRow({ name: t.name, count: t.count, url: link(t.url, t.url) });
    if (t.url) row.getCell('url').font = { color: { argb: 'FF2563EB' }, underline: true };
  }
  header(tools);

  const todo = wb.addWorksheet('Practice plan');
  todo.columns = [
    { header: 'Practice task', key: 'task', width: 44 },
    { header: 'From reel', key: 'reel', width: 44 },
    { header: 'Difficulty', key: 'level', width: 12 },
    { header: 'Done', key: 'done', width: 8 },
  ];
  for (const a of actions(input.items, 500)) {
    const row = todo.addRow({ task: a.text, reel: link(a.item.analysis.title, a.item.reel.url), level: a.item.analysis.difficulty, done: '' });
    row.getCell('reel').font = { color: { argb: 'FF2563EB' }, underline: true };
  }
  header(todo);

  if (input.links.length) {
    const ls = wb.addWorksheet('Connections');
    ls.columns = [
      { header: 'Reel', key: 'a', width: 44 },
      { header: 'Connected to', key: 'b', width: 44 },
      { header: 'Why', key: 'why', width: 26 },
    ];
    const byId = new Map(input.items.map((i) => [i.reel.shortcode, i]));
    for (const l of input.links) {
      const A = byId.get(l.a);
      const B = byId.get(l.b);
      if (A && B) ls.addRow({ a: A.analysis.title, b: B.analysis.title, why: l.reason });
    }
    header(ls);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export { takeaways };
