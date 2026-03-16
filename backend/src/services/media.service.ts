import fs from 'fs-extra';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { getConfig } from '../config';
import { dbRepository } from '../db';
import { logError, logInfo } from '../logger';
import type { Video } from '../types';

const config = getConfig();
const execFileAsync = promisify(execFile);
const queue: string[] = [];
let isProcessing = false;

interface FfprobeStream {
    codec_type?: string;
    height?: number;
    width?: number;
}

interface FfprobeOutput {
    format?: {
        duration?: string;
    };
    streams?: FfprobeStream[];
}

// Conservative output for old TV browsers: baseline H.264, AAC-LC stereo,
// smaller frame size, and faststart so playback can begin without a full download.
const LEGACY_MP4_SCALE_FILTER = 'scale=w=854:h=480:force_original_aspect_ratio=decrease';
const LEGACY_MP4_VIDEO_ARGS = [
    '-preset',
    'veryfast',
    '-crf',
    '25',
    '-maxrate',
    '1500k',
    '-bufsize',
    '3000k',
    '-vf',
    LEGACY_MP4_SCALE_FILTER,
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'baseline',
    '-level',
    '3.0',
    '-g',
    '60',
    '-keyint_min',
    '60',
    '-sc_threshold',
    '0',
    '-c:v',
    'libx264',
] as const;
const LEGACY_MP4_AUDIO_ARGS = [
    '-c:a',
    'aac',
    '-profile:a',
    'aac_low',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-b:a',
    '96k',
] as const;

const getRequiredBinary = (binaryPath: string | null | undefined, toolName: string) => {
    if (!binaryPath) {
        throw new Error(`${toolName} binary is not available.`);
    }

    return binaryPath;
};

const probe = async (inputPath: string): Promise<Partial<Video>> => {
    const ffprobePath = getRequiredBinary(ffprobeStatic.path, 'ffprobe');
    const { stdout } = await execFileAsync(ffprobePath, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        inputPath,
    ]);

    const metadata = JSON.parse(stdout) as FfprobeOutput;
    const videoStream = metadata.streams?.find((stream) => stream.codec_type === 'video');
    const duration = metadata.format?.duration ? Number(metadata.format.duration) : undefined;

    return {
        durationSeconds: Number.isFinite(duration) ? duration : undefined,
        height: videoStream?.height,
        width: videoStream?.width,
    };
};

const transcodeToOptimizedMp4 = async (sourcePath: string, outputPath: string) => {
    const ffmpegBinary = getRequiredBinary(ffmpegPath, 'ffmpeg');

    await new Promise<void>((resolve, reject) => {
        const process = spawn(ffmpegBinary, [
            '-y',
            '-i',
            sourcePath,
            '-movflags',
            '+faststart',
            ...LEGACY_MP4_VIDEO_ARGS,
            ...LEGACY_MP4_AUDIO_ARGS,
            '-f',
            'mp4',
            outputPath,
        ]);

        let stderr = '';

        process.stderr.on('data', (chunk: Buffer | string) => {
            stderr += chunk.toString();
        });

        process.on('error', reject);
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
        });
    });
};

const ensureUniqueProcessedPath = (videoId: string) =>
    path.join(config.processedUploadsDir, `${videoId}-optimized.mp4`);

const ensurePosterPath = (videoId: string) =>
    path.join(config.processedUploadsDir, 'posters', `${videoId}.jpg`);

const ensureHlsDir = (videoId: string) => path.join(config.processedUploadsDir, 'hls', videoId);

const toUploadsRelativePath = (absolutePath: string) => path.relative(config.uploadsDir, absolutePath);

const createPoster = async (sourcePath: string, outputPath: string) => {
    const ffmpegBinary = getRequiredBinary(ffmpegPath, 'ffmpeg');
    await fs.ensureDir(path.dirname(outputPath));

    await new Promise<void>((resolve, reject) => {
        const process = spawn(ffmpegBinary, [
            '-y',
            '-ss',
            '00:00:00.500',
            '-i',
            sourcePath,
            '-frames:v',
            '1',
            '-vf',
            'scale=w=1280:h=720:force_original_aspect_ratio=decrease',
            '-q:v',
            '2',
            outputPath,
        ]);

        let stderr = '';

        process.stderr.on('data', (chunk: Buffer | string) => {
            stderr += chunk.toString();
        });

        process.on('error', reject);
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(stderr.trim() || `ffmpeg poster exited with code ${code}`));
        });
    });
};

const transcodeToHls = async (sourcePath: string, outputDir: string) => {
    const ffmpegBinary = getRequiredBinary(ffmpegPath, 'ffmpeg');
    await fs.emptyDir(outputDir);

    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment-%03d.ts');

    await new Promise<void>((resolve, reject) => {
        const process = spawn(ffmpegBinary, [
            '-y',
            '-i',
            sourcePath,
            '-preset',
            'veryfast',
            '-crf',
            '24',
            '-maxrate',
            '3500k',
            '-bufsize',
            '7000k',
            '-vf',
            'scale=w=1920:h=1080:force_original_aspect_ratio=decrease',
            '-pix_fmt',
            'yuv420p',
            '-profile:v',
            'high',
            '-level',
            '4.1',
            '-c:v',
            'libx264',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-hls_time',
            '6',
            '-hls_playlist_type',
            'vod',
            '-hls_segment_filename',
            segmentPattern,
            '-f',
            'hls',
            playlistPath,
        ]);

        let stderr = '';

        process.stderr.on('data', (chunk: Buffer | string) => {
            stderr += chunk.toString();
        });

        process.on('error', reject);
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(stderr.trim() || `ffmpeg HLS exited with code ${code}`));
        });
    });

    return playlistPath;
};

