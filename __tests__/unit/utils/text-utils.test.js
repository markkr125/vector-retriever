const { generateDocumentHash, simpleHash } = require('../../../utils/text-utils');

describe('text-utils (unit)', () => {
  test('generateDocumentHash falls back to filename when no cloud identifiers', () => {
    expect(generateDocumentHash('a.txt')).toBe(simpleHash('a.txt'));
  });

  test('generateDocumentHash prefers s3Key over filename', () => {
    expect(generateDocumentHash('a.txt', 'folder/a.txt')).toBe(simpleHash('folder/a.txt'));
  });

  test('generateDocumentHash prefers driveId over s3Key and filename', () => {
    expect(generateDocumentHash('a.txt', 'folder/a.txt', 'drive-file-id-123')).toBe(simpleHash('drive-file-id-123'));
  });
});
