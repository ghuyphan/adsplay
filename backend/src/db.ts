import crypto from 'node:crypto';
import fs from 'fs-extra';
import { getConfig } from './config';
import type { DatabaseSchema, Profile, User, Video } from './types';
import { slugify } from './utils/slugify';

const config = getConfig();

const initialData: DatabaseSchema = {
    profiles: [],
    users: [],
    videos: [],
};

const createEntityId = () => crypto.randomUUID();

const normalizeVideo = (video: Partial<Video>): Video => {
    const timestamp = video.uploadedAt || video.createdAt || new Date().toISOString();

    return {
        createdAt: video.createdAt || timestamp,
        filename: video.filename || '',
        durationSeconds: video.durationSeconds,
        height: video.height,
        id: video.id || createEntityId(),
        mimeType: video.mimeType,
        originalName: video.originalName || '',
        processingError: video.processingError,
        processingStatus: video.processingStatus || 'ready',
        sourceFilename: video.sourceFilename || video.filename || '',
        sourceMimeType: video.sourceMimeType || video.mimeType,
        sourceSize: video.sourceSize || video.size || 0,
        size: video.size || 0,
        streamVariant: video.streamVariant || 'original',
        updatedAt: video.updatedAt || timestamp,
        uploadedAt: video.uploadedAt || timestamp,
        width: video.width,
    };
};

const normalizeProfile = (profile: Partial<Profile>): Profile => {
    const timestamp = profile.updatedAt || profile.createdAt || new Date().toISOString();

    return {
        createdAt: profile.createdAt || timestamp,
        id: profile.id || createEntityId(),
        lastSeen: profile.lastSeen,
        name: profile.name || '',
        updatedAt: profile.updatedAt || timestamp,
        videoIds: Array.isArray(profile.videoIds) ? [...new Set(profile.videoIds)] : [],
    };
};

const normalizeDb = (db: Partial<DatabaseSchema>): DatabaseSchema => ({
    profiles: (db.profiles || []).map(normalizeProfile),
    users: (db.users || []).map((user: User) => user),
    videos: (db.videos || []).map(normalizeVideo),
});

if (!fs.existsSync(config.dbFile)) {
    fs.writeJsonSync(config.dbFile, initialData, { spaces: 2 });
}

const dbCache = normalizeDb(fs.readJsonSync(config.dbFile));

let writeLock = Promise.resolve();

const persist = async () => {
    await fs.writeJson(config.dbFile, dbCache, { spaces: 2 });
};

const queueWrite = async () => {
    writeLock = writeLock.catch(() => undefined).then(() => persist());
    await writeLock;
};

const mutate = async (updater: (db: DatabaseSchema) => void) => {
    updater(dbCache);
    dbCache.videos = dbCache.videos.map(normalizeVideo);
    dbCache.profiles = dbCache.profiles.map(normalizeProfile);
    await queueWrite();
    return dbCache;
};

export const dbRepository = {
    async findProfileById(id: string) {
        return dbCache.profiles.find((profile) => profile.id === id) || null;
    },
    async findProfileBySlug(profileSlug: string) {
        return dbCache.profiles.find((profile) => slugify(profile.name) === profileSlug) || null;
    },
    async findUserByUsername(username: string) {
        return dbCache.users.find((user) => user.username === username) || null;
    },
    async findVideoById(id: string) {
        return dbCache.videos.find((video) => video.id === id) || null;
    },
    async listProfiles() {
        return dbCache.profiles.map((profile) => ({ ...profile }));
    },
    async listUsers() {
        return dbCache.users.map((user) => ({ ...user }));
    },
    async listVideos() {
        return dbCache.videos.map((video) => ({ ...video }));
    },
    async touchProfile(id: string, heartbeatAt: string) {
        return mutate((db) => {
            const profile = db.profiles.find((item) => item.id === id);
            if (!profile) {
                return;
            }

            profile.lastSeen = heartbeatAt;
            profile.updatedAt = heartbeatAt;
        });
    },
    async upsertProfile(input: { id?: string; name: string; videoIds: string[] }) {
        const now = new Date().toISOString();

        await mutate((db) => {
            if (input.id) {
                const existing = db.profiles.find((profile) => profile.id === input.id);
                if (existing) {
                    existing.name = input.name;
                    existing.videoIds = [...new Set(input.videoIds)];
                    existing.updatedAt = now;
                    return;
                }
            }

            db.profiles.push(
                normalizeProfile({
                    createdAt: now,
                    id: createEntityId(),
                    name: input.name,
                    updatedAt: now,
                    videoIds: input.videoIds,
                }),
            );
        });
    },
    async saveVideo(input: Omit<Video, 'createdAt' | 'updatedAt'>) {
        const now = new Date().toISOString();
        const newVideo = normalizeVideo({
            ...input,
            createdAt: now,
            updatedAt: now,
        });

        await mutate((db) => {
            db.videos.push(newVideo);
        });

        return newVideo;
    },
    async updateVideo(id: string, updater: (video: Video) => void) {
        let updatedVideo: Video | null = null;
        await mutate((db) => {
            const target = db.videos.find((video) => video.id === id);
            if (!target) {
                return;
            }

            updater(target);
            target.updatedAt = new Date().toISOString();
            updatedVideo = { ...target };
        });
        return updatedVideo;
    },
    async deleteProfile(id: string) {
        let deleted = false;
        await mutate((db) => {
            const before = db.profiles.length;
            db.profiles = db.profiles.filter((profile) => profile.id !== id);
            deleted = db.profiles.length !== before;
        });
        return deleted;
    },
    async deleteVideo(id: string) {
        let deletedVideo: Video | null = null;
        await mutate((db) => {
            const target = db.videos.find((video) => video.id === id) || null;
            deletedVideo = target ? { ...target } : null;
            db.videos = db.videos.filter((video) => video.id !== id);
            db.profiles = db.profiles.map((profile) => ({
                ...profile,
                updatedAt: new Date().toISOString(),
                videoIds: profile.videoIds.filter((videoId) => videoId !== id),
            }));
        });
        return deletedVideo;
    },
};
