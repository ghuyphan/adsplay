import { Router } from 'express';
import { asyncHandler } from '../errors';
import { authenticateToken, authenticateTokenIfPresent, type AuthenticatedRequest } from '../middleware/auth';
import {
    getDetailedProfileById,
    getDetailedProfileBySlug,
    listProfiles,
    listPublicProfiles,
    markProfileHeartbeat,
    markProfileHeartbeatBySlug,
    removeProfile,
    saveProfile,
} from '../services/profile.service';
import { requireOptionalString, requireStringArray, requireNonEmptyString } from '../utils/validation';

export const profileRouter = Router();

profileRouter.get(
    '/',
    authenticateTokenIfPresent,
    asyncHandler(async (_req, res) => {
        const req = _req as AuthenticatedRequest;
        const isAdminRequest = Boolean(req.user);
        const profiles = isAdminRequest ? await listProfiles() : await listPublicProfiles();
        res.setHeader('Cache-Control', isAdminRequest ? 'private, no-store' : 'public, max-age=15');
        res.json(profiles);
    }),
);

profileRouter.get(
    '/slug/:slug',
    asyncHandler(async (req, res) => {
        const profile = await getDetailedProfileBySlug(requireNonEmptyString(req.params.slug, 'slug'));
        res.setHeader('Cache-Control', 'public, max-age=15');
        res.json(profile);
    }),
);

profileRouter.post(
    '/slug/:slug/heartbeat',
    asyncHandler(async (req, res) => {
        const rawHeartbeatToken = req.headers['x-profile-token'];
        const heartbeatToken = requireNonEmptyString(
            Array.isArray(rawHeartbeatToken) ? rawHeartbeatToken[0] : rawHeartbeatToken,
            'x-profile-token',
            2048,
        );
        await markProfileHeartbeatBySlug(
            requireNonEmptyString(req.params.slug, 'slug'),
            heartbeatToken,
        );
        res.json({ success: true });
    }),
);

profileRouter.get(
    '/:id',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const profile = await getDetailedProfileById(requireNonEmptyString(req.params.id, 'id'));
        res.setHeader('Cache-Control', 'private, no-store');
        res.json(profile);
    }),
);

profileRouter.post(
    '/',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const name = requireNonEmptyString(req.body?.name, 'name');
        const videoIds = requireStringArray(req.body?.videoIds, 'videoIds');
        const id = requireOptionalString(req.body?.id, 'id');
        const profile = await saveProfile({ id, name, videoIds });
        res.setHeader('Cache-Control', 'private, no-store');
        res.json(profile);
    }),
);

profileRouter.delete(
    '/:id',
    authenticateToken,
    asyncHandler(async (req, res) => {
        await removeProfile(requireNonEmptyString(req.params.id, 'id'));
        res.json({ success: true });
    }),
);

profileRouter.post(
    '/:id/heartbeat',
    authenticateToken,
    asyncHandler(async (req, res) => {
        await markProfileHeartbeat(requireNonEmptyString(req.params.id, 'id'));
        res.json({ success: true });
    }),
);
