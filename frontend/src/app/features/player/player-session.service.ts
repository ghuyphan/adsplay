import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, PlayerProfile, PlayerProfileSummary, Video } from '../../services/api.service';

interface PlaybackSource {
  hlsUrl: string | null;
  loadToken: number;
  mp4Url: string;
  posterUrl: string;
}

const PLAYER_TOKEN_STORAGE_PREFIX = 'adsplay-player-token:';

@Injectable()
export class PlayerSessionService {
  private static readonly MAX_CACHEABLE_VIDEO_BYTES = 120 * 1024 * 1024;
  private static readonly MAX_PREFETCH_VIDEO_BYTES = 80 * 1024 * 1024;

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  readonly isFullscreen = signal(false);
  readonly profile = signal<PlayerProfile | null>(null);
  readonly allProfiles = signal<PlayerProfileSummary[]>([]);
  readonly currentVideoIndex = signal(0);
  readonly loading = signal(true);
  readonly showUnmuteOverlay = signal(false);
  readonly isCursorHidden = signal(false);
  readonly isVideoPortrait = signal(false);
  readonly currentVideoPosterUrl = signal('');
  readonly localVideoUrl = signal('');
  readonly statusMessage = signal<string | null>(null);

  private containerElement: HTMLDivElement | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private currentObjectUrl: string | null = null;
  private activityTimeout: number | null = null;
  private heartbeatInterval: number | null = null;
  private hlsInstance: {
    attachMedia(media: HTMLMediaElement): void;
    destroy(): void;
    loadSource(source: string): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
  } | null = null;
  private autoReloadInterval: number | null = null;
  private playlistSyncInterval: number | null = null;
  private endedSafetyTimeout: number | null = null;
  private heartbeatFailures = 0;
  private isPlaylistUpdated = false;
  private activeLoadToken = 0;
  private activePlayback: PlaybackSource | null = null;
  private activePlaybackMode: 'hls' | 'mp4' | null = null;
  private hasTriedMp4Fallback = false;
  private pendingPlayback: PlaybackSource | null = null;
  private playerAccessToken: string | null = null;
  private readonly prefetchingUrls = new Set<string>();
  private hlsLibraryPromise: Promise<typeof import('hls.js').default> | null = null;

  private readonly onFullscreenChangeBound = () => {
    this.zone.run(() => {
      const isFullscreen = !!document.fullscreenElement;
      this.isFullscreen.set(isFullscreen);
      if (!isFullscreen && this.profile()) {
        this.isCursorHidden.set(false);
      }
    });
  };

  private readonly onMouseMoveBound = () => {
    this.resetActivityTimer();
  };

  private readonly onUserGestureBound = (event: Event) => {
    if (!this.profile()) {
      return;
    }

    if (event instanceof KeyboardEvent && !this.isActivationKey(event)) {
      return;
    }

    this.zone.run(() => {
      this.handleInteractionGesture();
    });
  };

