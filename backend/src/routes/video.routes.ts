import fs from 'fs-extra';
import multer from 'multer';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import express, { Router } from 'express';
import { getConfig } from '../config';
import { AppError, asyncHandler } from '../errors';
import { authenticateToken } from '../middleware/auth';
import {
    createStoredUploadFilename,
    deleteVideo,
    getVideoById,
    getVideoHlsAssetFile,
    getVideoPolicy,
    getVideoPosterFile,
    getVideoStreamFile,
    listVideos,
    saveUploadedVideo,
    saveUploadedVideoFromFile,
} from '../services/video.service';
import {
    consumeUploadSessionToFile,
    createOrResumeUploadSession,
    deleteUploadSession,
    finalizeUploadSession,
    getUploadSession,
    markUploadSessionCompleted,
    storeUploadChunk,
} from '../services/upload-session.service';
import { requireNonEmptyString } from '../utils/validation';

const config = getConfig();
const MAX_FILE_SIZE = config.maxUploadSizeBytes;
const allowedMimeTypes = getVideoPolicy().allowedMimeTypes;
const allowedMimeTypeMessage = 'Only MP4, WebM, OGG, MOV, JPG, PNG, GIF, and WebP files are allowed.';

const contentTypeByExtension: Record<string, string> = {
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.m4s': 'video/iso.segment',
    '.mp4': 'video/mp4',
    '.ts': 'video/mp2t',
};

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, config.uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    },
});

const upload = multer({
    fileFilter: (_req, file, cb) => {
        if (!allowedMimeTypes.includes(file.mimetype)) {
            cb(new AppError(400, 'UPLOAD_INVALID_TYPE', allowedMimeTypeMessage));
            return;
        }

        cb(null, true);
    },
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    storage,
});

const uploadSingleVideo = (req: Request, res: Response, next: NextFunction) => {
    upload.single('video')(req, res, (error) => {
        if (error instanceof multer.MulterError) {
            next(new AppError(400, 'UPLOAD_FAILED', error.message));
            return;
        }

        if (error) {
            next(error);
            return;
        }

        next();
    });
};

export const videoRouter = Router();

videoRouter.get(
    '/',
    authenticateToken,
    asyncHandler(async (_req, res) => {
        res.json(await listVideos());
    }),
);

videoRouter.get(
    '/policy',
    authenticateToken,
    asyncHandler(async (_req, res) => {
        res.json(getVideoPolicy());
    }),
);

videoRouter.post(
    '/uploads/sessions',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const originalName = requireNonEmptyString(req.body?.originalName, 'originalName', 255);
        const mimeType = requireNonEmptyString(req.body?.mimeType, 'mimeType', 255);
        const fileKey = requireNonEmptyString(req.body?.fileKey, 'fileKey', 255);
        const totalSizeBytes = Number(req.body?.totalSizeBytes);

        if (!Number.isFinite(totalSizeBytes) || totalSizeBytes <= 0 || totalSizeBytes > MAX_FILE_SIZE) {
            throw new AppError(400, 'UPLOAD_INVALID_SIZE', 'Upload size is invalid.');
        }

        if (!allowedMimeTypes.includes(mimeType)) {
            throw new AppError(400, 'UPLOAD_INVALID_TYPE', allowedMimeTypeMessage);
        }

        const session = await createOrResumeUploadSession({
            fileKey,
            mimeType,
            originalName,
            totalSizeBytes,
        });

        res.json(session);
    }),
);

videoRouter.get(
    '/uploads/sessions/:id',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const session = await getUploadSession(requireNonEmptyString(req.params.id, 'id'));
        res.json(session);
    }),
);

videoRouter.put(
    '/uploads/sessions/:id/chunks/:chunkIndex',
    authenticateToken,
    express.raw({ limit: `${Math.ceil(config.resumableChunkSizeBytes / (1024 * 1024)) + 1}mb`, type: 'application/octet-stream' }),
    asyncHandler(async (req, res) => {
        if (!Buffer.isBuffer(req.body)) {
            throw new AppError(400, 'UPLOAD_CHUNK_MISSING', 'Chunk payload is required.');
        }

        const session = await storeUploadChunk(
            requireNonEmptyString(req.params.id, 'id'),
            Number.parseInt(requireNonEmptyString(req.params.chunkIndex, 'chunkIndex'), 10),
            req.body,
        );

        res.json({
            sessionId: session.id,
            uploadedChunkIndexes: session.uploadedChunkIndexes,
        });
    }),
);

