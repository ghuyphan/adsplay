import { dbRepository } from '../db';
import { AppError } from '../errors';
import type {
    AdminDetailedProfile,
    AdminProfile,
    DetailedProfile,
    PlayerProfile,
    PlayerProfileSummary,
    Profile,
    Video,
} from '../types';
import { slugify } from '../utils/slugify';
import { createProfileHeartbeatToken, verifyProfileHeartbeatToken } from './auth.service';

const toVideoMap = (videos: Video[]) => new Map(videos.map((video) => [video.id, video] as const));
const toProfileSlug = (profile: Pick<Profile, 'name'>) => slugify(profile.name);

const withVideos = async (profile: Profile): Promise<DetailedProfile> => {
    const videos = await dbRepository.listVideos();
    const videosById = toVideoMap(videos);
    const mappedVideos = profile.videoIds
        .map((videoId) => videosById.get(videoId))
        .filter((video): video is Video => Boolean(video));

    return {
        ...profile,
        slug: toProfileSlug(profile),
        videos: mappedVideos,
    };
};

const toAdminProfile = (profile: Profile): AdminProfile => ({
    ...profile,
    playerAccessToken: createProfileHeartbeatToken(profile),
    slug: toProfileSlug(profile),
});

const toAdminDetailedProfile = (profile: DetailedProfile): AdminDetailedProfile => ({
    ...profile,
    playerAccessToken: createProfileHeartbeatToken(profile),
});

const toPlayerProfileSummary = (profile: Profile): PlayerProfileSummary => ({
    name: profile.name,
    slug: toProfileSlug(profile),
    videoCount: profile.videoIds.length,
});

const toPlayerProfile = (profile: DetailedProfile): PlayerProfile => ({
    name: profile.name,
    slug: profile.slug,
    videos: profile.videos,
});

export const listProfiles = async () => {
    const profiles = await dbRepository.listProfiles();
    return profiles.map(toAdminProfile);
};

export const listPublicProfiles = async () => {
    const profiles = await dbRepository.listProfiles();
    return profiles.map(toPlayerProfileSummary);
};

export const getDetailedProfileById = async (id: string) => {
    const profile = await dbRepository.findProfileById(id);
    if (!profile) {
        throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    }

    return toAdminDetailedProfile(await withVideos(profile));
};

export const getDetailedProfileBySlug = async (profileSlug: string) => {
    const profile = await dbRepository.findProfileBySlug(profileSlug);
    if (!profile) {
        throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    }

    return toPlayerProfile(await withVideos(profile));
};

export const saveProfile = async (input: { id?: string; name: string; videoIds: string[] }) => {
    const profiles = await dbRepository.listProfiles();
    if (input.id && !profiles.some((profile) => profile.id === input.id)) {
        throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    }

    if (!input.videoIds.length) {
        throw new AppError(400, 'PROFILE_EMPTY_PLAYLIST', 'Profile must contain at least one video.');
    }

    const nextSlug = slugify(input.name);
    const duplicate = profiles.find(
        (profile) => profile.id !== input.id && slugify(profile.name) === nextSlug,
    );

    if (duplicate) {
        throw new AppError(409, 'PROFILE_SLUG_CONFLICT', 'Profile name already exists.');
    }

    const videos = await dbRepository.listVideos();
    const videosById = toVideoMap(videos);
    const missingVideo = input.videoIds.find((videoId) => !videosById.has(videoId));
    if (missingVideo) {
        throw new AppError(400, 'VIDEO_NOT_FOUND', `Video ${missingVideo} does not exist.`);
    }

    await dbRepository.upsertProfile(input);
    const savedProfile = input.id
        ? await dbRepository.findProfileById(input.id)
        : await dbRepository.findProfileBySlug(nextSlug);

    if (!savedProfile) {
        throw new AppError(500, 'PROFILE_SAVE_FAILED', 'Failed to save profile.');
    }

    return toAdminDetailedProfile(await withVideos(savedProfile));
};

export const removeProfile = async (id: string) => {
    const deleted = await dbRepository.deleteProfile(id);
    if (!deleted) {
        throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    }
};

export const markProfileHeartbeat = async (id: string) => {
    const profile = await dbRepository.findProfileById(id);
    if (!profile) {
        throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    }

    await dbRepository.touchProfile(id, new Date().toISOString());
};

export const markProfileHeartbeatBySlug = async (profileSlug: string, token: string) => {
    const profile = await dbRepository.findProfileBySlug(profileSlug);
    if (!profile) {
        throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    }

    const payload = verifyProfileHeartbeatToken(token, profileSlug);
    if (payload.profileId !== profile.id) {
        throw new AppError(403, 'PROFILE_HEARTBEAT_INVALID', 'Player heartbeat token is invalid.');
    }

    await dbRepository.touchProfile(profile.id, new Date().toISOString());
};
