// A Word document for one Library category.
import { CATEGORIES, contentOf, type AssetItem, type AssetKind } from './assets';
import type { AssetEdit } from './types';

export async function categoryDocx(kind: AssetKind, items: AssetItem[], edits: Map<string, AssetEdit>): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, BorderStyle, ShadingType } = await import('docx');
  const cat = CATEGORIES.find((c) => c.kind === kind)!;
  const link = (label: string, url: string) => new ExternalHyperlink({ link: url, children: [new TextRun({ text: label, style: 'Hyperlink' })] });
  const code = (text: string) =>
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: 'F4F5F7', color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D0D5DD', space: 6 } },
      spacing: { after: 120 },
      children: text.split('\n').flatMap((line, i) => [...(i ? [new TextRun({ break: 1 })] : []), new TextRun({ text: line || ' ', font: 'Consolas', size: 18 })]),
    });
  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: `${cat.label} from my saved reels`, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `${items.length} ${items.length === 1 ? cat.one : `${cat.one}s`}, exported ${new Date().toLocaleDateString()} from ReelMind. ${cat.hint}`, color: '667085' })], spacing: { after: 200 } }),
  ];
  for (const it of items) {
    if (kind === 'tool') {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [it.url ? link(it.title, it.url) : new TextRun({ text: it.title, bold: true }), new TextRun({ text: `: ${it.subtitle}` })],
        }),
      );
      continue;
    }
    children.push(new Paragraph({ text: it.title, heading: HeadingLevel.HEADING_2 }));
    if (it.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: it.subtitle, italics: true, color: '475467' })], spacing: { after: 100 } }));
    children.push(code(contentOf(it, edits).trimEnd()));
    const s = it.sources[0];
    children.push(new Paragraph({ children: [new TextRun({ text: 'From: ', color: '667085' }), link(s.title, s.url), new TextRun({ text: s.creator ? ` by @${s.creator}` : '', color: '667085' })], spacing: { after: 240 } }));
  }
  const doc = new Document({
    creator: 'ReelMind',
    title: cat.label,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}
