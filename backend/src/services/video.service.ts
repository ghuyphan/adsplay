import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import { dbRepository } from '../db';
import { getConfig } from '../config';
import { AppError } from '../errors';
import { enqueueVideoOptimization } from './media.service';

const config = getConfig();

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
        mimeType: input.mimeType,
        originalName: input.originalName,
        processingStatus: config.mediaProcessingEnabled ? 'pending' : 'ready',
        sourceFilename: input.filename,
        sourceMimeType: input.mimeType,
        sourceSize: input.size,
        size: input.size,
        streamVariant: 'original',
        uploadedAt: new Date().toISOString(),
    });

    void enqueueVideoOptimization(video.id);
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
    allowedMimeTypes: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
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

export const deleteVideo = async (id: string) => {
    const video = await dbRepository.findVideoById(id);
    if (!video) {
        throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found.');
    }

    const filePaths = new Set([
        path.join(config.uploadsDir, video.filename),
        path.join(config.uploadsDir, video.sourceFilename),
    ]);

    for (const filePath of filePaths) {
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
        }
    }

    await dbRepository.deleteVideo(id);
};
