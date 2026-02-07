import { Component, OnInit, OnDestroy, ViewChild, ElementRef, signal, computed, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, Profile, Video } from '../../services/api.service';

@Component({
  selector: 'app-player',
  imports: [CommonModule],
  templateUrl: './player.html',
  styleUrl: './player.css',
})
export class Player implements OnInit, OnDestroy {
  isFullscreen = signal(false);
  profile = signal<Profile | null>(null);
  allProfiles = signal<Profile[]>([]);
  currentVideoIndex = signal(0);
  loading = signal(true);
  showUnmuteOverlay = signal(false);

  @ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;
  @ViewChild('container') container!: ElementRef<HTMLDivElement>;

  currentVideoSrc = computed(() => {
    const p = this.profile();
    if (!p || !p.videos || p.videos.length === 0) return '';
    const video = p.videos[this.currentVideoIndex()];
    return `/uploads/${video.filename}`;
  });

  private onFullscreenChangeBound = () => {
    this.zone.run(() => {
      this.isFullscreen.set(!!document.fullscreenElement);
    });
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private zone: NgZone
  ) { }

  ngOnInit() {
    this.route.params.subscribe(params => {
      const name = params['profileName'];
      if (name) {
        this.loadProfileByName(name);
      } else {
        this.loadAllProfiles();
      }
    });

    // Initialize state immediately in case we are already in fullscreen (e.g. navigation)
    this.isFullscreen.set(!!document.fullscreenElement);

    document.addEventListener('fullscreenchange', this.onFullscreenChangeBound);

    // Start Heartbeat
    this.startHeartbeat();
  }

  ngOnDestroy() {
    document.removeEventListener('fullscreenchange', this.onFullscreenChangeBound);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  private heartbeatInterval: any;
  startHeartbeat() {
    // Send immediately if we have a profile loaded
    const sendPulse = () => {
      const p = this.profile();
      if (p && p.id) {
        this.api.sendHeartbeat(p.id).subscribe({
          error: (e) => console.error('Heartbeat failed', e)
        });
      }
    };

    // Poll every 30 seconds
    this.heartbeatInterval = setInterval(sendPulse, 30000);

    // Also trigger one shortly after load (once profile is likely set)
    // Or we can trigger it in loadProfileByName
  }

  loadAllProfiles() {
    this.loading.set(true);
    this.api.getProfiles().subscribe({
      next: (profiles) => {
        this.allProfiles.set(profiles);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading profiles', err);
        this.loading.set(false);
      }
    });
  }

  loadProfileByName(name: string) {
    this.loading.set(true);
    this.api.getProfiles().subscribe({
      next: (profiles) => {
        const found = profiles.find(p => p.name === name);
        if (found) {
          // Fetch details to ensure we have the videos
          this.api.getProfile(found.id).subscribe({
            next: (detailedProfile) => {
              this.profile.set(detailedProfile);
              this.currentVideoIndex.set(0);
              this.loading.set(false);
              // Auto-start is handled by the template rendering the video element.
              // We just need to trigger play().
              this.triggerPlay();
              // Send initial heartbeat
              this.api.sendHeartbeat(found.id).subscribe();
            },
            error: (e) => {
              console.error("Failed to load details", e);
              this.loading.set(false);
            }
          })
        } else {
          console.warn("Profile not found by name:", name);
          this.loading.set(false);
          this.router.navigate(['/player']);
        }
      },
      error: (err) => {
        console.error('Error loading profiles for lookup', err);
        this.loading.set(false);
      }
    });
  }

  selectProfile(p: Profile) {
    // Try to enter fullscreen immediately on user interaction
    // We use document.documentElement to ensure fullscreen persists even if the component re-renders
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn("Auto-fullscreen denied:", err);
        });
      }
    } catch (e) {
      console.warn("Fullscreen API error:", e);
    }
    this.router.navigate(['/player', p.name]);
  }

  private triggerPlay() {
    // Small timeout to allow ViewChild to be populated
    setTimeout(() => {
      this.playVideo();
    }, 100);
  }

  async playVideo() {
    if (!this.videoPlayer) return;

    try {
      this.videoPlayer.nativeElement.muted = false;
      await this.videoPlayer.nativeElement.play();
      this.showUnmuteOverlay.set(false);
    } catch (err) {
      console.warn("Autoplay with sound failed, falling back to muted", err);
      // Fallback for browsers blocking unmuted autoplay
      this.videoPlayer.nativeElement.muted = true;
      try {
        await this.videoPlayer.nativeElement.play();
        // If muted play works, show overlay to let user unmute
        this.showUnmuteOverlay.set(true);
      } catch (e) {
        console.error("Autoplay failed completely", e);
      }
    }
  }

  interact() {
    this.unmuteAndPlay();
    if (!this.isFullscreen()) {
      this.toggleFullscreen();
    }
  }

  unmuteAndPlay() {
    if (!this.videoPlayer) return;
    this.videoPlayer.nativeElement.muted = false;
    this.videoPlayer.nativeElement.play().catch(e => console.error("Unmute play failed", e));
    this.showUnmuteOverlay.set(false);
  }

  onVideoEnded() {
    const p = this.profile();
    if (!p || !p.videos || p.videos.length === 0) return;

    let nextIndex = this.currentVideoIndex() + 1;

    // Check if we reached the end of the playlist
    if (nextIndex >= p.videos.length) {
      console.log('Playlist ended, checking for updates...');
      // Fetch latest profile data
      this.api.getProfile(p.id).subscribe({
        next: (updatedProfile) => {
          this.profile.set(updatedProfile);

          // Check if we still have videos after update
          if (updatedProfile.videos && updatedProfile.videos.length > 0) {
            this.currentVideoIndex.set(0);
            this.playWithDelay();
          } else {
            console.warn('Playlist became empty after update.');
          }
        },
        error: (err) => {
          console.error('Failed to auto-update playlist, looping local copy', err);
          // Fallback: loop local copy
          this.currentVideoIndex.set(0);
          this.playWithDelay();
        }
      });
    } else {
      // Normal progression
      this.currentVideoIndex.set(nextIndex);
      this.playWithDelay();
    }
  }

  private playWithDelay() {
    setTimeout(() => {
      if (this.videoPlayer && this.videoPlayer.nativeElement) {
        this.videoPlayer.nativeElement.play().catch(e => console.error("Play failed", e));
      }
    });
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  backToSelection() {
    this.profile.set(null);
    this.router.navigate(['/player']);
  }
}
