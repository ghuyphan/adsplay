import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Video, Profile } from '../../services/api.service';
import { Button } from '../../components/ui/button/button';
import { ThemeToggle } from '../../components/ui/theme-toggle/theme-toggle';
import { VideoList } from '../../components/video-list/video-list';
import { ProfileManager } from '../../components/profile-manager/profile-manager';
import { ConfirmModal } from '../../components/ui/confirm-modal/confirm-modal';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, VideoList, ProfileManager, ThemeToggle, ConfirmModal],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  activeTab: 'videos' | 'profiles' = 'videos';
  isMobileMenuOpen = signal<boolean>(false);
  videos = signal<Video[]>([]);
  profiles = signal<Profile[]>([]);
  loading = signal(false);

  // Modal State
  videoDeletingId = signal<string | null>(null);

  // Mock Logic for dashboard widgets
  isSystemOnline = signal(true);
  playerUrl = signal('http://localhost:8080/player');

  constructor(private api: ApiService) { }

  ngOnInit() {
    this.refreshData();
    if (typeof window !== 'undefined') {
      this.playerUrl.set(`${window.location.origin}/player`);
    }
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
    this.loading.set(true);
    this.api.uploadVideo(file).subscribe({
      next: () => this.refreshData(),
      error: (err) => {
        console.error('Upload failed', err);
        this.loading.set(false);
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
