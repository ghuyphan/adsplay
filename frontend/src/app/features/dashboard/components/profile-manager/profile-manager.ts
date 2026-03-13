import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmModal } from '../../../../shared/ui/confirm-modal/confirm-modal';
import { Profile, Video } from '../../../../services/api.service';
import { slugify } from '../../../../shared/utils/slugify';
import { SaveProfilePayload } from '../../dashboard.store';

@Component({
  selector: 'app-profile-manager',
  imports: [CommonModule, FormsModule, ConfirmModal],
  templateUrl: './profile-manager.html',
  styleUrl: './profile-manager.css',
})
export class ProfileManager {
  @Input() profiles: Profile[] = [];
  @Input() videos: Video[] = [];
  @Input() activePlayerCount = 0;
  @Input() localIps: string[] = [];

  @Output() saveProfile = new EventEmitter<SaveProfilePayload>();
  @Output() deleteProfileConfirmed = new EventEmitter<string>();

  isEditing = false;
  editingId: string | null = null;
  profileName = '';
  mobileTab: 'library' | 'playlist' = 'library';
  deletingProfileId: string | null = null;
  playlistVideos: Video[] = [];
  draggedIndex: number | null = null;
  draggedVideo: Video | null = null;
  isDragOverPlaylist = false;
  formError = '';

  openCreate() {
    this.isEditing = true;
    this.editingId = null;
    this.profileName = '';
    this.playlistVideos = [];
    this.formError = '';
  }

  openEdit(profile: Profile) {
    this.isEditing = true;
    this.editingId = profile.id;
    this.profileName = profile.name;
    this.formError = '';
    this.playlistVideos = profile.videoIds
      .map((id) => this.videos.find((video) => video.id === id))
      .filter((video): video is Video => Boolean(video));
  }

  addToPlaylist(video: Video) {
    this.formError = '';
    this.playlistVideos.push(video);
  }

  removeFromPlaylist(index: number) {
    this.playlistVideos.splice(index, 1);
  }

  onDragStartFromLibrary(event: DragEvent, video: Video) {
    this.draggedVideo = video;
    this.draggedIndex = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', 'library');
    }
  }

  onDragStart(event: DragEvent, index: number) {
    this.draggedVideo = null;
    this.draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOverPlaylist = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.draggedVideo ? 'copy' : 'move';
    }
  }

  onDragLeave() {
    this.isDragOverPlaylist = false;
  }

  onDrop(event: DragEvent, index?: number) {
    event.preventDefault();
    this.isDragOverPlaylist = false;

    if (this.draggedVideo) {
      this.playlistVideos.splice(index ?? this.playlistVideos.length, 0, this.draggedVideo);
      this.draggedVideo = null;
      return;
    }

    if (this.draggedIndex === null) {
      return;
    }

    const movedItem = this.playlistVideos[this.draggedIndex];
    this.playlistVideos.splice(this.draggedIndex, 1);
    this.playlistVideos.splice(index ?? this.playlistVideos.length, 0, movedItem);
    this.draggedIndex = null;
  }

  save() {
    const name = this.profileName.trim();
    if (!name) {
      this.formError = 'Nhập tên cho màn hình.';
      return;
    }

    if (!this.playlistVideos.length) {
      this.formError = 'Thêm ít nhất một nội dung trước khi lưu.';
      return;
    }

    const nextSlug = slugify(name);
    const duplicate = this.profiles.some(
      (profile) => profile.id !== this.editingId && slugify(profile.name) === nextSlug,
    );
    if (duplicate) {
      this.formError = 'Tên màn hình này đã tồn tại hoặc tạo slug trùng lặp.';
      return;
    }

    this.saveProfile.emit({
      id: this.editingId || undefined,
      name,
      videoIds: this.playlistVideos.map((video) => video.id),
    });
    this.isEditing = false;
    this.formError = '';
  }

  cancel() {
    this.isEditing = false;
    this.formError = '';
  }

  deleteProfile(id: string) {
    this.deletingProfileId = id;
  }

  get deletingProfileIsOnline() {
    if (!this.deletingProfileId) {
      return false;
    }
    const profile = this.profiles.find((p) => p.id === this.deletingProfileId);
    return profile ? this.isOnline(profile.lastSeen) : false;
  }

  confirmDelete() {
    if (!this.deletingProfileId) {
      return;
    }

    this.deleteProfileConfirmed.emit(this.deletingProfileId);
    this.deletingProfileId = null;
  }

  cancelDelete() {
    this.deletingProfileId = null;
  }

  getPlayerUrl(name: string) {
    return this.buildPlayerUrl('player', slugify(name));
  }

  getProfilePlayerUrl(profile: Profile) {
    return this.buildPlayerUrl('player', profile.slug);
  }

  getProfilePlayerPairingUrl(profile: Profile) {
    return this.buildPlayerUrl('player', profile.slug, profile.playerAccessToken, true);
  }

  getLegacyPlayerUrl(profile: Profile) {
    return this.buildPlayerUrl('player-legacy', profile.slug);
  }

  getLegacyPlayerPairingUrl(profile: Profile) {
    return this.buildPlayerUrl('player-legacy', profile.slug, profile.playerAccessToken, true);
  }

  private buildPlayerUrl(pathPrefix: 'player' | 'player-legacy', slug: string, playerAccessToken?: string, includeToken = false) {
    if (typeof window === 'undefined') {
      const tokenQuery = includeToken && playerAccessToken ? `?token=${encodeURIComponent(playerAccessToken)}` : '';
      return `/${pathPrefix}/${slug}${tokenQuery}`;
    }

    const url = new URL(window.location.origin);
    url.pathname = `/${pathPrefix}/${slug}`;

    if (this.localIps[0]) {
      url.hostname = this.localIps[0];
    }

    if (includeToken && playerAccessToken) {
      url.searchParams.set('token', playerAccessToken);
    }

    return url.toString();
  }

  getPlaylistDurationLabel() {
    return `${this.playlistVideos.length} mục trong playlist`;
  }

  isOnline(lastSeen?: string) {
    if (!lastSeen) {
      return false;
    }

    return Date.now() - new Date(lastSeen).getTime() < 60000;
  }
}
