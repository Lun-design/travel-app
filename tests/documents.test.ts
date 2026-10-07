import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDocumentPath, isSupportedDocumentType } from '../lib/documents';

describe('document helpers', () => {
  it('builds a storage path scoped by trip and uploader', () => {
    expect(buildDocumentPath('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Boarding Pass.pdf', 'abc')).toBe('11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/abc-Boarding-Pass.pdf');
  });
  it('accepts images and PDF only', () => {
    expect(isSupportedDocumentType('application/pdf')).toBe(true);
    expect(isSupportedDocumentType('image/jpeg')).toBe(true);
    expect(isSupportedDocumentType('text/plain')).toBe(false);
  });
});

describe('document preview interactions', () => {
  it('handles a rejected external-open request instead of silently swallowing the tap', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/DocumentPreviewModal.tsx'), 'utf8');

    expect(source).toMatch(/Linking\.openURL\(url\)\.catch\(/);
    expect(source).toMatch(/Alert\.alert\(/);
  });
});
