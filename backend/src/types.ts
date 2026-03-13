export type MediaType = 'video' | 'image';
export type VideoProcessingStatus = 'pending' | 'processing' | 'ready';
export type VideoStreamVariant = 'optimized' | 'original';
export type UploadSessionStatus = 'uploading' | 'assembling' | 'completed';

export interface Video {
    createdAt: string;
    filename: string;
    hlsManifestPath?: string;
    id: string;
    height?: number;
    mediaType: MediaType;
    mimeType?: string;
    originalName: string;
    posterFilename?: string;
    processingError?: string;
    processingStatus: VideoProcessingStatus;
    sourceFilename: string;
    sourceMimeType?: string;
    sourceSize: number;
    size: number;
    streamVariant: VideoStreamVariant;
    durationSeconds?: number;
    updatedAt: string;
    uploadedAt: string;
    usageCount?: number;
    width?: number;
}

export interface Profile {
    createdAt: string;
    id: string;
    lastSeen?: string;
    name: string;
    updatedAt: string;
    videoIds: string[];
}

export interface User {
    id: string;
    passwordHash: string;
    username: string;
}

export interface DatabaseSchema {
    profiles: Profile[];
    users: User[];
    videos: Video[];
}

export interface DetailedProfile extends Profile {
    slug: string;
    videos: Video[];
}

export interface AdminProfile extends Profile {
    playerAccessToken: string;
    slug: string;
}

export interface AdminDetailedProfile extends DetailedProfile {
    playerAccessToken: string;
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

export interface UploadSessionManifest {
    chunkSizeBytes: number;
    createdAt: string;
    fileKey: string;
    id: string;
    mimeType: string;
    originalName: string;
    status: UploadSessionStatus;
    totalChunks: number;
    totalSizeBytes: number;
    updatedAt: string;
    uploadedChunkIndexes: number[];
    videoId?: string;
}
