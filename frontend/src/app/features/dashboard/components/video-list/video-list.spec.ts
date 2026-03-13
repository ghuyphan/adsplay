import { VideoList } from './video-list';
import { Video } from '../../../../services/api.service';

const video = (partial: Partial<Video>): Video => ({
  createdAt: '2026-03-10T00:00:00.000Z',
  filename: 'file.mp4',
  id: '1',
  mediaType: 'video',
  originalName: 'Promo.mp4',
  processingStatus: 'ready',
  sourceFilename: 'file.mp4',
  sourceSize: 100,
  size: 100,
  streamVariant: 'original',
  updatedAt: '2026-03-10T00:00:00.000Z',
  uploadedAt: '2026-03-10T00:00:00.000Z',
  ...partial,
});

describe('VideoList', () => {
  it('filters by query and sorts by usage count', () => {
    const component = new VideoList();
    component.videos = [
      video({ filename: 'promo-a.mp4', id: '1', originalName: 'Promo A', usageCount: 2 }),
      video({ filename: 'promo-b.mp4', id: '2', originalName: 'Seasonal', usageCount: 5 }),
      video({ filename: 'menu.mp4', id: '3', originalName: 'Menu Board', usageCount: 1 }),
    ];

    component.query = 'promo';
    component.sortBy = 'most-used';

    expect(component.filteredVideos.map((item) => item.id)).toEqual(['2', '1']);
  });

  it('rejects files that exceed the current upload limit', () => {
    const component = new VideoList();
    component.maxUploadSizeBytes = 500 * 1024 * 1024;
    const oversizedFile = new File([new Uint8Array(1)], 'large.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversizedFile, 'size', { value: 600 * 1024 * 1024 });

    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [oversizedFile] });

    component.onFileSelected({ target: input } as unknown as Event);

    expect(component.uploadError).toContain('0.5 GB');
  });
});
