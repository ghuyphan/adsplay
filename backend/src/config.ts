import path from 'node:path';
import fs from 'fs-extra';

const ENV_FILE_PATH = path.join(__dirname, '../.env');
const DEFAULT_JWT_SECRET = 'your-secret-key-change-me';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

const loadEnvFile = () => {
    if (!fs.existsSync(ENV_FILE_PATH)) {
        return;
    }

    const lines = fs.readFileSync(ENV_FILE_PATH, 'utf8').split(/\r?\n/);

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            continue;
        }

        const separatorIndex = trimmedLine.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmedLine.slice(0, separatorIndex).trim();
        if (!key || process.env[key] !== undefined) {
            continue;
        }

        let value = trimmedLine.slice(separatorIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    }
};

loadEnvFile();

export interface AppConfig {
    adminPassword: string;
    adminUsername: string;
    dbFile: string;
    frontendDistDir: string;
    isProduction: boolean;
    jwtSecret: string;
    mediaProcessingEnabled: boolean;
    resumableChunkSizeBytes: number;
    maxUploadSizeBytes: number;
    processedUploadsDir: string;
    port: number;
    uploadSessionsDir: string;
    uploadsDir: string;
}

let cachedConfig: AppConfig | null = null;

const parsePort = (input: string | undefined) => {
    const parsed = Number(input ?? '3000');
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid PORT value: ${input}`);
    }
    return parsed;
};

export const getConfig = (): AppConfig => {
    if (cachedConfig) {
        return cachedConfig;
    }

    const port = parsePort(process.env.PORT);
    const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    const adminUsername = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    const isProduction = process.env.NODE_ENV === 'production';
    const maxUploadSizeMb = Number(process.env.MAX_UPLOAD_SIZE_MB || '2048');
    const mediaProcessingEnabled = process.env.MEDIA_TRANSCODE_ENABLED !== 'false';
    const resumableChunkSizeMb = Number(process.env.RESUMABLE_CHUNK_SIZE_MB || '8');

    if (!Number.isFinite(maxUploadSizeMb) || maxUploadSizeMb < 100) {
        throw new Error('MAX_UPLOAD_SIZE_MB must be a number greater than or equal to 100.');
    }

    if (!Number.isFinite(resumableChunkSizeMb) || resumableChunkSizeMb < 1 || resumableChunkSizeMb > 64) {
        throw new Error('RESUMABLE_CHUNK_SIZE_MB must be between 1 and 64.');
    }

    if (isProduction) {
        if (jwtSecret === DEFAULT_JWT_SECRET) {
            throw new Error('JWT_SECRET must be set in production.');
        }

        if (adminUsername === DEFAULT_ADMIN_USERNAME && adminPassword === DEFAULT_ADMIN_PASSWORD) {
            throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be changed in production.');
        }
    }

    const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
    const processedUploadsDir = path.join(uploadsDir, 'processed');
    const uploadSessionsDir = path.join(uploadsDir, '.sessions');
    const dbFile = process.env.DB_FILE || path.join(__dirname, '../db.json');
    const frontendDistDir =
        process.env.FRONTEND_DIST_DIR || path.join(__dirname, '../../frontend/dist/frontend/browser');

    fs.ensureDirSync(uploadsDir);
    fs.ensureDirSync(processedUploadsDir);
    fs.ensureDirSync(uploadSessionsDir);

    cachedConfig = {
        adminPassword,
        adminUsername,
        dbFile,
        frontendDistDir,
        isProduction,
        jwtSecret,
        mediaProcessingEnabled,
        resumableChunkSizeBytes: resumableChunkSizeMb * 1024 * 1024,
        maxUploadSizeBytes: maxUploadSizeMb * 1024 * 1024,
        processedUploadsDir,
        port,
        uploadSessionsDir,
        uploadsDir,
    };

    return cachedConfig;
};
