const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');
const request = require('supertest');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-play-backend-'));
const frontendDistDir = path.join(tmpRoot, 'frontend');

fs.ensureDirSync(frontendDistDir);
fs.writeFileSync(path.join(frontendDistDir, 'index.html'), '<html><body>ok</body></html>');
fs.writeFileSync(
  path.join(frontendDistDir, 'player-legacy.html'),
  '<html><body>legacy player</body></html>',
);

process.env.DB_FILE = path.join(tmpRoot, 'db.json');
process.env.UPLOADS_DIR = path.join(tmpRoot, 'uploads');
process.env.FRONTEND_DIST_DIR = frontendDistDir;
process.env.JWT_SECRET = 'test-secret';
process.env.MAX_UPLOAD_SIZE_MB = '512';
process.env.MEDIA_TRANSCODE_ENABLED = 'false';

const { createApp } = require('../dist/app');
const { dbRepository } = require('../dist/db');

const app = createApp();
const resumableChunkSizeBytes = 8 * 1024 * 1024;

const loginAsAdmin = async () => {
  const loginResponse = await request(app).post('/api/auth/login').send({
    password: 'admin',
    username: 'admin',
  });

  assert.equal(loginResponse.status, 200);
  assert.ok(loginResponse.body.token);

  return {
    authHeader: { Authorization: `Bearer ${loginResponse.body.token}` },
    token: loginResponse.body.token,
  };
};

test.after(async () => {
  await fs.remove(tmpRoot);
});

test('GET /api/health returns healthy state', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    status: 'healthy',
  });
});

test('legacy player route serves the standalone HTML page', async () => {
  const response = await request(app).get('/player-legacy/lobby-screen');

  assert.equal(response.status, 200);
  assert.match(response.text, /legacy player/i);
});

test('auth and system status flow works', async () => {
  const { authHeader, token } = await loginAsAdmin();

  const unauthorized = await request(app).get('/api/system/status');
  assert.equal(unauthorized.status, 401);

  const authorized = await request(app)
    .get('/api/system/status')
    .set(authHeader);

  assert.equal(authorized.status, 200);
  assert.equal(typeof authorized.body.online, 'boolean');
  assert.ok(Array.isArray(authorized.body.localIps));

  const malformedAdminAttempt = await request(app)
    .get('/api/system/status')
    .set('Authorization', `Bearer ${token}.tampered`);

  assert.equal(malformedAdminAttempt.status, 403);
});

