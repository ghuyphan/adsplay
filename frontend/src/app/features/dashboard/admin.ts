import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ApiService, Video } from '../../services/api.service';
import { ThemeToggle } from '../../shared/ui/theme-toggle/theme-toggle';
import { VideoList } from './components/video-list/video-list';
import { ProfileManager } from './components/profile-manager/profile-manager';
import { ConfirmModal } from '../../shared/ui/confirm-modal/confirm-modal';
import { DashboardStore, SaveProfilePayload } from './dashboard.store';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, VideoList, ProfileManager, ThemeToggle, ConfirmModal],
  providers: [DashboardStore],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  readonly store = inject(DashboardStore);
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);
  readonly playerUrl = computed(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const url = new URL(window.location.origin);
    const localIp = this.store.systemInfo()?.localIps?.[0];
    if (localIp) {
      url.hostname = localIp;
    }

    return `${url.origin}/player`;
  });

  activeTab: 'videos' | 'profiles' = 'videos';
  isMobileMenuOpen = signal(false);
  videoDeletingId = signal<string | null>(null);
  previewingVideo = signal<Video | null>(null);
  copySuccess = signal(false);

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: BeforeUnloadEvent) {
    if (this.store.isUploading()) {
      $event.preventDefault();
      $event.returnValue = true;
    }
  }

  ngOnInit() {
    this.store.initialize();
  }

  onLogout() {
    this.authService.logout();
  }

  onUpload(file: File) {
    this.store.uploadMedia(file);
  }

  requestDeleteVideo(id: string) {
    this.videoDeletingId.set(id);
  }

  openPreview(video: Video) {
    this.previewingVideo.set(video);
  }

  closePreview() {
    this.previewingVideo.set(null);
  }

  confirmDeleteVideo() {
    const id = this.videoDeletingId();
    if (!id) {
      return;
    }

    this.videoDeletingId.set(null);
    this.store.deleteVideo(id);
  }

  cancelDeleteVideo() {
    this.videoDeletingId.set(null);
  }

  onSaveProfile(payload: SaveProfilePayload) {
    this.store.saveProfile(payload);
  }

  onDeleteProfile(id: string) {
    this.store.deleteProfile(id);
  }

  copyUrl() {
    const url = this.playerUrl();
    if (!url) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => this.showCopySuccess());
      return;
    }

    this.fallbackCopyTextToClipboard(url);
  }

  getDeleteVideoMessage() {
    const id = this.videoDeletingId();
    return id ? this.store.getVideoDeleteMessage(id) : 'Xóa nội dung?';
  }

  isImagePreview() {
    return this.previewingVideo()?.mediaType === 'image';
  }

  getPreviewUrl() {
    const video = this.previewingVideo();
    return video ? this.api.getMediaStreamUrl(video) : '';
  }

  getPreviewTypeLabel() {
    return this.isImagePreview() ? 'Ảnh' : 'Video';
  }

  getPreviewSizeLabel() {
    const video = this.previewingVideo();
    return video ? `${(video.size / 1024 / 1024).toFixed(2)} MB` : '';
  }

  getPreviewStatusLabel() {
    const video = this.previewingVideo();
    if (!video) {
      return '';
    }

    if (video.mediaType === 'image') {
      return 'Ảnh sẵn sàng';
    }

    if (video.processingStatus === 'processing') {
      return 'Đang tối ưu';
    }

    if (video.processingStatus === 'pending') {
      return 'Đang xếp hàng';
    }

    return video.streamVariant === 'optimized' ? 'Sẵn sàng HD' : 'Sẵn sàng bản gốc';
  }

  formatPreviewUploadedAt() {
    const video = this.previewingVideo();
    return video ? new Date(video.uploadedAt).toLocaleString() : '';
  }

  private fallbackCopyTextToClipboard(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    this.showCopySuccess();
  }

  private showCopySuccess() {
    this.copySuccess.set(true);
    window.setTimeout(() => this.copySuccess.set(false), 2000);
  }
}
