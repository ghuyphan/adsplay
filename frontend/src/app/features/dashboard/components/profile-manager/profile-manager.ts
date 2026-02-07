import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Button } from '../../../../shared/ui/button/button';
import { Video, Profile, ApiService } from '../../../../services/api.service';
import { ConfirmModal } from '../../../../shared/ui/confirm-modal/confirm-modal';

@Component({
  selector: 'app-profile-manager',
  imports: [CommonModule, FormsModule, ConfirmModal],
  templateUrl: './profile-manager.html',
  styleUrl: './profile-manager.css',
})
export class ProfileManager {
  @Input() profiles: Profile[] = [];
  @Input() videos: Video[] = [];

  // New/Edit Profile State
  isEditing = false;
  editingId: string | null = null;
  profileName = '';
  mobileTab: 'library' | 'playlist' = 'library';

  // Modal State
  videoDeletingId = null; // Unused here? Wait, ProfileManager manages Profiles. We need profile deleting state.
  deletingProfileId: string | null = null;

  // Ordered Playlist
  playlistVideos: Video[] = [];

  // Drag State
  draggedIndex: number | null = null;

  constructor(private api: ApiService) { }

  openCreate() {
    this.isEditing = true;
    this.editingId = null;
    this.profileName = '';
    this.playlistVideos = [];
  }

  openEdit(profile: Profile) {
    this.isEditing = true;
    this.editingId = profile.id;
    this.profileName = profile.name;

    // Map IDs back to Video objects, preserving order
    this.playlistVideos = profile.videoIds
      .map(id => this.videos.find(v => v.id === id))
      .filter((v): v is Video => !!v);
  }

  @Output() refresh = new EventEmitter<void>();

  addToPlaylist(video: Video) {
    this.playlistVideos.push(video);
  }

  removeFromPlaylist(index: number) {
    this.playlistVideos.splice(index, 1);
  }

  // Drag & Drop Handlers
  onDragStart(event: DragEvent, index: number) {
    this.draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (this.draggedIndex === null || this.draggedIndex === index) return;
  }

  onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    if (this.draggedIndex === null) return;

    const movedItem = this.playlistVideos[this.draggedIndex];
    this.playlistVideos.splice(this.draggedIndex, 1);
    this.playlistVideos.splice(index, 0, movedItem);

    this.draggedIndex = null;
  }

  save() {
    const videoIds = this.playlistVideos.map(v => v.id);

    const obs = this.editingId
      ? this.api.updateProfile(this.editingId, this.profileName, videoIds)
      : this.api.createProfile(this.profileName, videoIds);

    obs.subscribe(() => {
      this.isEditing = false;
      this.refresh.emit();
    });
  }

  cancel() {
    this.isEditing = false;
  }

  deleteProfile(id: string) {
    this.deletingProfileId = id;
  }

  confirmDelete() {
    if (this.deletingProfileId) {
      this.api.deleteProfile(this.deletingProfileId).subscribe(() => {
        this.refresh.emit();
        this.deletingProfileId = null;
      });
    }
  }

  cancelDelete() {
    this.deletingProfileId = null;
  }

  getPlayerUrl(name: string): string {
    return `${window.location.origin}/player/${name}`;
  }

  isOnline(lastSeen?: string): boolean {
    if (!lastSeen) return false;
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 60000; // Online if seen in last 60s
  }
}
