import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { getDb, saveDb, Video, Profile } from './db';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../../frontend/dist/frontend/browser')));

// Simple logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});



// Multer setup for uploads
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
const upload = multer({ storage });

// Routes

// 1. Get All Videos
app.get('/api/videos', async (req, res) => {
    const db = await getDb();
    res.json(db.videos);
});

// 2. Upload Video
app.post('/api/videos', upload.single('video'), async (req, res): Promise<any> => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const db = await getDb();
    const newVideo: Video = {
        id: Date.now().toString(),
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        uploadedAt: new Date().toISOString()
    };

    db.videos.push(newVideo);
    await saveDb(db);

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

    const video = db.videos[videoIndex];
    // Remove file
    const filePath = path.join(__dirname, '../uploads', video.filename);
    if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
    }

    // Remove from DB
    db.videos.splice(videoIndex, 1);

    // Also remove from any profiles
    db.profiles.forEach(p => {
        p.videoIds = p.videoIds.filter(vid => vid !== id);
    });

    await saveDb(db);
    res.json({ success: true });
});

// 4. Get All Profiles
app.get('/api/profiles', async (req, res) => {
    const db = await getDb();
    res.json(db.profiles);
});

// 5. Create/Update Profile
app.post('/api/profiles', async (req, res) => {
    const { id, name, videoIds } = req.body;
    const db = await getDb();

    if (id) {
        // Update
        const profile = db.profiles.find(p => p.id === id);
        if (profile) {
            profile.name = name || profile.name;
            profile.videoIds = videoIds || profile.videoIds;
        } else {
            // Create new if ID sent but not found? Or treat as error? 
            // Let's assume create new generic logic below is better
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

    await saveDb(db);
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

    res.json({ ...profile, videos });
});

// 7. Delete Profile
app.delete('/api/profiles/:id', async (req, res) => {
    const { id } = req.params;
    const db = await getDb();
    db.profiles = db.profiles.filter(p => p.id !== id);
    await saveDb(db);
    res.json({ success: true });
});


// Fallback for Angular routing
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/frontend/browser/index.html'));
});

// Start
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});
