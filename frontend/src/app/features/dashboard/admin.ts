import { Component, OnInit, OnDestroy, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { ApiService, Video, Profile } from '../../services/api.service';
import { Button } from '../../shared/ui/button/button';
import { ThemeToggle } from '../../shared/ui/theme-toggle/theme-toggle';
import { VideoList } from './components/video-list/video-list';
import { ProfileManager } from './components/profile-manager/profile-manager';
import { ConfirmModal } from '../../shared/ui/confirm-modal/confirm-modal';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, VideoList, ProfileManager, ThemeToggle, ConfirmModal],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit, OnDestroy {
  activeTab: 'videos' | 'profiles' = 'videos';
  isMobileMenuOpen = signal<boolean>(false);
  videos = signal<Video[]>([]);
  profiles = signal<Profile[]>([]);
  loading = signal(false);
  isUploading = signal(false);
  uploadProgress = signal(0); // Add progress signal

  // Modal State
  videoDeletingId = signal<string | null>(null);

  // Mock Logic for dashboard widgets
  isSystemOnline = signal(true);
  systemInfo = signal<{ uptime: number; localIps: string[] } | null>(null);
  playerUrl = signal('');

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    if (this.isUploading()) {
      $event.returnValue = 'Đang tải video lên. Hành động này sẽ hủy quá trình tải lên. Bạn có chắc chắn muốn rời khỏi trang này?';
    }
  }

  constructor(private api: ApiService) { }

  ngOnInit() {
    this.refreshData();
    this.startStatusPolling();

    if (typeof window !== 'undefined') {
      this.playerUrl.set(`${window.location.origin}/player`);
    }
  }

  ngOnDestroy() {
    if (this.statusInterval) clearInterval(this.statusInterval);
  }

  private statusInterval: any;
  startStatusPolling() {
    // Initial check
    this.checkSystemStatus();
    // Poll every 30 seconds
    this.statusInterval = setInterval(() => {
      this.checkSystemStatus();
    }, 30000);
  }

  checkSystemStatus() {
    this.api.getSystemStatus().subscribe({
      next: (status) => {
        this.isSystemOnline.set(status.online);
        this.systemInfo.set({ uptime: status.uptime, localIps: status.localIps });
      },
      error: () => {
        this.isSystemOnline.set(false);
      }
    });
  }

  refreshData() {
    this.loading.set(true);
    this.api.getVideos().subscribe({
      next: (v) => {
        this.videos.set(v);
        this.checkLoading();
      },
      error: () => this.checkLoading()
    });
    this.api.getProfiles().subscribe({
      next: (p) => {
        this.profiles.set(p);
        this.checkLoading();
      },
      error: () => this.checkLoading()
    });
  }

  private loadCount = 0;
  private checkLoading() {
    this.loadCount++;
    if (this.loadCount >= 2) {
      this.loading.set(false);
      this.loadCount = 0;
    }
  }

  onUpload(file: File) {
    this.isUploading.set(true);
    this.uploadProgress.set(0); // Reset progress

    this.api.uploadVideo(file).subscribe({
      next: (event: HttpEvent<any>) => {
        if (event.type === HttpEventType.UploadProgress) {
          if (event.total) {
            const percentDone = Math.round(100 * event.loaded / event.total);
            this.uploadProgress.set(percentDone);
          }
        } else if (event.type === HttpEventType.Response) {
          // Upload complete
          this.isUploading.set(false);
          this.uploadProgress.set(0);
          this.refreshData();
        }
      },
      error: (err) => {
        console.error('Upload failed', err);
        this.isUploading.set(false);
        this.uploadProgress.set(0);
        // We don't necessarily clear loading here if refresh finishes it,
        // but it's safe to turn it off if it was just blockading UI.
      }
    });
  }

  onDeleteVideo(id: string) {
    // Open Confirmation Modal instead of immediate delete
    this.videoDeletingId.set(id);
  }

  confirmDeleteVideo() {
    const id = this.videoDeletingId();
    if (id) {
      this.api.deleteVideo(id).subscribe(() => {
        this.refreshData();
        this.videoDeletingId.set(null);
      });
    }
  }

  cancelDeleteVideo() {
    this.videoDeletingId.set(null);
  }

  copyUrl() {
    navigator.clipboard.writeText(this.playerUrl());
    // Could add toast here
  }
}
