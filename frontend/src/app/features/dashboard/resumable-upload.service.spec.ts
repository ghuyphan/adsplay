import { buildUploadFileKey } from './resumable-upload.service';

describe('buildUploadFileKey', () => {
  it('creates a stable, client-scoped key from file identity fields', () => {
    const file = new File(['hello'], 'promo.mp4', { type: 'video/mp4', lastModified: 12345 });
    Object.defineProperty(file, 'lastModified', { value: 12345 });
    Object.defineProperty(file, 'size', { value: 5 });

    const firstKey = buildUploadFileKey(file, 'client-123');
    const secondKey = buildUploadFileKey(file, 'client-123');

    expect(firstKey).toBe(secondKey);
    expect(firstKey.startsWith('client-123:')).toBe(true);
  });
});
