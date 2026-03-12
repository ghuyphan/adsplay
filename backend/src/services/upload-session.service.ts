import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import { getConfig } from '../config';
import { AppError } from '../errors';
import type { UploadSessionManifest } from '../types';

const config = getConfig();

const getSessionDir = (sessionId: string) => path.join(config.uploadSessionsDir, sessionId);
const getManifestPath = (sessionId: string) => path.join(getSessionDir(sessionId), 'manifest.json');
const getChunksDir = (sessionId: string) => path.join(getSessionDir(sessionId), 'chunks');
const getChunkPath = (sessionId: string, chunkIndex: number) =>
    path.join(getChunksDir(sessionId), `${chunkIndex.toString().padStart(6, '0')}.part`);

const readManifestFile = async (manifestPath: string): Promise<UploadSessionManifest | null> => {
    if (!(await fs.pathExists(manifestPath))) {
        return null;
    }

    try {
        return await fs.readJson(manifestPath);
    } catch {
        return null;
    }
};

const readManifest = async (sessionId: string): Promise<UploadSessionManifest | null> => {
    return readManifestFile(getManifestPath(sessionId));
};

const writeManifest = async (manifest: UploadSessionManifest) => {
    const sessionDir = getSessionDir(manifest.id);
    await fs.ensureDir(getChunksDir(manifest.id));
    await fs.writeJson(path.join(sessionDir, 'manifest.json'), manifest, { spaces: 2 });
};

const listUploadedChunkIndexes = async (sessionId: string) => {
    const chunksDir = getChunksDir(sessionId);
    if (!(await fs.pathExists(chunksDir))) {
        return [];
    }

    const files = await fs.readdir(chunksDir);
    return files
        .filter((file) => file.endsWith('.part'))
        .map((file) => Number.parseInt(file.replace('.part', ''), 10))
        .filter((value) => Number.isInteger(value))
        .sort((left, right) => left - right);
};

