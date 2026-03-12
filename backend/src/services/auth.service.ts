import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';
import { AppError } from '../errors';
import { dbRepository } from '../db';
import { slugify } from '../utils/slugify';

const config = getConfig();

export interface AdminTokenPayload extends jwt.JwtPayload {
    tokenType: 'admin';
    username: string;
}

export interface ProfileHeartbeatTokenPayload extends jwt.JwtPayload {
    profileId: string;
    profileSlug: string;
    tokenType: 'profile-heartbeat';
}

const verifySignedToken = (token: string) => {
    try {
        return jwt.verify(token, config.jwtSecret);
    } catch {
        throw new AppError(403, 'AUTH_INVALID', 'Authentication token is invalid.');
    }
};

const isAdminTokenPayload = (payload: string | jwt.JwtPayload): payload is AdminTokenPayload =>
    typeof payload !== 'string' &&
    payload.tokenType === 'admin' &&
    typeof payload.username === 'string';

const isProfileHeartbeatTokenPayload = (
    payload: string | jwt.JwtPayload,
): payload is ProfileHeartbeatTokenPayload =>
    typeof payload !== 'string' &&
    payload.tokenType === 'profile-heartbeat' &&
    typeof payload.profileId === 'string' &&
    typeof payload.profileSlug === 'string';

export const login = async (username: string, password: string) => {
    const dbUser = await dbRepository.findUserByUsername(username);

    let isValid = false;
    if (dbUser) {
        isValid = await bcrypt.compare(password, dbUser.passwordHash);
    } else if (username === config.adminUsername && password === config.adminPassword) {
        isValid = true;
    }

    if (!isValid) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
    }

    return jwt.sign({ tokenType: 'admin', username }, config.jwtSecret, { expiresIn: '24h' });
};

export const verifyAdminToken = (token: string) => {
    const payload = verifySignedToken(token);
    if (!isAdminTokenPayload(payload)) {
        throw new AppError(403, 'AUTH_INVALID', 'Authentication token is invalid.');
    }

    return payload;
};

export const createProfileHeartbeatToken = (profile: { id: string; name: string }) =>
    jwt.sign(
        {
            profileId: profile.id,
            profileSlug: slugify(profile.name),
            tokenType: 'profile-heartbeat',
        },
        config.jwtSecret,
    );

export const verifyProfileHeartbeatToken = (token: string, expectedSlug: string) => {
    const payload = verifySignedToken(token);
    if (!isProfileHeartbeatTokenPayload(payload) || payload.profileSlug !== expectedSlug) {
        throw new AppError(403, 'PROFILE_HEARTBEAT_INVALID', 'Player heartbeat token is invalid.');
    }

    return payload;
};
