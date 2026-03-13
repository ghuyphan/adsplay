import { ProfileManager } from './profile-manager';
import { Profile, Video } from '../../../../services/api.service';

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

const profile = (partial: Partial<Profile>): Profile => ({
  createdAt: '2026-03-10T00:00:00.000Z',
  id: 'profile-1',
  name: 'Lobby',
  playerAccessToken: 'player-token',
  slug: 'lobby',
  updatedAt: '2026-03-10T00:00:00.000Z',
  videoIds: ['1'],
  ...partial,
});

describe('ProfileManager', () => {
  it('emits save payload for a valid playlist', () => {
    const component = new ProfileManager();
    const emitted: unknown[] = [];

    component.videos = [video({ id: 'video-1' })];
    component.saveProfile.subscribe((payload) => emitted.push(payload));
    component.openCreate();
    component.profileName = 'Main Lobby';
    component.addToPlaylist(component.videos[0]);

    component.save();

    expect(emitted).toEqual([
      {
        id: undefined,
        name: 'Main Lobby',
        videoIds: ['video-1'],
      },
    ]);
  });

  it('blocks duplicate slug collisions before emitting', () => {
    const component = new ProfileManager();

    component.profiles = [profile({ id: 'profile-1', name: 'Lobby Screen' })];
    component.videos = [video({ id: 'video-1' })];
    component.openCreate();
    component.profileName = 'Lobby   Screen';
    component.addToPlaylist(component.videos[0]);

    component.save();

    expect(component.formError).toContain('slug');
  });

  it('builds a dedicated legacy player URL for old TVs', () => {
    const component = new ProfileManager();
    component.localIps = ['192.168.1.25'];

    const cleanUrl = new URL(component.getLegacyPlayerUrl(profile({
      name: 'Lobby Screen',
      playerAccessToken: 'legacy-token',
      slug: 'lobby-screen',
    })));
    const pairingUrl = new URL(component.getLegacyPlayerPairingUrl(profile({
      name: 'Lobby Screen',
      playerAccessToken: 'legacy-token',
      slug: 'lobby-screen',
    })));

    expect(cleanUrl.hostname).toBe('192.168.1.25');
    expect(cleanUrl.pathname).toBe('/player-legacy/lobby-screen');
    expect(cleanUrl.searchParams.get('token')).toBeNull();

    expect(pairingUrl.pathname).toBe('/player-legacy/lobby-screen');
    expect(pairingUrl.searchParams.get('token')).toBe('legacy-token');
  });
});