test('video upload and profile lifecycle work end-to-end', async () => {
  const { authHeader } = await loginAsAdmin();

  const uploadResponse = await request(app)
    .post('/api/videos')
    .set(authHeader)
    .attach('video', Buffer.from('fake mp4 content'), {
      contentType: 'video/mp4',
      filename: 'promo.mp4',
    });

  assert.equal(uploadResponse.status, 200);
  assert.equal(uploadResponse.body.originalName, 'promo.mp4');

  const createProfileResponse = await request(app)
    .post('/api/profiles')
    .set(authHeader)
    .send({
      name: 'Lobby Screen',
      videoIds: [uploadResponse.body.id],
    });

  assert.equal(createProfileResponse.status, 200);
  assert.equal(createProfileResponse.body.slug, 'lobby-screen');
  assert.equal(createProfileResponse.body.videos.length, 1);
  assert.ok(createProfileResponse.body.playerAccessToken);

  const publicProfilesResponse = await request(app).get('/api/profiles');
  assert.equal(publicProfilesResponse.status, 200);
  const publicProfileSummary = publicProfilesResponse.body.find((profile) => profile.slug === 'lobby-screen');
  assert.deepEqual(publicProfileSummary, {
    name: 'Lobby Screen',
    slug: 'lobby-screen',
    videoCount: 1,
  });

  const adminProfilesResponse = await request(app).get('/api/profiles').set(authHeader);
  assert.equal(adminProfilesResponse.status, 200);
  const adminProfile = adminProfilesResponse.body.find((profile) => profile.id === createProfileResponse.body.id);
  assert.equal(adminProfile.playerAccessToken, createProfileResponse.body.playerAccessToken);
  assert.equal(adminProfile.videoIds.length, 1);

  const publicProfile = await request(app).get('/api/profiles/slug/lobby-screen');
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.body.name, 'Lobby Screen');
  assert.equal(publicProfile.body.slug, 'lobby-screen');
  assert.equal(publicProfile.body.id, undefined);
  assert.equal(publicProfile.body.lastSeen, undefined);

  const unauthorizedProfileById = await request(app).get(`/api/profiles/${createProfileResponse.body.id}`);
  assert.equal(unauthorizedProfileById.status, 401);

  const videosResponse = await request(app).get('/api/videos').set(authHeader);
  assert.equal(videosResponse.status, 200);
  assert.equal(videosResponse.body[0].usageCount, 1);
  assert.equal(videosResponse.body[0].processingStatus, 'ready');

  const policyResponse = await request(app).get('/api/videos/policy').set(authHeader);
  assert.equal(policyResponse.status, 200);
  assert.equal(policyResponse.body.maxUploadSizeBytes, 512 * 1024 * 1024);
  assert.equal(policyResponse.body.mediaProcessingEnabled, false);
  assert.ok(policyResponse.body.allowedMimeTypes.includes('image/png'));

  const streamResponse = await request(app)
    .get(`/api/videos/${uploadResponse.body.id}/stream`)
    .set('Range', 'bytes=0-3');
  assert.equal(streamResponse.status, 206);
  assert.match(streamResponse.headers['content-range'], /^bytes 0-3\//);

  const publicHeartbeatWithoutToken = await request(app).post('/api/profiles/slug/lobby-screen/heartbeat');
  assert.equal(publicHeartbeatWithoutToken.status, 400);

  const publicHeartbeatWithToken = await request(app)
    .post('/api/profiles/slug/lobby-screen/heartbeat')
    .set('X-Profile-Token', createProfileResponse.body.playerAccessToken);
  assert.equal(publicHeartbeatWithToken.status, 200);

  const legacyHeartbeatResponse = await request(app).post(
    `/api/profiles/${createProfileResponse.body.id}/heartbeat`,
  );
  assert.equal(legacyHeartbeatResponse.status, 401);

  const heartbeatTokenCannotAccessAdminRoutes = await request(app)
    .get('/api/system/status')
    .set('Authorization', `Bearer ${createProfileResponse.body.playerAccessToken}`);
  assert.equal(heartbeatTokenCannotAccessAdminRoutes.status, 403);

  const heartbeatResponse = await request(app)
    .post(`/api/profiles/${createProfileResponse.body.id}/heartbeat`)
    .set(authHeader);
  assert.equal(heartbeatResponse.status, 200);

  const deleteVideoResponse = await request(app)
    .delete(`/api/videos/${uploadResponse.body.id}`)
    .set(authHeader);
  assert.equal(deleteVideoResponse.status, 200);

  const updatedProfile = await request(app)
    .get(`/api/profiles/${createProfileResponse.body.id}`)
    .set(authHeader);
  assert.equal(updatedProfile.status, 200);
  assert.equal(updatedProfile.body.videos.length, 0);
  assert.ok(updatedProfile.body.lastSeen);

  const deleteProfileResponse = await request(app)
    .delete(`/api/profiles/${createProfileResponse.body.id}`)
    .set(authHeader);
  assert.equal(deleteProfileResponse.status, 200);
});

