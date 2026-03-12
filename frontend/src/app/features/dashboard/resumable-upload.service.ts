import { Injectable, inject } from '@angular/core';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { ApiService, UploadSession, Video } from '../../services/api.service';

const UPLOAD_CLIENT_ID_STORAGE_KEY = 'adplay-upload-client-id';

let inMemoryUploadClientId: string | null = null;

const createUploadClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const readStoredUploadClientId = () => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage.getItem(UPLOAD_CLIENT_ID_STORAGE_KEY);
};

const writeStoredUploadClientId = (clientId: string) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(UPLOAD_CLIENT_ID_STORAGE_KEY, clientId);
};

const hashUploadFingerprint = (value: string) => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const getUploadClientId = () => {
  if (inMemoryUploadClientId) {
    return inMemoryUploadClientId;
  }

  const storedClientId = readStoredUploadClientId();
  if (storedClientId) {
    inMemoryUploadClientId = storedClientId;
    return storedClientId;
  }

  const nextClientId = createUploadClientId();
  writeStoredUploadClientId(nextClientId);
  inMemoryUploadClientId = nextClientId;
  return nextClientId;
};

export const buildUploadFileKey = (
  file: Pick<File, 'lastModified' | 'name' | 'size'>,
  clientId = getUploadClientId(),
) => {
  const fileFingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  return `${clientId}:${hashUploadFingerprint(fileFingerprint)}`;
};

@Injectable({
  providedIn: 'root',
})
export class ResumableUploadService {
  private readonly api = inject(ApiService);

  async uploadFile(
    file: File,
    onProgress: (progressPercent: number, session: UploadSession) => void,
  ): Promise<Video> {
    const session = await firstValueFrom(
      this.api.createUploadSession({
        fileKey: buildUploadFileKey(file),
        mimeType: file.type,
        originalName: file.name,
        totalSizeBytes: file.size,
      }),
    );

    const uploadedChunkIndexes = new Set(session.uploadedChunkIndexes);
    let uploadedBytes = this.getUploadedBytes(file, session, uploadedChunkIndexes);
    onProgress(Math.round((uploadedBytes / file.size) * 100), session);

    for (let chunkIndex = 0; chunkIndex < session.totalChunks; chunkIndex += 1) {
      if (uploadedChunkIndexes.has(chunkIndex)) {
        continue;
      }

      const chunkStart = chunkIndex * session.chunkSizeBytes;
      const chunkEnd = Math.min(chunkStart + session.chunkSizeBytes, file.size);
      const chunk = file.slice(chunkStart, chunkEnd);

      await lastValueFrom(this.api.uploadChunk(session.id, chunkIndex, chunk));

      // HttpClient with fetch does not emit incremental upload progress reliably,
      // so advance after each committed chunk.
      uploadedBytes += chunk.size;
      uploadedChunkIndexes.add(chunkIndex);
      session.uploadedChunkIndexes = [...uploadedChunkIndexes].sort((left, right) => left - right);
      onProgress(Math.round((uploadedBytes / file.size) * 100), session);
    }

    return firstValueFrom(this.api.completeUploadSession(session.id));
  }

  private getUploadedBytes(file: File, session: UploadSession, uploadedChunkIndexes: Set<number>) {
    let uploadedBytes = 0;
    for (const chunkIndex of uploadedChunkIndexes) {
      const chunkStart = chunkIndex * session.chunkSizeBytes;
      const chunkEnd = Math.min(chunkStart + session.chunkSizeBytes, file.size);
      uploadedBytes += chunkEnd - chunkStart;
    }
    return uploadedBytes;
  }
}
