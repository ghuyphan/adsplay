import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Video } from '../../../../services/api.service';

@Component({
  selector: 'app-video-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './video-list.html',
  styleUrl: './video-list.css',
})
export class VideoList {
  @Input() videos: Video[] = [];
  @Input() isUploading = false;
  @Input() uploadProgress = 0;
  @Input() maxUploadSizeBytes = 2 * 1024 * 1024 * 1024;
  @Input() uploadStatusLabel = 'Sẵn sàng tải lên';
  @Output() upload = new EventEmitter<File>();
  @Output() delete = new EventEmitter<string>();
  @Output() preview = new EventEmitter<Video>();

  uploadError: string | null = null;
  query = '';
  sortBy: 'largest' | 'most-used' | 'name' | 'newest' = 'newest';

  private readonly ALLOWED_TYPES = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  get filteredVideos() {
    const query = this.query.trim().toLowerCase();
    const items = this.videos.filter((video) => {
      if (!query) {
        return true;
      }

      return (
        video.originalName.toLowerCase().includes(query) ||
        video.filename.toLowerCase().includes(query)
      );
    });

    return items.sort((left, right) => {
      switch (this.sortBy) {
        case 'largest':
          return right.size - left.size;
        case 'most-used':
          return (right.usageCount || 0) - (left.usageCount || 0);
        case 'name':
          return left.originalName.localeCompare(right.originalName);
        case 'newest':
        default:
          return new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime();
      }
    });
  }

  onFileSelected(event: Event) {
    this.uploadError = null;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!this.ALLOWED_TYPES.includes(file.type)) {
      this.uploadError = `Định dạng không hỗ trợ (${file.type || 'unknown'}). Chọn MP4, WebM, OGG, MOV, JPG, PNG, GIF hoặc WebP.`;
      input.value = '';
      return;
    }

    if (file.size > this.maxUploadSizeBytes) {
      const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
      this.uploadError = `File quá lớn (${sizeInMB} MB). Giới hạn hiện tại là ${this.getMaxUploadSizeLabel()}.`;
      input.value = '';
      return;
    }

    this.upload.emit(file);
    input.value = '';
  }

  formatUploadedAt(value: string) {
    return new Date(value).toLocaleString();
  }

  getProcessingLabel(video: Video) {
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

  getPosterUrl(video: Video) {
    return `/api/videos/${video.id}/poster?v=${encodeURIComponent(video.updatedAt)}`;
  }

  getPreviewUrl(video: Video) {
    return `/api/videos/${video.id}/stream?v=${encodeURIComponent(video.updatedAt)}`;
  }

  isImage(video: Video) {
    return video.mediaType === 'image';
  }

  getMediaTypeLabel(video: Video) {
    return this.isImage(video) ? 'Ảnh' : 'Video';
  }

  openPreview(video: Video) {
    this.preview.emit(video);
  }

  getMaxUploadSizeLabel() {
    return `${(this.maxUploadSizeBytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
}
