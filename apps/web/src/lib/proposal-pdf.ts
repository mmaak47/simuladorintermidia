interface ProposalCampaign {
  id: string;
  name: string;
  client: string;
  description: string;
  status: string;
  createdAtIso: string;
}

interface ProposalItem {
  pointName: string;
  city: string;
  type: string;
  status: string;
  renderType: string;
  renderUrl: string;
}

interface ProposalData {
  campaign: ProposalCampaign;
  totals: {
    points: number;
    rendered: number;
    exported: number;
  };
  items: ProposalItem[];
}

function normalizePdfText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()\\]/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(input: string, maxChars: number): string[] {
  const text = normalizePdfText(input);
  if (!text) return [''];

  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    const candidate = `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function buildContentStream(data: ProposalData): string {
  const lines: Array<{ size: number; text: string }> = [];

  lines.push({ size: 18, text: 'Intermidia DOOH Proposal' });
  lines.push({ size: 12, text: `Campaign: ${data.campaign.name}` });
  lines.push({ size: 12, text: `Client: ${data.campaign.client || 'N/A'}` });
  lines.push({ size: 10, text: `Status: ${data.campaign.status}` });
  lines.push({ size: 10, text: `Created: ${data.campaign.createdAtIso.slice(0, 10)}` });
  lines.push({ size: 10, text: `Points: ${data.totals.points} | Rendered: ${data.totals.rendered} | Exported: ${data.totals.exported}` });
  lines.push({ size: 10, text: '' });

  if (data.campaign.description) {
    lines.push({ size: 12, text: 'Description' });
    for (const chunk of wrapText(data.campaign.description, 94)) {
      lines.push({ size: 10, text: chunk });
    }
    lines.push({ size: 10, text: '' });
  }

  lines.push({ size: 12, text: 'Point Plan' });
  if (data.items.length === 0) {
    lines.push({ size: 10, text: 'No points linked to this campaign yet.' });
  } else {
    data.items.slice(0, 22).forEach((item, idx) => {
      const base = `${idx + 1}. ${item.pointName} (${item.city || 'N/A'}) - ${item.type}`;
      const status = `   status=${item.status}, render=${item.renderType}`;
      lines.push({ size: 10, text: base });
      lines.push({ size: 9, text: status });
    });
    if (data.items.length > 22) {
      lines.push({ size: 9, text: `... plus ${data.items.length - 22} additional points` });
    }
  }

  let y = 804;
  const content: string[] = ['BT'];

  for (const line of lines) {
    y -= line.size + 4;
    if (y < 52) break;
    const text = normalizePdfText(line.text);
    content.push(`/F1 ${line.size} Tf`);
    content.push(`40 ${y} Td (${text}) Tj`);
  }

  content.push('ET');
  return content.join('\n');
}

function buildPdf(contentStream: string): Uint8Array {
  const objects: string[] = [];

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push(`5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function generateCampaignProposalPdf(data: ProposalData): Uint8Array {
  const stream = buildContentStream(data);
  return buildPdf(stream);
}

export type { ProposalData };
