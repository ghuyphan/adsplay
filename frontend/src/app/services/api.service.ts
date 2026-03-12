import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PUBLIC_API_REQUEST } from './auth.interceptor';

export interface Video {
    createdAt: string;
    durationSeconds?: number;
    id: string;
    filename: string;
    height?: number;
    mimeType?: string;
    originalName: string;
    processingError?: string;
    processingStatus: 'pending' | 'processing' | 'ready';
    sourceFilename: string;
    sourceMimeType?: string;
    sourceSize: number;
    size: number;
    streamVariant: 'optimized' | 'original';
    updatedAt: string;
    uploadedAt: string;
    usageCount?: number;
    width?: number;
}

export interface Profile {
    createdAt: string;
    id: string;
    name: string;
    playerAccessToken: string;
    slug: string;
    updatedAt: string;
    videoIds: string[];
    videos?: Video[]; // enriched
    lastSeen?: string;
}

export interface PlayerProfileSummary {
    name: string;
    slug: string;
    videoCount: number;
}

export interface PlayerProfile {
    name: string;
    slug: string;
    videos: Video[];
}

export interface VideoPolicy {
    allowedMimeTypes: string[];
    mediaProcessingEnabled: boolean;
    maxUploadSizeBytes: number;
    resumableChunkSizeBytes: number;
}

export interface UploadSession {
    chunkSizeBytes: number;
    createdAt: string;
    fileKey: string;
    id: string;
    mimeType: string;
    originalName: string;
    status: 'uploading' | 'assembling' | 'completed';
    totalChunks: number;
    totalSizeBytes: number;
    updatedAt: string;
    uploadedChunkIndexes: number[];
    videoId?: string;
}

@Injectable({
    providedIn: 'root'
})
export class ApiService {
    private apiUrl = '/api';

    constructor(private http: HttpClient) { }

    private createPublicRequestContext() {
        return new HttpContext().set(PUBLIC_API_REQUEST, true);
    }

    getVideos(noCache?: boolean): Observable<Video[]> {
        const url = noCache ? `${this.apiUrl}/videos?_t=${Date.now()}` : `${this.apiUrl}/videos`;
        return this.http.get<Video[]>(url);
    }

    getVideoPolicy(): Observable<VideoPolicy> {
        return this.http.get<VideoPolicy>(`${this.apiUrl}/videos/policy`);
    }

    uploadVideo(file: File): Observable<HttpEvent<Video>> {
        const formData = new FormData();
        formData.append('video', file);
        return this.http.post<Video>(`${this.apiUrl}/videos`, formData, {
            reportProgress: true,
            observe: 'events'
        });
    }

    createUploadSession(payload: {
        fileKey: string;
        mimeType: string;
        originalName: string;
        totalSizeBytes: number;
    }): Observable<UploadSession> {
        return this.http.post<UploadSession>(`${this.apiUrl}/videos/uploads/sessions`, payload);
    }

    getUploadSession(id: string): Observable<UploadSession> {
        return this.http.get<UploadSession>(`${this.apiUrl}/videos/uploads/sessions/${id}`);
    }

    uploadChunk(sessionId: string, chunkIndex: number, chunk: Blob): Observable<HttpEvent<{ sessionId: string; uploadedChunkIndexes: number[] }>> {
        return this.http.put<{ sessionId: string; uploadedChunkIndexes: number[] }>(
            `${this.apiUrl}/videos/uploads/sessions/${sessionId}/chunks/${chunkIndex}`,
            chunk,
            {
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                observe: 'events',
                reportProgress: true,
            },
        );
    }

    completeUploadSession(id: string): Observable<Video> {
        return this.http.post<Video>(`${this.apiUrl}/videos/uploads/sessions/${id}/complete`, {});
    }

    cancelUploadSession(id: string): Observable<{ success: boolean }> {
        return this.http.delete<{ success: boolean }>(`${this.apiUrl}/videos/uploads/sessions/${id}`);
    }

    deleteVideo(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/videos/${id}`);
    }

    getProfiles(noCache?: boolean): Observable<Profile[]> {
        const url = noCache ? `${this.apiUrl}/profiles?_t=${Date.now()}` : `${this.apiUrl}/profiles`;
        return this.http.get<Profile[]>(url);
    }

    getPlayerProfiles(noCache?: boolean): Observable<PlayerProfileSummary[]> {
        const url = noCache ? `${this.apiUrl}/profiles?_t=${Date.now()}` : `${this.apiUrl}/profiles`;
        return this.http.get<PlayerProfileSummary[]>(url, {
            context: this.createPublicRequestContext(),
        });
    }

    getProfile(id: string): Observable<Profile> {
        return this.http.get<Profile>(`${this.apiUrl}/profiles/${id}`);
    }

    getProfileBySlug(slug: string): Observable<PlayerProfile> {
        return this.http.get<PlayerProfile>(`${this.apiUrl}/profiles/slug/${slug}`, {
            context: this.createPublicRequestContext(),
        });
    }

    createProfile(name: string, videoIds: string[]): Observable<any> {
        return this.http.post(`${this.apiUrl}/profiles`, { name, videoIds });
    }

    updateProfile(id: string, name: string, videoIds: string[]): Observable<any> {
        return this.http.post(`${this.apiUrl}/profiles`, { id, name, videoIds });
    }

    deleteProfile(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/profiles/${id}`);
    }

    getSystemStatus(): Observable<{ online: boolean; uptime: number; localIps: string[] }> {
        return this.http.get<{ online: boolean; uptime: number; localIps: string[] }>(`${this.apiUrl}/system/status`);
    }

    sendHeartbeat(profileSlug: string, playerAccessToken: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/profiles/slug/${profileSlug}/heartbeat`, {}, {
            context: this.createPublicRequestContext(),
            headers: {
                'X-Profile-Token': playerAccessToken,
            },
        });
    }

    getVideoStreamUrl(video: Pick<Video, 'id' | 'updatedAt'>): string {
        return `${this.apiUrl}/videos/${video.id}/stream?v=${encodeURIComponent(video.updatedAt)}`;
    }
}