test('resumable upload sessions resume per client key without cross-client collisions', async () => {
  const { authHeader } = await loginAsAdmin();
  const fileBuffer = Buffer.from('abcdefghijklmnopqrstuvwxyz');

  const firstSessionResponse = await request(app)
    .post('/api/videos/uploads/sessions')
    .set(authHeader)
    .send({
      fileKey: 'client-a:promo.mov:26:123',
      mimeType: 'video/quicktime',
      originalName: 'promo.mov',
      totalSizeBytes: fileBuffer.length,
    });

  assert.equal(firstSessionResponse.status, 200);
  assert.equal(firstSessionResponse.body.totalChunks, 1);

  const resumedSessionResponse = await request(app)
    .post('/api/videos/uploads/sessions')
    .set(authHeader)
    .send({
      fileKey: 'client-a:promo.mov:26:123',
      mimeType: 'video/quicktime',
      originalName: 'promo.mov',
      totalSizeBytes: fileBuffer.length,
    });

  assert.equal(resumedSessionResponse.status, 200);
  assert.equal(resumedSessionResponse.body.id, firstSessionResponse.body.id);

  const secondClientSessionResponse = await request(app)
    .post('/api/videos/uploads/sessions')
    .set(authHeader)
    .send({
      fileKey: 'client-b:promo.mov:26:123',
      mimeType: 'video/quicktime',
      originalName: 'promo.mov',
      totalSizeBytes: fileBuffer.length,
    });

  assert.equal(secondClientSessionResponse.status, 200);
  assert.notEqual(secondClientSessionResponse.body.id, firstSessionResponse.body.id);
});

test('image uploads are returned as image media and can be used in profiles', async () => {
  const { authHeader } = await loginAsAdmin();

  const uploadResponse = await request(app)
    .post('/api/videos')
    .set(authHeader)
    .attach('video', Buffer.from('fake png content'), {
      contentType: 'image/png',
      filename: 'poster.png',
    });

  assert.equal(uploadResponse.status, 200);
  assert.equal(uploadResponse.body.originalName, 'poster.png');
  assert.equal(uploadResponse.body.mediaType, 'image');
  assert.equal(uploadResponse.body.processingStatus, 'ready');

  const imageStreamResponse = await request(app).get(`/api/videos/${uploadResponse.body.id}/stream`);
  assert.equal(imageStreamResponse.status, 200);
  assert.equal(imageStreamResponse.headers['content-type'], 'image/png');

  const createProfileResponse = await request(app)
    .post('/api/profiles')
    .set(authHeader)
    .send({
      name: 'Image Screen',
      videoIds: [uploadResponse.body.id],
    });

  assert.equal(createProfileResponse.status, 200);
  assert.equal(createProfileResponse.body.videos.length, 1);
  assert.equal(createProfileResponse.body.videos[0].mediaType, 'image');

  const publicProfile = await request(app).get('/api/profiles/slug/image-screen');
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.body.videos[0].mediaType, 'image');
});

test('resumable upload sessions reject undersized non-final chunks and still assemble valid uploads', async () => {
  const { authHeader } = await loginAsAdmin();
  const fileBuffer = Buffer.alloc(resumableChunkSizeBytes + 32, 'a');

  const sessionResponse = await request(app)
    .post('/api/videos/uploads/sessions')
    .set(authHeader)
    .send({
      fileKey: 'client-a:large-promo.mov',
      mimeType: 'video/quicktime',
      originalName: 'large-promo.mov',
      totalSizeBytes: fileBuffer.length,
    });

  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionResponse.body.totalChunks, 2);

  const shortChunkResponse = await request(app)
    .put(`/api/videos/uploads/sessions/${sessionResponse.body.id}/chunks/0`)
    .set(authHeader)
    .set('Content-Type', 'application/octet-stream')
    .send(fileBuffer.subarray(0, resumableChunkSizeBytes - 1024));

  assert.equal(shortChunkResponse.status, 400);
  assert.equal(shortChunkResponse.body.error.code, 'UPLOAD_CHUNK_INVALID_SIZE');

  const chunkResponse = await request(app)
    .put(`/api/videos/uploads/sessions/${sessionResponse.body.id}/chunks/0`)
    .set(authHeader)
    .set('Content-Type', 'application/octet-stream')
    .send(fileBuffer.subarray(0, resumableChunkSizeBytes));

  assert.equal(chunkResponse.status, 200);
  assert.deepEqual(chunkResponse.body.uploadedChunkIndexes, [0]);

  const finalChunkResponse = await request(app)
    .put(`/api/videos/uploads/sessions/${sessionResponse.body.id}/chunks/1`)
    .set(authHeader)
    .set('Content-Type', 'application/octet-stream')
    .send(fileBuffer.subarray(resumableChunkSizeBytes));
  assert.equal(finalChunkResponse.status, 200);
  assert.deepEqual(finalChunkResponse.body.uploadedChunkIndexes, [0, 1]);

  const completeResponse = await request(app)
    .post(`/api/videos/uploads/sessions/${sessionResponse.body.id}/complete`)
    .set(authHeader);

  assert.equal(completeResponse.status, 200);
  assert.equal(completeResponse.body.originalName, 'large-promo.mov');
  assert.equal(completeResponse.body.sourceSize, fileBuffer.length);
});

