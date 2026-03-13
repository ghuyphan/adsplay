import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
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
