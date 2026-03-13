import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import { dbRepository } from '../db';
import { getConfig } from '../config';
import { AppError } from '../errors';
import { enqueueVideoOptimization } from './media.service';

const config = getConfig();
const VIDEO_MIME_TYPES: string[] = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const IMAGE_MIME_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const inferMediaType = (mimeType: string) => (mimeType.startsWith('image/') ? 'image' : 'video');

const mapUsageCount = async () => {
    const [videos, profiles] = await Promise.all([dbRepository.listVideos(), dbRepository.listProfiles()]);
    const usageCountByVideoId = new Map<string, number>();

    for (const profile of profiles) {
        for (const videoId of profile.videoIds) {
            usageCountByVideoId.set(videoId, (usageCountByVideoId.get(videoId) || 0) + 1);
        }
    }

    return videos.map((video) => ({
        ...video,
        usageCount: usageCountByVideoId.get(video.id) || 0,
    }));
};

export const listVideos = async () => mapUsageCount();

const createVideoRecord = async (input: {
    filename: string;
    mimeType: string;
    originalName: string;
    size: number;
}) => {
    const video = await dbRepository.saveVideo({
        filename: input.filename,
        id: crypto.randomUUID(),
        mediaType: inferMediaType(input.mimeType),
        mimeType: input.mimeType,
        originalName: input.originalName,
        processingStatus:
            config.mediaProcessingEnabled && inferMediaType(input.mimeType) === 'video' ? 'pending' : 'ready',
        sourceFilename: input.filename,
        sourceMimeType: input.mimeType,
        sourceSize: input.size,
        size: input.size,
        streamVariant: 'original',
        uploadedAt: new Date().toISOString(),
    });

    if (video.mediaType === 'video') {
        void enqueueVideoOptimization(video.id);
    }

    return video;
};

export const createStoredUploadFilename = (originalName: string) => {
    const ext = path.extname(originalName) || '.bin';
    return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
};

export const saveUploadedVideo = async (file: Express.Multer.File) =>
    createVideoRecord({
        filename: file.filename,
        mimeType: file.mimetype,
        originalName: file.originalname,
        size: file.size,
    });

export const saveUploadedVideoFromFile = async (input: {
    filename: string;
    mimeType: string;
    originalName: string;
    size: number;
}) => createVideoRecord(input);

export const getVideoById = async (id: string) => {
    const video = await dbRepository.findVideoById(id);
    if (!video) {
        throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found.');
    }

    return video;
};

export const getVideoPolicy = () => ({
    allowedMimeTypes: [...VIDEO_MIME_TYPES, ...IMAGE_MIME_TYPES],
    mediaProcessingEnabled: config.mediaProcessingEnabled,
    maxUploadSizeBytes: config.maxUploadSizeBytes,
    resumableChunkSizeBytes: config.resumableChunkSizeBytes,
});

export const getVideoStreamFile = async (id: string) => {
    const video = await getVideoById(id);
    const preferredPath = path.join(config.uploadsDir, video.filename);
    const sourcePath = path.join(config.uploadsDir, video.sourceFilename);
    const preferredExists = await fs.pathExists(preferredPath);
    const sourceExists = await fs.pathExists(sourcePath);

    if (!preferredExists && !sourceExists) {
        throw new AppError(404, 'VIDEO_FILE_NOT_FOUND', 'Video file is missing from disk.');
    }

    const selectedPath = preferredExists ? preferredPath : sourcePath;

    return {
        absolutePath: selectedPath,
        video,
    };
};

export const getVideoPosterFile = async (id: string) => {
    const video = await getVideoById(id);

    if (!video.posterFilename) {
        throw new AppError(404, 'VIDEO_POSTER_NOT_FOUND', 'Video poster is not available.');
    }

    const absolutePath = path.join(config.uploadsDir, video.posterFilename);
    if (!(await fs.pathExists(absolutePath))) {
        throw new AppError(404, 'VIDEO_POSTER_NOT_FOUND', 'Video poster is missing from disk.');
    }

    return {
        absolutePath,
        video,
    };
};

export const getVideoHlsAssetFile = async (id: string, assetName: string) => {
    const video = await getVideoById(id);

    if (!video.hlsManifestPath) {
        throw new AppError(404, 'VIDEO_HLS_NOT_FOUND', 'HLS stream is not available for this video.');
    }

    const safeAssetName = path.basename(assetName);
    if (safeAssetName !== assetName) {
        throw new AppError(400, 'VIDEO_HLS_ASSET_INVALID', 'HLS asset path is invalid.');
    }

    const hlsDirectory = path.dirname(video.hlsManifestPath);
    const absolutePath = path.join(config.uploadsDir, hlsDirectory, safeAssetName);
    if (!(await fs.pathExists(absolutePath))) {
        throw new AppError(404, 'VIDEO_HLS_ASSET_NOT_FOUND', 'Requested HLS asset is missing from disk.');
    }

    return {
        absolutePath,
        video,
    };
};

export const deleteVideo = async (id: string) => {
    const video = await dbRepository.findVideoById(id);
    if (!video) {
        throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found.');
    }

    const filePaths = new Set([
        path.join(config.uploadsDir, video.filename),
        path.join(config.uploadsDir, video.sourceFilename),
    ]);

    if (video.posterFilename) {
        filePaths.add(path.join(config.uploadsDir, video.posterFilename));
    }

    if (video.hlsManifestPath) {
        filePaths.add(path.join(config.uploadsDir, path.dirname(video.hlsManifestPath)));
    }

    for (const filePath of filePaths) {
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
        }
    }

    await dbRepository.deleteVideo(id);
};