videoRouter.post(
    '/uploads/sessions/:id/complete',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const sessionId = requireNonEmptyString(req.params.id, 'id');
        const session = await finalizeUploadSession(sessionId);
        if (session.status === 'completed' && session.videoId) {
            res.json(await getVideoById(session.videoId));
            return;
        }

        const storedFilename = createStoredUploadFilename(session.originalName);
        const destinationPath = path.join(config.uploadsDir, storedFilename);

        try {
            await consumeUploadSessionToFile(sessionId, destinationPath);
            const stats = await fs.stat(destinationPath);
            const video = await saveUploadedVideoFromFile({
                filename: storedFilename,
                mimeType: session.mimeType,
                originalName: session.originalName,
                size: stats.size,
            });
            await markUploadSessionCompleted(sessionId, video.id);
            res.json(video);
        } catch (error) {
            if (await fs.pathExists(destinationPath)) {
                await fs.remove(destinationPath);
            }
            throw error;
        }
    }),
);

videoRouter.delete(
    '/uploads/sessions/:id',
    authenticateToken,
    asyncHandler(async (req, res) => {
        await deleteUploadSession(requireNonEmptyString(req.params.id, 'id'));
        res.json({ success: true });
    }),
);

videoRouter.get(
    '/:id/stream',
    asyncHandler(async (req, res) => {
        const { absolutePath, video } = await getVideoStreamFile(requireNonEmptyString(req.params.id, 'id'));
        const stats = await fs.stat(absolutePath);
        const rangeHeader = req.headers.range;

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        res.setHeader('Content-Type', video.mimeType || 'video/mp4');
        res.setHeader('ETag', `${video.id}:${video.updatedAt}`);

        if (!rangeHeader) {
            res.setHeader('Content-Length', stats.size);
            fs.createReadStream(absolutePath).pipe(res);
            return;
        }

        const ranges = req.range(stats.size, { combine: true });
        if (ranges === -1 || ranges === -2 || !Array.isArray(ranges) || !ranges.length) {
            throw new AppError(416, 'VIDEO_RANGE_INVALID', 'Requested range is not satisfiable.');
        }

        const [{ start, end }] = ranges;
        res.status(206);
        res.setHeader('Content-Length', end - start + 1);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
        fs.createReadStream(absolutePath, { end, start }).pipe(res);
    }),
);

videoRouter.get(
    '/:id/poster',
    asyncHandler(async (req, res) => {
        const { absolutePath, video } = await getVideoPosterFile(requireNonEmptyString(req.params.id, 'id'));

        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('ETag', `${video.id}:${video.updatedAt}:poster`);
        res.sendFile(absolutePath);
    }),
);

videoRouter.get(
    '/:id/hls/:assetName',
    asyncHandler(async (req, res) => {
        const { absolutePath, video } = await getVideoHlsAssetFile(
            requireNonEmptyString(req.params.id, 'id'),
            requireNonEmptyString(req.params.assetName, 'assetName'),
        );
        const extension = path.extname(absolutePath).toLowerCase();

        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        res.setHeader('Content-Type', contentTypeByExtension[extension] || 'application/octet-stream');
        res.setHeader('ETag', `${video.id}:${video.updatedAt}:hls:${path.basename(absolutePath)}`);
        res.sendFile(absolutePath);
    }),
);

videoRouter.post(
    '/',
    authenticateToken,
    (req, _res, next) => {
        req.on('aborted', async () => {
            const file = (req as typeof req & { file?: Express.Multer.File }).file;
            if (!file) {
                return;
            }

            const partialFilePath = path.join(config.uploadsDir, file.filename);
            if (await fs.pathExists(partialFilePath)) {
                await fs.remove(partialFilePath);
            }
        });

        next();
    },
    uploadSingleVideo,
    asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new AppError(400, 'UPLOAD_MISSING_FILE', 'No file uploaded.');
        }

        const video = await saveUploadedVideo(req.file);
        res.json(video);
    }),
);

videoRouter.delete(
    '/:id',
    authenticateToken,
    asyncHandler(async (req, res) => {
        await deleteVideo(requireNonEmptyString(req.params.id, 'id'));
        res.json({ success: true });
    }),
);