const haveSameUploadedChunkIndexes = (left: number[], right: number[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);

const hasAllChunks = (uploadedChunkIndexes: number[], totalChunks: number) =>
    uploadedChunkIndexes.length === totalChunks &&
    uploadedChunkIndexes.every((chunkIndex, expectedIndex) => chunkIndex === expectedIndex);

const normalizeManifest = async (manifest: UploadSessionManifest) => {
    if (manifest.status === 'completed') {
        return manifest;
    }

    const uploadedChunkIndexes = await listUploadedChunkIndexes(manifest.id);
    if (!haveSameUploadedChunkIndexes(uploadedChunkIndexes, manifest.uploadedChunkIndexes)) {
        manifest.uploadedChunkIndexes = uploadedChunkIndexes;
        manifest.updatedAt = new Date().toISOString();
        await writeManifest(manifest);
    }

    return manifest;
};

const matchesUploadInput = (
    manifest: UploadSessionManifest,
    input: {
        fileKey: string;
        mimeType: string;
        originalName: string;
        totalSizeBytes: number;
    },
) =>
    manifest.status !== 'completed' &&
    manifest.fileKey === input.fileKey &&
    manifest.totalSizeBytes === input.totalSizeBytes &&
    manifest.mimeType === input.mimeType &&
    manifest.originalName === input.originalName;

const findResumableSession = async (input: {
    fileKey: string;
    mimeType: string;
    originalName: string;
    totalSizeBytes: number;
}) => {
    const sessionIds = await fs.readdir(config.uploadSessionsDir);
    let latestMatch: UploadSessionManifest | null = null;

    for (const sessionId of sessionIds) {
        const manifest = await readManifest(sessionId);
        if (!manifest || !matchesUploadInput(manifest, input)) {
            continue;
        }

        const normalizedManifest = await normalizeManifest(manifest);
        if (
            !latestMatch ||
            new Date(normalizedManifest.updatedAt).getTime() > new Date(latestMatch.updatedAt).getTime()
        ) {
            latestMatch = normalizedManifest;
        }
    }

    return latestMatch;
};

export const createOrResumeUploadSession = async (input: {
    fileKey: string;
    mimeType: string;
    originalName: string;
    totalSizeBytes: number;
}) => {
    const totalChunks = Math.max(1, Math.ceil(input.totalSizeBytes / config.resumableChunkSizeBytes));
    const now = new Date().toISOString();

    const existing = await findResumableSession(input);
    if (existing) {
        return normalizeManifest(existing);
    }

    const manifest: UploadSessionManifest = {
        chunkSizeBytes: config.resumableChunkSizeBytes,
        createdAt: now,
        fileKey: input.fileKey,
        id: crypto.randomUUID(),
        mimeType: input.mimeType,
        originalName: input.originalName,
        status: 'uploading',
        totalChunks,
        totalSizeBytes: input.totalSizeBytes,
        updatedAt: now,
        uploadedChunkIndexes: [],
    };

    await writeManifest(manifest);
    return manifest;
};

export const getUploadSession = async (sessionId: string) => {
    const manifest = await readManifest(sessionId);
    if (!manifest) {
        throw new AppError(404, 'UPLOAD_SESSION_NOT_FOUND', 'Upload session not found.');
    }

    return normalizeManifest(manifest);
};

export const storeUploadChunk = async (sessionId: string, chunkIndex: number, chunk: Buffer) => {
    const manifest = await getUploadSession(sessionId);

    if (manifest.status !== 'uploading') {
        throw new AppError(409, 'UPLOAD_SESSION_CLOSED', 'Upload session is no longer accepting chunks.');
    }

    if (chunkIndex < 0 || chunkIndex >= manifest.totalChunks) {
        throw new AppError(400, 'UPLOAD_CHUNK_OUT_OF_RANGE', 'Chunk index is out of range.');
    }

    const expectedChunkSize =
        chunkIndex === manifest.totalChunks - 1
            ? manifest.totalSizeBytes - chunkIndex * manifest.chunkSizeBytes
            : manifest.chunkSizeBytes;

    if (chunk.length !== expectedChunkSize) {
        throw new AppError(400, 'UPLOAD_CHUNK_INVALID_SIZE', 'Chunk size does not match the expected size.');
    }

    const chunkPath = getChunkPath(sessionId, chunkIndex);
    await fs.outputFile(chunkPath, chunk);

    if (!manifest.uploadedChunkIndexes.includes(chunkIndex)) {
        manifest.uploadedChunkIndexes = [...manifest.uploadedChunkIndexes, chunkIndex].sort((left, right) => left - right);
        manifest.updatedAt = new Date().toISOString();
        await writeManifest(manifest);
    }

    return manifest;
};

export const finalizeUploadSession = async (sessionId: string) => {
    const manifest = await getUploadSession(sessionId);
    if (manifest.status === 'completed' && manifest.videoId) {
        return manifest;
    }

    if (!hasAllChunks(manifest.uploadedChunkIndexes, manifest.totalChunks)) {
        throw new AppError(409, 'UPLOAD_INCOMPLETE', 'Not all chunks have been uploaded yet.');
    }

    manifest.status = 'assembling';
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(manifest);
    return manifest;
};

export const markUploadSessionCompleted = async (sessionId: string, videoId: string) => {
    const manifest = await getUploadSession(sessionId);
    manifest.status = 'completed';
    manifest.updatedAt = new Date().toISOString();
    manifest.videoId = videoId;
    await writeManifest(manifest);
    await fs.remove(getChunksDir(sessionId));
    return manifest;
};

export const consumeUploadSessionToFile = async (sessionId: string, destinationPath: string) => {
    const manifest = await getUploadSession(sessionId);
    if (!hasAllChunks(manifest.uploadedChunkIndexes, manifest.totalChunks)) {
        throw new AppError(409, 'UPLOAD_INCOMPLETE', 'Upload session is missing chunks.');
    }

    await fs.ensureDir(path.dirname(destinationPath));
    const writeStream = fs.createWriteStream(destinationPath);

    await new Promise<void>(async (resolve, reject) => {
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);

        try {
            for (let chunkIndex = 0; chunkIndex < manifest.totalChunks; chunkIndex += 1) {
                const chunkPath = getChunkPath(sessionId, chunkIndex);
                await new Promise<void>((chunkResolve, chunkReject) => {
                    const readStream = fs.createReadStream(chunkPath);
                    readStream.on('error', chunkReject);
                    readStream.on('end', chunkResolve);
                    readStream.pipe(writeStream, { end: false });
                });
            }

            writeStream.end();
        } catch (error) {
            reject(error);
        }
    });

    const stats = await fs.stat(destinationPath);
    if (stats.size !== manifest.totalSizeBytes) {
        throw new AppError(
            409,
            'UPLOAD_ASSEMBLED_SIZE_MISMATCH',
            'Assembled upload size does not match the expected size.',
        );
    }

    return manifest;
};

export const deleteUploadSession = async (sessionId: string) => {
    await fs.remove(getSessionDir(sessionId));
};
