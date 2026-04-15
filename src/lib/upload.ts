/* ═══════════════════════════════════════════════════════════
   Document Upload & Text Extraction
   PDF.js · Mammoth.js · Tesseract.js · Clipboard
   ═══════════════════════════════════════════════════════════ */

import { db } from './db';

/* ─── Types ─── */

export interface ExtractionResult {
  text: string;
  title: string;
  mimeType: string;
  filename: string;
}

export type ProgressCallback = (pct: number, label: string) => void;

/* ─── Supported Types ─── */

const PDF_TYPES = ['application/pdf'];
const DOCX_TYPES = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'text/html'];

export function getSupportedExtensions(): string[] {
  return ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.txt', '.md', '.csv', '.html'];
}

export function isSupportedFile(file: File): boolean {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return getSupportedExtensions().includes(ext);
}

function detectMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html',
  };
  return map[ext] || 'application/octet-stream';
}

/* ─── PDF Extraction ─── */

async function extractPdf(file: File, onProgress?: ProgressCallback): Promise<string> {
  onProgress?.(5, 'Loading PDF library…');
  const pdfjsLib = await import('pdfjs-dist');

  // Use bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  onProgress?.(10, 'Parsing PDF…');
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const totalPages = pdf.numPages;
  const parts: string[] = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(10 + Math.round((i / totalPages) * 80), `Extracting page ${i}/${totalPages}…`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    if (pageText.trim()) parts.push(pageText.trim());
  }

  onProgress?.(95, 'Done');
  return parts.join('\n\n');
}

/* ─── DOCX Extraction ─── */

async function extractDocx(file: File, onProgress?: ProgressCallback): Promise<string> {
  onProgress?.(10, 'Loading DOCX parser…');
  const mammoth = await import('mammoth');

  onProgress?.(30, 'Converting to markdown…');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  // Simple HTML → markdown conversion
  onProgress?.(80, 'Converting HTML to markdown…');
  const md = htmlToMarkdown(html);
  onProgress?.(95, 'Done');
  return md;
}

function htmlToMarkdown(html: string): string {
  let md = html;
  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  // Bold & italic
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
  // Lists
  md = md.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?[ou]l[^>]*>/gi, '\n');
  // Paragraphs & breaks
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  // Links
  md = md.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, '');
  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

/* ─── OCR (Tesseract.js) ─── */

async function extractImageOCR(file: File, onProgress?: ProgressCallback): Promise<string> {
  onProgress?.(5, 'Loading OCR engine…');
  const Tesseract = await import('tesseract.js');

  onProgress?.(15, 'Recognizing text…');
  const result = await Tesseract.recognize(file, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(15 + Math.round(m.progress * 75), `OCR: ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  onProgress?.(95, 'Done');
  return result.data.text.trim();
}

/* ─── Plain Text ─── */

async function extractText(file: File, onProgress?: ProgressCallback): Promise<string> {
  onProgress?.(50, 'Reading file…');
  const text = await file.text();
  onProgress?.(95, 'Done');
  return text;
}

/* ─── Main Extract Function ─── */

export async function extractFromFile(file: File, onProgress?: ProgressCallback): Promise<ExtractionResult> {
  const mime = detectMimeType(file);
  const filename = file.name;
  const title = filename.replace(/\.[^.]+$/, '');

  let text: string;

  if (PDF_TYPES.includes(mime)) {
    text = await extractPdf(file, onProgress);
  } else if (DOCX_TYPES.includes(mime)) {
    text = await extractDocx(file, onProgress);
  } else if (IMAGE_TYPES.includes(mime)) {
    text = await extractImageOCR(file, onProgress);
  } else if (TEXT_TYPES.includes(mime)) {
    text = await extractText(file, onProgress);
  } else {
    throw new Error(`Unsupported file type: ${mime}`);
  }

  onProgress?.(100, 'Complete');
  return { text, title, mimeType: mime, filename };
}

/* ─── Attachment Storage ─── */

export async function saveAttachment(
  noteId: number,
  file: File,
  extractedText: string | null,
): Promise<number> {
  return await db.attachments.add({
    noteId,
    filename: file.name,
    mimeType: detectMimeType(file),
    size: file.size,
    data: file,
    providerFileId: null,
    extractedText,
    created: Date.now(),
  }) as number;
}

export async function getAttachments(noteId: number) {
  return db.attachments.where('noteId').equals(noteId).toArray();
}

export async function deleteAttachment(id: number) {
  await db.attachments.delete(id);
}

/* ─── Clipboard Paste Handler ─── */

export async function handleClipboardPaste(
  e: ClipboardEvent,
  onProgress?: ProgressCallback,
): Promise<ExtractionResult | null> {
  const items = e.clipboardData?.items;
  if (!items) return null;

  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (!file) continue;
      const mime = file.type;
      if (IMAGE_TYPES.includes(mime)) {
        return extractFromFile(file, onProgress);
      }
    }
  }
  return null;
}
