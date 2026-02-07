import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Button } from '../../../../shared/ui/button/button';
import { Video } from '../../../../services/api.service';

@Component({
  selector: 'app-video-list',
  imports: [CommonModule],
  templateUrl: './video-list.html',
  styleUrl: './video-list.css',
})
export class VideoList {
  @Input() videos: Video[] = [];
  @Output() upload = new EventEmitter<File>();
  @Output() delete = new EventEmitter<string>();

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.upload.emit(file);
      // Reset input
      event.target.value = '';
    }
  }
}
