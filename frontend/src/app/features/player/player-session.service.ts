import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, PlayerProfile, PlayerProfileSummary, Video } from '../../services/api.service';

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
  readonly localVideoUrl = signal('');
  readonly statusMessage = signal<string | null>(null);

  private containerElement: HTMLDivElement | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private currentObjectUrl: string | null = null;
  private activityTimeout: number | null = null;
  private heartbeatInterval: number | null = null;
  private autoReloadInterval: number | null = null;
  private playlistSyncInterval: number | null = null;
  private endedSafetyTimeout: number | null = null;
  private heartbeatFailures = 0;
  private isPlaylistUpdated = false;
  private activeLoadToken = 0;
  private playerAccessToken: string | null = null;
  private readonly prefetchingUrls = new Set<string>();

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

  private readonly onNetworkRestoreBound = () => {
    this.zone.run(() => {
      this.statusMessage.set('Kết nối đã phục hồi. Đang đồng bộ lại playlist.');
    });
    this.heartbeatFailures = 0;
    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }
    this.triggerManualSync();
  };

  private readonly onNetworkLostBound = () => {
    this.zone.run(() => {
      this.statusMessage.set('Mất kết nối tới máy chủ. Player sẽ tiếp tục phát nếu dữ liệu đã cache.');
    });
  };

  initialize() {
    this.isFullscreen.set(!!document.fullscreenElement);

    this.zone.runOutsideAngular(() => {
      document.addEventListener('fullscreenchange', this.onFullscreenChangeBound);
      document.addEventListener('mousemove', this.onMouseMoveBound);
      document.addEventListener('click', this.onMouseMoveBound);
      window.addEventListener('online', this.onNetworkRestoreBound);
      window.addEventListener('offline', this.onNetworkLostBound);
    });

    this.autoReloadInterval = window.setInterval(() => {
      if (!document.fullscreenElement) {
        window.location.reload();
      }
    }, 24 * 60 * 60 * 1000);

    this.resetActivityTimer();
  }

  destroy() {
    document.removeEventListener('fullscreenchange', this.onFullscreenChangeBound);
    document.removeEventListener('mousemove', this.onMouseMoveBound);
    document.removeEventListener('click', this.onMouseMoveBound);
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

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement.load();
    }
  }

  attachVideoElement(element: HTMLVideoElement | null) {
    this.videoElement = element;
  }

  attachContainerElement(element: HTMLDivElement | null) {
    this.containerElement = element;
  }

  handleRoute(profileSlug?: string, playerAccessToken?: string | null) {
    this.playerAccessToken = playerAccessToken || null;

    if (profileSlug) {
      this.loadProfileBySlug(profileSlug);
      return;
    }

    this.stopHeartbeat(true);
    this.stopPlaylistSync();
    this.profile.set(null);
    this.showUnmuteOverlay.set(false);
    this.releaseCurrentObjectUrl();
    this.localVideoUrl.set('');
    this.statusMessage.set(null);
    this.loadAllProfiles();
  }

  selectProfile(profile: PlayerProfileSummary) {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
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
    this.playVideo();
  }

  onVideoError() {
    this.statusMessage.set('Không tải được video hiện tại. Đang chuyển sang mục tiếp theo.');
    this.onVideoEnded();
  }

  interact() {
    this.unmuteAndPlay();
    if (!this.isFullscreen()) {
      this.toggleFullscreen();
    }
  }

  toggleFullscreen() {
    const elem = this.containerElement;
    if (!elem) {
      return;
    }

    if (!document.fullscreenElement) {
      elem.requestFullscreen?.();
      return;
    }

    document.exitFullscreen?.();
  }

  backToSelection() {
    this.stopHeartbeat(true);
    this.stopPlaylistSync();
    this.playerAccessToken = null;
    this.profile.set(null);
    this.showUnmuteOverlay.set(false);
    this.releaseCurrentObjectUrl();
    this.localVideoUrl.set('');
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
      error: () => {
        this.heartbeatFailures += 1;
        if (this.heartbeatFailures >= 5) {
          this.stopHeartbeat();
          this.statusMessage.set('Không gửi được heartbeat. Đang tạm dừng đồng bộ nền.');
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
    const loadToken = ++this.activeLoadToken;

    if (!this.shouldCacheVideo(video)) {
      this.releaseCurrentObjectUrl();
      this.localVideoUrl.set(serverUrl);
      this.statusMessage.set(video.processingStatus === 'ready' ? null : 'Video đang được xử lý, đang phát trực tiếp từ server.');
      void this.prefetchUpcomingVideo(index);
      return;
    }

    try {
      const cache = await caches.open('adsplay-video-cache');
      let response = await cache.match(serverUrl);

      if (!response) {
        response = await fetch(serverUrl);
        if (!response.ok) {
          this.statusMessage.set('Video đã bị gỡ khỏi server. Đang đồng bộ lại playlist.');
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
      this.localVideoUrl.set(this.currentObjectUrl);
      this.statusMessage.set(null);
      void this.prefetchUpcomingVideo(index);
    } catch {
      if (loadToken !== this.activeLoadToken) {
        return;
      }

      this.releaseCurrentObjectUrl();
      this.localVideoUrl.set(serverUrl);
      this.statusMessage.set('Đang phát trực tiếp từ server vì cache không khả dụng.');
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
      this.statusMessage.set('Không thể dọn dẹp cache cục bộ lúc này.');
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
        this.statusMessage.set('Trình duyệt yêu cầu chạm một lần để bật âm thanh.');
      } catch {
        this.statusMessage.set('Không thể tự động phát video này.');
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
    this.statusMessage.set(null);
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

  private next() {
    const activeProfile = this.profile();
    if (!activeProfile?.videos?.length) {
      this.backToSelection();
      return;
    }

    if (this.isPlaylistUpdated) {
      this.isPlaylistUpdated = false;
      this.currentVideoIndex.set(0);
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