const processNext = async () => {
    if (isProcessing || !queue.length) {
        return;
    }

    isProcessing = true;
    const videoId = queue.shift() as string;

    try {
        const video = await dbRepository.findVideoById(videoId);
        if (!video) {
            return;
        }

        await dbRepository.updateVideo(videoId, (draft) => {
            draft.processingStatus = 'processing';
            draft.processingError = undefined;
        });

        const sourcePath = path.join(config.uploadsDir, video.sourceFilename);
        const optimizedFilename = path.basename(ensureUniqueProcessedPath(video.id));
        const optimizedPath = path.join(config.processedUploadsDir, optimizedFilename);

        await transcodeToOptimizedMp4(sourcePath, optimizedPath);

        const [sourceStats, optimizedStats, mediaMetadata] = await Promise.all([
            fs.stat(sourcePath),
            fs.stat(optimizedPath),
            probe(optimizedPath),
        ]);

        let selectedStreamPath = sourcePath;
        let selectedMimeType = video.sourceMimeType || video.mimeType || 'video/mp4';
        let selectedSize = sourceStats.size;
        let selectedStreamVariant: Video['streamVariant'] = 'original';

        if (optimizedStats.size >= sourceStats.size) {
            await fs.remove(optimizedPath);
            selectedStreamPath = sourcePath;
            selectedMimeType = video.sourceMimeType || video.mimeType || 'video/mp4';
            selectedSize = sourceStats.size;
            selectedStreamVariant = 'original';
        } else {
            selectedStreamPath = optimizedPath;
            selectedMimeType = 'video/mp4';
            selectedSize = optimizedStats.size;
            selectedStreamVariant = 'optimized';
        }

        const posterPath = ensurePosterPath(video.id);
        let posterFilename: string | undefined;
        try {
            await createPoster(selectedStreamPath, posterPath);
            posterFilename = toUploadsRelativePath(posterPath);
        } catch (error) {
            await fs.remove(posterPath);
            logError('media.poster_failed', {
                error: error instanceof Error ? error.message : String(error),
                videoId,
            });
        }

        const hlsDir = ensureHlsDir(video.id);
        let hlsManifestPath: string | undefined;
        try {
            const playlistPath = await transcodeToHls(selectedStreamPath, hlsDir);
            hlsManifestPath = toUploadsRelativePath(playlistPath);
        } catch (error) {
            await fs.remove(hlsDir);
            logError('media.hls_failed', {
                error: error instanceof Error ? error.message : String(error),
                videoId,
            });
        }

        await dbRepository.updateVideo(videoId, (draft) => {
            if (selectedStreamVariant === 'optimized') {
                draft.filename = path.join('processed', optimizedFilename);
                draft.mimeType = selectedMimeType;
                draft.processingError = undefined;
                draft.size = selectedSize;
                draft.streamVariant = selectedStreamVariant;
                draft.durationSeconds = mediaMetadata.durationSeconds;
                draft.height = mediaMetadata.height;
                draft.width = mediaMetadata.width;
            } else {
                draft.processingError = 'Giữ lại bản gốc vì file tối ưu không nhỏ hơn.';
                draft.streamVariant = selectedStreamVariant;
                draft.durationSeconds = mediaMetadata.durationSeconds || draft.durationSeconds;
                draft.height = mediaMetadata.height || draft.height;
                draft.width = mediaMetadata.width || draft.width;
            }

            draft.hlsManifestPath = hlsManifestPath;
            draft.posterFilename = posterFilename;
            draft.processingStatus = 'ready';
        });

        logInfo('media.optimized', { videoId });
    } catch (error) {
        logError('media.optimize_failed', {
            error: error instanceof Error ? error.message : String(error),
            videoId,
        });
        await fs.remove(ensurePosterPath(videoId));
        await fs.remove(ensureHlsDir(videoId));
        await dbRepository.updateVideo(videoId, (draft) => {
            draft.hlsManifestPath = undefined;
            draft.posterFilename = undefined;
            draft.processingStatus = 'ready';
            draft.processingError = 'Không thể tối ưu hóa video, đang dùng bản gốc.';
            draft.streamVariant = 'original';
        });
    } finally {
        isProcessing = false;
        if (queue.length) {
            void processNext();
        }
    }
};

export const enqueueVideoOptimization = async (videoId: string) => {
    if (!config.mediaProcessingEnabled) {
        return;
    }

    const video = await dbRepository.findVideoById(videoId);
    if (!video || video.mediaType !== 'video') {
        return;
    }

    try {
        const sourcePath = path.join(config.uploadsDir, video.sourceFilename);
        const sourceMetadata = await probe(sourcePath);
        await dbRepository.updateVideo(videoId, (draft) => {
            draft.durationSeconds = sourceMetadata.durationSeconds;
            draft.height = sourceMetadata.height;
            draft.width = sourceMetadata.width;
        });
    } catch (error) {
        logError('media.probe_failed', {
            error: error instanceof Error ? error.message : String(error),
            videoId,
        });
    }

    queue.push(videoId);
    await processNext();
};