test('missing video files return a clean app error', async () => {
  const { authHeader } = await loginAsAdmin();

  const uploadResponse = await request(app)
    .post('/api/videos')
    .set(authHeader)
    .attach('video', Buffer.from('fake mp4 content'), {
      contentType: 'video/mp4',
      filename: 'missing.mp4',
    });

  await fs.remove(path.join(process.env.UPLOADS_DIR, uploadResponse.body.filename));

  const streamResponse = await request(app).get(`/api/videos/${uploadResponse.body.id}/stream`);

  assert.equal(streamResponse.status, 404);
  assert.equal(streamResponse.body.error.code, 'VIDEO_FILE_NOT_FOUND');
});

test('poster and HLS asset routes serve generated media artifacts when metadata exists', async () => {
  const { authHeader } = await loginAsAdmin();

  const uploadResponse = await request(app)
    .post('/api/videos')
    .set(authHeader)
    .attach('video', Buffer.from('fake mp4 content'), {
      contentType: 'video/mp4',
      filename: 'artifacts.mp4',
    });

  const posterRelativePath = path.join('processed', 'posters', `${uploadResponse.body.id}.jpg`);
  const hlsManifestRelativePath = path.join('processed', 'hls', uploadResponse.body.id, 'playlist.m3u8');
  const hlsSegmentRelativePath = path.join('processed', 'hls', uploadResponse.body.id, 'segment-000.ts');

  await fs.outputFile(path.join(process.env.UPLOADS_DIR, posterRelativePath), Buffer.from('poster'));
  await fs.outputFile(
    path.join(process.env.UPLOADS_DIR, hlsManifestRelativePath),
    '#EXTM3U\n#EXTINF:6,\nsegment-000.ts\n#EXT-X-ENDLIST\n',
  );
  await fs.outputFile(path.join(process.env.UPLOADS_DIR, hlsSegmentRelativePath), Buffer.from('segment'));

  await dbRepository.updateVideo(uploadResponse.body.id, (draft) => {
    draft.posterFilename = posterRelativePath;
    draft.hlsManifestPath = hlsManifestRelativePath;
  });

  const posterResponse = await request(app).get(`/api/videos/${uploadResponse.body.id}/poster`);
  assert.equal(posterResponse.status, 200);
  assert.equal(posterResponse.headers['content-type'], 'image/jpeg');

  const manifestResponse = await request(app).get(`/api/videos/${uploadResponse.body.id}/hls/playlist.m3u8`);
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.text, /#EXTM3U/);
  assert.equal(
    manifestResponse.headers['content-type'],
    'application/vnd.apple.mpegurl',
  );

  const segmentResponse = await request(app).get(`/api/videos/${uploadResponse.body.id}/hls/segment-000.ts`);
  assert.equal(segmentResponse.status, 200);
  assert.equal(segmentResponse.headers['content-type'], 'video/mp2t');
});
