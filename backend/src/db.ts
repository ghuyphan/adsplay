import fs from 'fs-extra';
import path from 'path';

const DB_FILE = path.join(__dirname, '../db.json');

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
    lastSeen?: string;
}

export interface DatabaseSchema {
    videos: Video[];
    profiles: Profile[];
}

const initialData: DatabaseSchema = {
    videos: [],
    profiles: []
};

// Ensure DB file exists on startup
if (!fs.existsSync(DB_FILE)) {
    fs.writeJsonSync(DB_FILE, initialData, { spaces: 2 });
}

// Load the database into memory once on startup (fixes Memory & Performance Scaling)
const dbCache: DatabaseSchema = fs.readJsonSync(DB_FILE);

// Lock to ensure background disk writes happen sequentially
let writeLock = Promise.resolve();

export const getDb = async (): Promise<DatabaseSchema> => {
    return dbCache; // Instant memory read
};

export const updateDb = async (updater: (db: DatabaseSchema) => void | Promise<void>): Promise<DatabaseSchema> => {
    // 1. Instantly apply updates to the in-memory cache
    await updater(dbCache);

    // 2. Queue the disk write in the background so it doesn't block the API response
    let release: () => void;
    const nextLock = new Promise<void>(resolve => {
        release = resolve;
    });

    const currentLock = writeLock;
    writeLock = currentLock.then(() => nextLock);

    currentLock.then(async () => {
        try {
            await fs.writeJson(DB_FILE, dbCache, { spaces: 2 });
        } catch (err) {
            console.error("Failed to write DB to disk:", err);
        } finally {
            release!();
        }
    });

    return dbCache;
};