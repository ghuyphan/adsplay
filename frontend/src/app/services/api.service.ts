import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Video {
    id: string;
    filename: string;
    originalName: string;
    size: number;
    uploadedAt: string;
}

export interface Profile {
    id: string;
    name: string;
    videoIds: string[];
    videos?: Video[]; // enriched
    lastSeen?: string;
}

@Injectable({
    providedIn: 'root'
})
export class ApiService {
    private apiUrl = '/api';

    constructor(private http: HttpClient) { }

    getVideos(): Observable<Video[]> {
        return this.http.get<Video[]>(`${this.apiUrl}/videos`);
    }

    uploadVideo(file: File): Observable<Video> {
        const formData = new FormData();
        formData.append('video', file);
        return this.http.post<Video>(`${this.apiUrl}/videos`, formData);
    }

    deleteVideo(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/videos/${id}`);
    }

    getProfiles(): Observable<Profile[]> {
        return this.http.get<Profile[]>(`${this.apiUrl}/profiles`);
    }

    getProfile(id: string): Observable<Profile> {
        return this.http.get<Profile>(`${this.apiUrl}/profiles/${id}`);
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

    sendHeartbeat(profileId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/profiles/${profileId}/heartbeat`, {});
    }
}
