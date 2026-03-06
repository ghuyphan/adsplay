import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { getDb, updateDb, Video, Profile, User } from './db';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-me';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// Auth Middleware
export const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
fs.ensureDirSync(uploadsDir);

// 1. Logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// 2. API Routes follow immediately to ensure they are prioritized
// (Routes will be moved here in the next chunk/step)

// Multer setup for secure uploads
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB limit
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        // Sanitize and ensure unique
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE // Prevent disk exhaustion
    },
    fileFilter: (req, file, cb) => {
        // Prevent executable uploads (.exe, .php, .sh) by strictly allowing video mimetypes
        const allowedMimeTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only video files (MP4, WebM, OGG, MOV) are allowed.'));
        }
    }
});

// Routes

// 0. Auth Routes
app.post('/api/auth/login', async (req, res): Promise<any> => {
    const { username, password } = req.body;

    // In a real app, we'd check against the users in the DB
    // For this app, we'll use the env-provided admin credentials for simplicity
    // but also allow checking against the users array if it exists.
    const db = await getDb();
    const user = db.users.find(u => u.username === username);

    let isValid = false;
    if (user) {
        isValid = await bcrypt.compare(password, user.passwordHash);
    } else if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        isValid = true;
    }

    if (isValid) {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ token });
    }

    res.status(401).json({ error: 'Invalid credentials' });
});

// 1. Get All Videos
app.get('/api/videos', authenticateToken, async (req, res) => {
    const db = await getDb();
    res.json(db.videos);
});

// 2. Upload Video (Wrapped to handle Multer errors gracefully)
app.post('/api/videos', authenticateToken, (req, res, next) => {
    upload.single('video')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // A Multer-specific error (e.g., file too large)
            return res.status(400).json({ error: err.message });
        } else if (err) {
            // A custom filter error (e.g., invalid file type)
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res): Promise<any> => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const newVideo: Video = {
        id: Date.now().toString(),
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        uploadedAt: new Date().toISOString()
    };

    await updateDb(db => {
        db.videos.push(newVideo);
    });

    res.json(newVideo);
});

// 3. Delete Video
app.delete('/api/videos/:id', authenticateToken, async (req, res): Promise<any> => {
    const { id } = req.params;
    const db = await getDb();
    const videoIndex = db.videos.findIndex(v => v.id === id);

    if (videoIndex === -1) {
        return res.status(404).json({ error: 'Video not found' });
    }

    const videoToDelete = db.videos[videoIndex];
    const filePath = path.join(__dirname, '../uploads', videoToDelete.filename);

    // Attempt to delete the physical file FIRST
    try {
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
        }
    } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
        return res.status(500).json({
            error: 'Failed to delete file from disk. Database remains unchanged to prevent orphaned files.'
        });
    }

    // Only remove from DB if the file deletion was successful
    await updateDb(async (draftDb) => {
        const index = draftDb.videos.findIndex(v => v.id === id);
        if (index !== -1) {
            draftDb.videos.splice(index, 1);
        }

        // Also remove from any profiles
        draftDb.profiles.forEach(p => {
            p.videoIds = p.videoIds.filter(vid => vid !== id);
        });
    });

    res.json({ success: true });
});

// 4. Get All Profiles
app.get('/api/profiles', authenticateToken, async (req, res) => {
    const db = await getDb();
    // Cache profile lists for 15 seconds to prevent polling abuse
    res.setHeader('Cache-Control', 'public, max-age=15');
    res.json(db.profiles);
});

// 5. Create/Update Profile
app.post('/api/profiles', authenticateToken, async (req, res) => {
    const { id, name, videoIds } = req.body;

    await updateDb(db => {
        if (id) {
            // Update
            const profile = db.profiles.find(p => p.id === id);
            if (profile) {
                profile.name = name || profile.name;
                profile.videoIds = videoIds || profile.videoIds;
            }
        } else {
            // Create
            const newProfile: Profile = {
                id: Date.now().toString(),
                name,
                videoIds: videoIds || []
            };
            db.profiles.push(newProfile);
        }
    });

    res.json({ success: true });
});

// 6. Get Single Profile (for player)
app.get('/api/profiles/:id', async (req, res): Promise<any> => {
    const { id } = req.params;
    const db = await getDb();
    const profile = db.profiles.find(p => p.id === id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Enrich with video data
    const videos = profile.videoIds
        .map(vid => db.videos.find(v => v.id === vid))
        .filter(v => v !== undefined);

    // BANDWIDTH OPTIMIZATION
    // Cache this specific profile response for 15 seconds. 
    // This allows many screens loading the same profile to hit proxy/browser caches 
    // instead of executing the full DB lookup and network transfer every single time.
    res.setHeader('Cache-Control', 'public, max-age=15');

    res.json({ ...profile, videos });
});

// 7. Delete Profile
app.delete('/api/profiles/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    await updateDb(db => {
        db.profiles = db.profiles.filter(p => p.id !== id);
    });

    res.json({ success: true });
});

// 8. System Status
app.get('/api/system/status', authenticateToken, (req, res) => {
    const { networkInterfaces, uptime } = require('os');
    const nets = networkInterfaces();
    const results: string[] = [];

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    }

    res.json({
        online: true,
        uptime: uptime(),
        localIps: results
    });
});

// 9. Profile Heartbeat
app.post('/api/profiles/:id/heartbeat', async (req, res): Promise<any> => {
    const { id } = req.params;
    let found = false;

    await updateDb(db => {
        const profile = db.profiles.find(p => p.id === id);
        if (profile) {
            profile.lastSeen = new Date().toISOString();
            found = true;
        }
    });

    if (found) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Profile not found' });
    }
});

// Static files (moved here so they don't intercept API routes)
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d'
}));
app.use(express.static(path.join(__dirname, '../../frontend/dist/frontend/browser')));

// Fallback for Angular routing
app.use((req, res) => {
    // Never serve index.html for API routes
    if (req.url.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(__dirname, '../../frontend/dist/frontend/browser/index.html'));
});

// Start
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);

    // Log local IP addresses
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`Server available at http://${net.address}:${PORT}`);
            }
        }
    }
});