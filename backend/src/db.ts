import fs from 'fs-extra';
import path from 'path';

const DB_FILE = path.join(__dirname, '../db.json');

export interface Video {
    id: string;
    filename: string; // The file saved in uploads/ (e.g. timestamp-original.mp4)
    originalName: string;
    size: number;
    uploadedAt: string;
}

export interface Profile {
    id: string;
    name: string;
    videoIds: string[]; // List of video IDs assigned to this profile
}

export interface DatabaseSchema {
    videos: Video[];
    profiles: Profile[];
}

const initialData: DatabaseSchema = {
    videos: [],
    profiles: []
};

// Ensure DB file exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeJsonSync(DB_FILE, initialData);
}

export const getDb = async (): Promise<DatabaseSchema> => {
    return fs.readJson(DB_FILE);
};

export const saveDb = async (data: DatabaseSchema): Promise<void> => {
    await fs.writeJson(DB_FILE, data, { spaces: 2 });
};