  private readonly onNetworkRestoreBound = () => {
    this.heartbeatFailures = 0;
    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }
    this.triggerManualSync();
  };

  private readonly onNetworkLostBound = () => undefined;

  initialize() {
    this.isFullscreen.set(!!document.fullscreenElement);

    this.zone.runOutsideAngular(() => {
      document.addEventListener('fullscreenchange', this.onFullscreenChangeBound);
      document.addEventListener('mousemove', this.onMouseMoveBound);
      document.addEventListener('click', this.onMouseMoveBound);
      document.addEventListener('click', this.onUserGestureBound);
      document.addEventListener('touchend', this.onUserGestureBound);
      document.addEventListener('keydown', this.onUserGestureBound);
      window.addEventListener('online', this.onNetworkRestoreBound);
      window.addEventListener('offline', this.onNetworkLostBound);
    });

    this.autoReloadInterval = window.setInterval(() => {
      if (!this.profile()) {
        window.location.reload();
      }
    }, 24 * 60 * 60 * 1000);

    this.resetActivityTimer();
  }

  destroy() {
    document.removeEventListener('fullscreenchange', this.onFullscreenChangeBound);
    document.removeEventListener('mousemove', this.onMouseMoveBound);
    document.removeEventListener('click', this.onMouseMoveBound);
    document.removeEventListener('click', this.onUserGestureBound);
    document.removeEventListener('touchend', this.onUserGestureBound);
    document.removeEventListener('keydown', this.onUserGestureBound);
    window.removeEventListener('online', this.onNetworkRestoreBound);
    window.removeEventListener('offline', this.onNetworkLostBound);

    this.stopHeartbeat();
    if (this.activityTimeout) {
      window.clearTimeout(this.activityTimeout);
    }
    if (this.autoReloadInterval) {
      window.clearInterval(this.autoReloadInterval);
    }
    this.stopPlaylistSync();
    if (this.endedSafetyTimeout) {
      window.clearTimeout(this.endedSafetyTimeout);
    }

    if (this.currentObjectUrl) {
      this.releaseCurrentObjectUrl();
    }

    this.destroyHls();

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement.load();
    }
  }

  attachVideoElement(element: HTMLVideoElement | null) {
    if (this.videoElement === element) {
      return;
    }

    this.destroyHls();
    this.videoElement = element;

    if (element && this.pendingPlayback) {
      void this.applyPlayback(this.pendingPlayback);
    }
  }

  attachContainerElement(element: HTMLDivElement | null) {
    this.containerElement = element;
  }

  handleRoute(profileSlug?: string, playerAccessToken?: string | null) {
    this.playerAccessToken = profileSlug
      ? this.resolvePlayerAccessToken(profileSlug, playerAccessToken)
      : null;

    if (profileSlug) {
      this.loadProfileBySlug(profileSlug);
      return;
    }

    this.stopHeartbeat(true);
    this.stopPlaylistSync();
    this.profile.set(null);
    this.showUnmuteOverlay.set(false);
    this.currentVideoPosterUrl.set('');
    this.releaseCurrentObjectUrl();
    this.localVideoUrl.set('');
    this.statusMessage.set(null);
    this.pendingPlayback = null;
    this.activePlayback = null;
    this.destroyHls();
    this.loadAllProfiles();
  }

  selectProfile(profile: PlayerProfileSummary) {
    this.requestFullscreenIfNeeded();
    void this.router.navigate(['/player', profile.slug]);
  }

  onVideoEnded() {
    if (this.endedSafetyTimeout) {
      window.clearTimeout(this.endedSafetyTimeout);
    }
    this.next();
  }

  onMetadataLoaded(event: Event) {
    const video = event.target as HTMLVideoElement;
    this.startEndedSafetyTimer(video.duration);
    this.isVideoPortrait.set(video.videoHeight > video.videoWidth);
    this.requestFullscreenIfNeeded();
    this.playVideo();
  }

  onVideoError() {
    if (this.activePlaybackMode === 'hls' && this.activePlayback && !this.hasTriedMp4Fallback) {
      void this.fallbackToMp4(this.activePlayback);
      return;
    }

    this.onVideoEnded();
  }

  backToSelection() {
    this.stopHeartbeat(true);
    this.stopPlaylistSync();
    this.playerAccessToken = null;
    this.profile.set(null);
    this.showUnmuteOverlay.set(false);
    this.currentVideoPosterUrl.set('');
    this.releaseCurrentObjectUrl();
    this.localVideoUrl.set('');
    this.pendingPlayback = null;
    this.activePlayback = null;
    this.destroyHls();
    void this.router.navigate(['/player']);
  }

  private resetActivityTimer() {
    if (this.isCursorHidden()) {
      this.zone.run(() => this.isCursorHidden.set(false));
    }

    if (this.activityTimeout) {
      window.clearTimeout(this.activityTimeout);
    }

    if (!this.profile()) {
      return;
    }

    this.activityTimeout = window.setTimeout(() => {
      this.zone.run(() => this.isCursorHidden.set(true));
    }, 3000);
  }

  private startHeartbeat() {
    const profile = this.profile();
    if (!profile?.slug || !this.playerAccessToken || this.heartbeatInterval) {
      return;
    }

    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeatPulse();
    }, 30000);
    this.sendHeartbeatPulse();
  }

  private startPlaylistSync() {
    this.stopPlaylistSync();

    this.playlistSyncInterval = window.setInterval(() => {
      this.triggerManualSync();
    }, 60000);
  }

  private stopHeartbeat(resetFailures = false) {
    if (this.heartbeatInterval) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (resetFailures) {
      this.heartbeatFailures = 0;
    }
  }

  private stopPlaylistSync() {
    if (this.playlistSyncInterval) {
      window.clearInterval(this.playlistSyncInterval);
      this.playlistSyncInterval = null;
    }
  }

  private sendHeartbeatPulse() {
    const profile = this.profile();
    const playerAccessToken = this.playerAccessToken;
    if (!profile?.slug || !playerAccessToken) {
      return;
    }

    this.api.sendHeartbeat(profile.slug, playerAccessToken).subscribe({
      next: () => {
        this.heartbeatFailures = 0;
      },
      error: (error: { status?: number }) => {
        if (error?.status === 400 || error?.status === 403 || error?.status === 404) {
          this.clearStoredPlayerAccessToken(profile.slug);
          this.playerAccessToken = null;
        }

        this.heartbeatFailures += 1;
        if (this.heartbeatFailures >= 5) {
          this.stopHeartbeat();
        }
      },
    });
  }

  private triggerManualSync() {
    const activeProfile = this.profile();
    if (!activeProfile?.slug) {
      return;
    }

    this.api.getProfileBySlug(activeProfile.slug).subscribe({
      next: (updatedProfile) => {
        this.heartbeatFailures = 0;
        if (!this.heartbeatInterval) {
          this.startHeartbeat();
        }

        const currentVideosHash = activeProfile.videos?.map((video) => video.id).join(',') || '';
        const newVideosHash = updatedProfile.videos?.map((video) => video.id).join(',') || '';

        if (currentVideosHash !== newVideosHash) {
          if (updatedProfile.videos) {
            void this.syncCacheWithBackend(updatedProfile.videos);
          }
          this.profile.set(updatedProfile);
          this.isPlaylistUpdated = true;
        }
      },
      error: () => undefined,
    });
  }

  private loadAllProfiles() {
    this.loading.set(true);
    this.api.getPlayerProfiles().subscribe({
      next: (profiles) => {
        this.allProfiles.set(profiles);
        this.loading.set(false);
      },
      error: () => {
        this.statusMessage.set('Không thể tải danh sách màn hình.');
        this.loading.set(false);
      },
    });
  }

  private loadProfileBySlug(profileSlug: string) {
    this.stopHeartbeat(true);
    this.stopPlaylistSync();
    this.loading.set(true);
    this.api.getProfileBySlug(profileSlug).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.currentVideoIndex.set(0);
        this.loading.set(false);
        this.statusMessage.set(null);
        this.heartbeatFailures = 0;
        this.startHeartbeat();

        if (profile.videos.length) {
          void this.syncCacheWithBackend(profile.videos);
          void this.loadAndPlayVideo(0);
        } else {
          this.currentVideoPosterUrl.set('');
          this.pendingPlayback = null;
          this.activePlayback = null;
          this.localVideoUrl.set('');
          this.statusMessage.set('Playlist hiện tại không có nội dung.');
        }

        this.startPlaylistSync();
      },
      error: () => {
        this.stopHeartbeat(true);
        this.stopPlaylistSync();
        this.loading.set(false);
        this.statusMessage.set('Không tìm thấy màn hình được yêu cầu.');
        this.profile.set(null);
        void this.router.navigate(['/player']);
      },
    });
  }

  private async loadAndPlayVideo(index: number) {
    const activeProfile = this.profile();
    if (!activeProfile?.videos?.length) {
      return;
    }

    const video = activeProfile.videos[index];
    const serverUrl = this.api.getVideoStreamUrl(video);
    const posterUrl = video.posterFilename ? this.api.getVideoPosterUrl(video) : '';
    const hlsUrl =
      video.processingStatus === 'ready' && video.hlsManifestPath
        ? this.api.getVideoHlsManifestUrl(video)
        : null;
    const loadToken = ++this.activeLoadToken;

    if (hlsUrl) {
      this.releaseCurrentObjectUrl();
      await this.applyPlayback({
        hlsUrl,
        loadToken,
        mp4Url: serverUrl,
        posterUrl,
      });
      return;
    }

    if (!this.shouldCacheVideo(video)) {
      this.releaseCurrentObjectUrl();
      await this.applyPlayback({
        hlsUrl: null,
        loadToken,
        mp4Url: serverUrl,
        posterUrl,
      });
      void this.prefetchUpcomingVideo(index);
      return;
    }

    try {
      const cache = await caches.open('adsplay-video-cache');
      let response = await cache.match(serverUrl);

      if (!response) {
        response = await fetch(serverUrl);
        if (!response.ok) {
          this.triggerManualSync();
          this.next();
          return;
        }

        try {
          await cache.put(serverUrl, response.clone());
        } catch (error) {
          if ((error as { name?: string }).name === 'QuotaExceededError') {
            await caches.delete('adsplay-video-cache');
          }
        }
      }

      const blob = await response.blob();
      if (loadToken !== this.activeLoadToken) {
        return;
      }

      this.releaseCurrentObjectUrl();
      this.currentObjectUrl = URL.createObjectURL(blob);
      await this.applyPlayback({
        hlsUrl: null,
        loadToken,
        mp4Url: this.currentObjectUrl,
        posterUrl,
      });
      void this.prefetchUpcomingVideo(index);
    } catch {
      if (loadToken !== this.activeLoadToken) {
        return;
      }

      this.releaseCurrentObjectUrl();
      await this.applyPlayback({
        hlsUrl: null,
        loadToken,
        mp4Url: serverUrl,
        posterUrl,
      });
    }
  }

  private async syncCacheWithBackend(validVideos: Video[]) {
    try {
      const cache = await caches.open('adsplay-video-cache');
      const cachedRequests = await cache.keys();
      const validUrls = new Set(
        validVideos
          .filter((video) => this.shouldCacheVideo(video))
          .map((video) => new URL(this.api.getVideoStreamUrl(video), window.location.origin).toString()),
      );

      for (const request of cachedRequests) {
        if (!validUrls.has(request.url)) {
          await cache.delete(request);
        }
      }
    } catch {
      return;
    }
  }

  private startEndedSafetyTimer(duration: number) {
    if (this.endedSafetyTimeout) {
      window.clearTimeout(this.endedSafetyTimeout);
    }

    if (!duration || Number.isNaN(duration)) {
      return;
    }

    this.endedSafetyTimeout = window.setTimeout(() => {
      if (this.videoElement && !this.videoElement.paused) {
        this.onVideoEnded();
      }
    }, (duration + 2) * 1000);
  }

  private async playVideo() {
    if (!this.videoElement) {
      return;
    }

    try {
      this.videoElement.muted = false;
      await this.videoElement.play();
      this.showUnmuteOverlay.set(false);
    } catch {
      this.videoElement.muted = true;
      try {
        await this.videoElement.play();
        this.showUnmuteOverlay.set(true);
      } catch {
        this.showUnmuteOverlay.set(true);
      }
    }
  }

  private unmuteAndPlay() {
    if (!this.videoElement) {
      return;
    }

    this.videoElement.muted = false;
    void this.videoElement.play();
    this.showUnmuteOverlay.set(false);
  }

  private handleInteractionGesture() {
    this.unmuteAndPlay();
    this.requestFullscreenIfNeeded();
  }

  private isActivationKey(event: KeyboardEvent) {
    return (
      event.key === 'Enter' ||
      event.key === 'NumpadEnter' ||
      event.key === ' ' ||
      event.key === 'Spacebar' ||
      event.key === 'MediaPlay' ||
      event.key === 'MediaPlayPause' ||
      event.key === 'Select' ||
      event.key === 'Accept' ||
      event.key === 'OK' ||
      event.code === 'Enter' ||
      event.code === 'NumpadEnter' ||
      event.keyCode === 13 ||
      event.keyCode === 23 ||
      event.keyCode === 32
    );
  }

  private requestFullscreenIfNeeded() {
    if (document.fullscreenElement) {
      return;
    }

    const target = this.containerElement;
    if (target?.requestFullscreen) {
      try {
        target.requestFullscreen().catch(() => undefined);
        return;
      } catch {
        // Fall back to video fullscreen on WebKit-based browsers.
      }
    }

    const video = this.videoElement as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (video && typeof video.webkitEnterFullscreen === 'function') {
      try {
        video.webkitEnterFullscreen();
      } catch {
        return;
      }
    }
  }

  private shouldCacheVideo(video: Video) {
    return (
      video.processingStatus === 'ready' &&
      video.size > 0 &&
      video.size <= PlayerSessionService.MAX_CACHEABLE_VIDEO_BYTES
    );
  }

  private async prefetchUpcomingVideo(currentIndex: number) {
    const activeProfile = this.profile();
    if (!activeProfile?.videos?.length || activeProfile.videos.length < 2) {
      return;
    }

    const nextIndex = (currentIndex + 1) % activeProfile.videos.length;
    const nextVideo = activeProfile.videos[nextIndex];

    if (
      !this.shouldCacheVideo(nextVideo) ||
      nextVideo.size > PlayerSessionService.MAX_PREFETCH_VIDEO_BYTES
    ) {
      return;
    }

    const streamUrl = this.api.getVideoStreamUrl(nextVideo);
    if (this.prefetchingUrls.has(streamUrl)) {
      return;
    }

    this.prefetchingUrls.add(streamUrl);

    try {
      const cache = await caches.open('adsplay-video-cache');
      const existing = await cache.match(streamUrl);
      if (existing) {
        return;
      }

      const response = await fetch(streamUrl);
      if (response.ok) {
        await cache.put(streamUrl, response);
      }
    } catch {
      // Background prefetch should never affect playback.
    } finally {
      this.prefetchingUrls.delete(streamUrl);
    }
  }

  private releaseCurrentObjectUrl() {
    if (!this.currentObjectUrl) {
      return;
    }

    URL.revokeObjectURL(this.currentObjectUrl);
    this.currentObjectUrl = null;
  }

  private destroyHls() {
    if (!this.hlsInstance) {
      return;
    }

    this.hlsInstance.destroy();
    this.hlsInstance = null;
  }

  private resolvePlayerAccessToken(profileSlug: string, routeToken?: string | null) {
    const normalizedRouteToken = routeToken?.trim() || '';
    if (normalizedRouteToken) {
      this.storePlayerAccessToken(profileSlug, normalizedRouteToken);
      this.stripTokenFromUrl();
      return normalizedRouteToken;
    }

    return this.getStoredPlayerAccessToken(profileSlug);
  }

  private getStoredPlayerAccessToken(profileSlug: string) {
    if (typeof localStorage === 'undefined' || !profileSlug) {
      return null;
    }

    try {
      return localStorage.getItem(`${PLAYER_TOKEN_STORAGE_PREFIX}${profileSlug}`);
    } catch {
      return null;
    }
  }

  private storePlayerAccessToken(profileSlug: string, playerAccessToken: string) {
    if (typeof localStorage === 'undefined' || !profileSlug || !playerAccessToken) {
      return;
    }

    try {
      localStorage.setItem(`${PLAYER_TOKEN_STORAGE_PREFIX}${profileSlug}`, playerAccessToken);
    } catch {
      return;
    }
  }

  private clearStoredPlayerAccessToken(profileSlug: string) {
    if (typeof localStorage === 'undefined' || !profileSlug) {
      return;
    }

    try {
      localStorage.removeItem(`${PLAYER_TOKEN_STORAGE_PREFIX}${profileSlug}`);
    } catch {
      return;
    }
  }

  private stripTokenFromUrl() {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const currentUrl = new URL(window.location.href);
      if (!currentUrl.searchParams.has('token')) {
        return;
      }

      currentUrl.searchParams.delete('token');
      const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.history.replaceState(window.history.state, document.title, nextUrl);
    } catch {
      return;
    }
  }

  private async loadHlsLibrary() {
    this.hlsLibraryPromise ??= import('hls.js').then((module) => module.default);
    return this.hlsLibraryPromise;
  }

  private async applyPlayback(playback: PlaybackSource) {
    if (playback.loadToken !== this.activeLoadToken) {
      return;
    }

    this.pendingPlayback = playback;
    this.activePlayback = playback;
    this.currentVideoPosterUrl.set(playback.posterUrl);
    this.statusMessage.set(null);
    this.hasTriedMp4Fallback = false;

    if (playback.hlsUrl) {
      if (!this.videoElement) {
        this.localVideoUrl.set('');
        this.activePlaybackMode = 'hls';
        return;
      }

      if (this.videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        this.destroyHls();
        this.activePlaybackMode = 'hls';
        this.localVideoUrl.set(playback.hlsUrl);
        this.videoElement.src = playback.hlsUrl;
        this.videoElement.load();
        return;
      }

      const Hls = await this.loadHlsLibrary().catch(() => null);
      if (Hls?.isSupported()) {
        this.destroyHls();
        this.activePlaybackMode = 'hls';
        this.localVideoUrl.set('');
        this.videoElement.removeAttribute('src');
        this.videoElement.load();

        const hlsInstance = new Hls();
        this.hlsInstance = hlsInstance;

        hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || playback.loadToken !== this.activeLoadToken) {
            return;
          }

          void this.fallbackToMp4(playback);
        });

        hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (playback.loadToken !== this.activeLoadToken) {
            return;
          }

          hlsInstance.loadSource(playback.hlsUrl as string);
        });

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          if (playback.loadToken !== this.activeLoadToken) {
            return;
          }

          void this.playVideo();
        });

        hlsInstance.attachMedia(this.videoElement);
        return;
      }
    }

    this.applyMp4Playback(playback);
  }

  private applyMp4Playback(playback: PlaybackSource) {
    this.destroyHls();
    this.activePlaybackMode = 'mp4';
    this.localVideoUrl.set(playback.mp4Url);

    if (this.videoElement) {
      this.videoElement.src = playback.mp4Url;
      this.videoElement.load();
    }
  }

  private async fallbackToMp4(playback: PlaybackSource) {
    if (this.hasTriedMp4Fallback || playback.loadToken !== this.activeLoadToken) {
      return;
    }

    this.hasTriedMp4Fallback = true;
    await this.applyPlayback({
      ...playback,
      hlsUrl: null,
    });
  }

  private next() {
    const activeProfile = this.profile();
    if (!activeProfile?.videos?.length) {
      this.backToSelection();
      return;
    }

    if (this.isPlaylistUpdated) {
      this.isPlaylistUpdated = false;
      this.currentVideoIndex.set(0);
      this.currentVideoPosterUrl.set('');
      void this.loadAndPlayVideo(0);
      return;
    }

    let nextIndex = this.currentVideoIndex() + 1;
    if (nextIndex >= activeProfile.videos.length) {
      nextIndex = 0;
    }

    if (nextIndex === this.currentVideoIndex() && activeProfile.videos.length === 1 && this.videoElement) {
      this.videoElement.currentTime = 0;
      void this.playVideo();
      return;
    }

    this.currentVideoIndex.set(nextIndex);
    void this.loadAndPlayVideo(nextIndex);
  }
}
