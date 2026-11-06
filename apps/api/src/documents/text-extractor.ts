import { UnsupportedMediaTypeException } from '@nestjs/common';
import pdfParse from 'pdf-parse';

export const SUPPORTED_TYPES = ['application/pdf', 'text/plain', 'text/markdown'] as const;

/** Extracts plain text from an uploaded file. Unknown types are rejected up front. */
export async function extractText(file: { mimetype: string; originalname: string; buffer: Buffer }) {
  const type = normalizeType(file.mimetype, file.originalname);
  if (type === 'application/pdf') {
    const { text } = await pdfParse(file.buffer);
    return text;
  }
  if (type === 'text/plain' || type === 'text/markdown') {
    return file.buffer.toString('utf8');
  }
  throw new UnsupportedMediaTypeException(`Supported formats: PDF, TXT, Markdown`);
}

export function normalizeType(mimetype: string, filename: string): string {
  // Browsers often send .md as application/octet-stream; trust the extension for text formats.
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'pdf') return 'application/pdf';
  return mimetype;
}
