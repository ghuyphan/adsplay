import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors';
import type { AdminTokenPayload } from '../services/auth.service';
import { verifyAdminToken } from '../services/auth.service';

export interface AuthenticatedRequest extends Request {
    user?: AdminTokenPayload;
}

const readBearerToken = (req: Request) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return null;
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        throw new AppError(403, 'AUTH_INVALID', 'Authentication token is invalid.');
    }

    return token;
};

const assignVerifiedUser = (req: AuthenticatedRequest, token: string) => {
    req.user = verifyAdminToken(token);
};

export const authenticateToken = (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
) => {
    let token: string | null = null;

    try {
        token = readBearerToken(req);
    } catch (error) {
        next(error);
        return;
    }

    if (!token) {
        next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
        return;
    }

    try {
        assignVerifiedUser(req, token);
        next();
    } catch (error) {
        next(error);
    }
};

export const authenticateTokenIfPresent = (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
) => {
    let token: string | null = null;

    try {
        token = readBearerToken(req);
    } catch (error) {
        next(error);
        return;
    }

    if (!token) {
        next();
        return;
    }

    try {
        assignVerifiedUser(req, token);
        next();
    } catch (error) {
        next(error);
    }
};
