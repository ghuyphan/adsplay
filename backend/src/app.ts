import express from 'express';
import path from 'node:path';
import { getConfig } from './config';
import { requestIdMiddleware } from './middleware/request-id';
import { requestLoggerMiddleware } from './middleware/request-logger';
import { errorMiddleware, notFoundMiddleware } from './middleware/error-handler';
import { authRouter } from './routes/auth.routes';
import { profileRouter } from './routes/profile.routes';
import { systemRouter } from './routes/system.routes';
import { videoRouter } from './routes/video.routes';

export const createApp = () => {
    const config = getConfig();
    const app = express();

    app.use(requestIdMiddleware);
    app.use(requestLoggerMiddleware);
    app.use(express.json({ limit: '1mb' }));

    app.get('/api/health', (_req, res) => {
        res.json({ ok: true, status: 'healthy' });
    });

    app.get('/api/health/ready', (_req, res) => {
        res.json({ ok: true, status: 'ready' });
    });

    app.use('/api/auth', authRouter);
    app.use('/api/videos', videoRouter);
    app.use('/api/profiles', profileRouter);
    app.use('/api/system', systemRouter);

    app.use(
        '/uploads',
        express.static(config.uploadsDir, {
            etag: true,
            maxAge: '1d',
        }),
    );

    app.get(['/player-legacy', '/player-legacy/:profileName'], (_req, res) => {
        const legacyPlayerFile = path.join(config.frontendDistDir, 'player-legacy.html');
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(legacyPlayerFile);
    });

    app.use(express.static(config.frontendDistDir));

    app.use('/api', notFoundMiddleware);

    app.use((req, res) => {
        const indexFile = path.join(config.frontendDistDir, 'index.html');
        res.sendFile(indexFile);
    });

    app.use(errorMiddleware);

    return app;
};
