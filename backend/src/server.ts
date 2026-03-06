import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { getDb, updateDb, Video, Profile } from './db';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
fs.ensureDirSync(uploadsDir);

// Static files
// express.static inherently handles some caching and ETag generation for videos
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d' // Cache video files in the browser for 1 day to save massive bandwidth
}));
app.use(express.static(path.join(__dirname, '../../frontend/dist/frontend/browser')));

// Simple logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

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

// 1. Get All Videos
app.get('/api/videos', async (req, res) => {
    const db = await getDb();
    res.json(db.videos);
});

// 2. Upload Video (Wrapped to handle Multer errors gracefully)
app.post('/api/videos', (req, res, next) => {
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
app.delete('/api/videos/:id', async (req, res): Promise<any> => {
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
app.get('/api/profiles', async (req, res) => {
    const db = await getDb();
    // Cache profile lists for 15 seconds to prevent polling abuse
    res.setHeader('Cache-Control', 'public, max-age=15');
    res.json(db.profiles);
});

// 5. Create/Update Profile
app.post('/api/profiles', async (req, res) => {
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
app.delete('/api/profiles/:id', async (req, res) => {
    const { id } = req.params;

    await updateDb(db => {
        db.profiles = db.profiles.filter(p => p.id !== id);
    });

    res.json({ success: true });
});

// 8. System Status
app.get('/api/system/status', (req, res) => {
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

// Fallback for Angular routing
app.use((req, res) => {
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