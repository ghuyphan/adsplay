import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, interval, of } from 'rxjs';
import { catchError, finalize, startWith, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService, Profile, Video } from '../../services/api.service';
import { ToastService } from '../../shared/services/toast.service';
import { getErrorMessage } from '../../shared/utils/error-message';
import { ResumableUploadService } from './resumable-upload.service';

export interface SaveProfilePayload {
  id?: string;
  name: string;
  videoIds: string[];
}

@Injectable()
export class DashboardStore {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly resumableUpload = inject(ResumableUploadService);
  private readonly toastService = inject(ToastService);

  readonly videos = signal<Video[]>([]);
  readonly profiles = signal<Profile[]>([]);
  readonly loading = signal(false);
  readonly isUploading = signal(false);
  readonly uploadProgress = signal(0);
  readonly uploadStatusLabel = signal('Sẵn sàng tải lên');
  readonly isSystemOnline = signal(true);
  readonly systemInfo = signal<{ uptime: number; localIps: string[] } | null>(null);
  readonly maxUploadSizeBytes = signal(2 * 1024 * 1024 * 1024);
  readonly activePlayerCount = computed(() => this.profiles().filter((profile) => this.isOnline(profile.lastSeen)).length);

  initialize() {
    this.refreshAll();
    this.startSystemPolling();
    this.loadVideoPolicy();
  }

  refreshAll() {
    this.loading.set(true);

    forkJoin({
      profiles: this.api.getProfiles(true),
      videos: this.api.getVideos(true),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ profiles, videos }) => {
          this.profiles.set(profiles);
          this.videos.set(videos);
        },
        error: (error) => {
          this.toastService.show(getErrorMessage(error, 'Không thể tải dữ liệu dashboard.'), 'error');
        },
      });
  }

  startSystemPolling() {
    interval(30000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.api.getSystemStatus().pipe(
            catchError(() => {
              this.isSystemOnline.set(false);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((status) => {
        if (!status) {
          return;
        }

        this.isSystemOnline.set(status.online);
        this.systemInfo.set({ localIps: status.localIps, uptime: status.uptime });
      });
  }

  async uploadMedia(file: File) {
    this.isUploading.set(true);
    this.uploadProgress.set(0);
    this.uploadStatusLabel.set('Đang tạo phiên tải lên...');

    try {
      await this.resumableUpload.uploadFile(file, (progressPercent, session) => {
        this.uploadProgress.set(progressPercent);
        this.uploadStatusLabel.set(
          session.uploadedChunkIndexes.length > 0
            ? `Đang tiếp tục tải lên (${session.uploadedChunkIndexes.length}/${session.totalChunks} chunk đã có)`
            : 'Đang tải lên theo từng chunk...',
        );
      });

      const successLabel = file.type.startsWith('image/') ? 'Ảnh' : 'Video';
      this.toastService.show(`${successLabel} đã được tải lên thành công.`, 'success');
      this.refreshAll();
    } catch (error) {
      this.toastService.show(getErrorMessage(error, 'Tải nội dung thất bại.'), 'error');
    } finally {
      this.isUploading.set(false);
      this.uploadProgress.set(0);
      this.uploadStatusLabel.set('Sẵn sàng tải lên');
    }
  }

  loadVideoPolicy() {
    this.api
      .getVideoPolicy()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (policy) => {
          this.maxUploadSizeBytes.set(policy.maxUploadSizeBytes);
        },
        error: () => undefined,
      });
  }

  saveProfile(payload: SaveProfilePayload) {
    const request = payload.id
      ? this.api.updateProfile(payload.id, payload.name, payload.videoIds)
      : this.api.createProfile(payload.name, payload.videoIds);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show(
          payload.id ? 'Đã cập nhật màn hình.' : 'Đã tạo màn hình mới.',
          'success',
        );
        this.refreshAll();
      },
      error: (error) => {
        this.toastService.show(getErrorMessage(error, 'Không thể lưu màn hình.'), 'error');
      },
    });
  }

  deleteProfile(id: string) {
    this.api
      .deleteProfile(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.show('Đã xóa màn hình.', 'success');
          this.refreshAll();
        },
        error: (error) => {
          this.toastService.show(getErrorMessage(error, 'Không thể xóa màn hình.'), 'error');
        },
      });
  }

  deleteVideo(id: string) {
    this.api
      .deleteVideo(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.show('Đã xóa nội dung.', 'success');
          this.refreshAll();
        },
        error: (error) => {
          this.toastService.show(getErrorMessage(error, 'Không thể xóa nội dung.'), 'error');
          this.refreshAll();
        },
      });
  }

  getVideoDeleteMessage(id: string) {
    const usedInProfiles = this.profiles().filter((profile) => profile.videoIds.includes(id));
    if (!usedInProfiles.length) {
      return 'Hành động này không thể hoàn tác. Nội dung sẽ bị xóa vĩnh viễn khỏi hệ thống.';
    }

    const profileNames = usedInProfiles.map((profile) => profile.name).join(', ');
    return `Nội dung này đang được dùng trong: ${profileNames}. Xóa nó sẽ làm playlist của các màn hình đó mất nội dung ngay lập tức.`;
  }

  isOnline(lastSeen?: string) {
    if (!lastSeen) {
      return false;
    }

    return Date.now() - new Date(lastSeen).getTime() < 60000;
  }
}
