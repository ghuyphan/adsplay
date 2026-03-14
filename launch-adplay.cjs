#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const rootDir = __dirname;
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const envFilePath = path.join(backendDir, '.env');
const accessFilePath = path.join(rootDir, 'AdPlay Access.txt');
const pidFilePath = path.join(rootDir, '.adplay-server.pid');
const backendDistEntry = path.join(backendDir, 'dist', 'server.js');
const frontendIndexFile = path.join(frontendDir, 'dist', 'frontend', 'browser', 'index.html');
const httpsCertDir = path.join(backendDir, '.certs');
const httpsKeyPath = path.join(httpsCertDir, 'adplay-local-key.pem');
const httpsCertPath = path.join(httpsCertDir, 'adplay-local-cert.pem');
const knownEnvKeys = [
    'PORT',
    'AUTO_HTTPS',
    'HTTPS_ENABLED',
    'HTTPS_KEY_FILE',
    'HTTPS_CERT_FILE',
    'JWT_SECRET',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD',
    'MAX_UPLOAD_SIZE_MB',
    'MEDIA_TRANSCODE_ENABLED',
    'RESUMABLE_CHUNK_SIZE_MB',
];
const skipDirNames = new Set(['.angular', '.git', 'dist', 'node_modules', 'uploads']);
const args = new Set(process.argv.slice(2));
const shouldOpenBrowser = !args.has('--no-open');

const logSection = (title) => {
    console.log('');
    console.log('=========================================================');
    console.log(title);
    console.log('=========================================================');
};

const parseEnvFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const values = {};
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
};

const formatEnvValue = (value) => {
    if (value === '') {
        return '""';
    }

    if (/[\s#"']/u.test(value)) {
        return JSON.stringify(value);
    }

    return value;
};

const isPlaceholderSecret = (value) =>
    !value || value === 'change-me' || value === 'your-secret-key-change-me';

const buildEnvFileContents = (values, existing) => {
    const outputLines = [
        '# AdPlay local settings',
        '# This file is created automatically the first time you launch AdPlay.',
        '# You can edit these values later if you need to change the login or port.',
        ...knownEnvKeys.map((key) => `${key}=${formatEnvValue(values[key] ?? '')}`),
    ];

    const extraKeys = Object.keys(existing)
        .filter((key) => !knownEnvKeys.includes(key))
        .sort((left, right) => left.localeCompare(right));

    if (extraKeys.length) {
        outputLines.push('', '# Additional custom settings');
        for (const key of extraKeys) {
            outputLines.push(`${key}=${formatEnvValue(existing[key])}`);
        }
    }

    return `${outputLines.join(os.EOL)}${os.EOL}`;
};

const writeManagedEnvFile = (values, existing) => {
    const nextContents = buildEnvFileContents(values, existing);
    const currentContents = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : null;
    if (currentContents !== nextContents) {
        fs.writeFileSync(envFilePath, nextContents, 'utf8');
        return true;
    }

    return false;
};

const ensureManagedEnvFile = () => {
    const fileExists = fs.existsSync(envFilePath);
    const existing = parseEnvFile(envFilePath);
    const next = { ...existing };
    let changed = !fileExists;

    const ensureValue = (key, value, shouldReplace = false) => {
        const hasValue = typeof next[key] === 'string' && next[key].trim() !== '';
        if (!hasValue || shouldReplace) {
            if (next[key] !== value) {
                next[key] = value;
                changed = true;
            }
        }
    };

    ensureValue('PORT', '3000');
    ensureValue('AUTO_HTTPS', 'true');
    ensureValue('HTTPS_ENABLED', 'false');
    ensureValue('HTTPS_KEY_FILE', '');
    ensureValue('HTTPS_CERT_FILE', '');
    ensureValue('JWT_SECRET', crypto.randomBytes(32).toString('hex'), isPlaceholderSecret(next.JWT_SECRET));
    ensureValue('ADMIN_USERNAME', 'admin');
    ensureValue('ADMIN_PASSWORD', 'admin');
    ensureValue('MAX_UPLOAD_SIZE_MB', '2048');
    ensureValue('MEDIA_TRANSCODE_ENABLED', 'true');
    ensureValue('RESUMABLE_CHUNK_SIZE_MB', '8');

    changed = writeManagedEnvFile(next, existing) || changed;

    return {
        changed,
        created: !fileExists,
        existing,
        values: next,
    };
};

const getLatestModifiedTime = (targetPath) => {
    if (!fs.existsSync(targetPath)) {
        return 0;
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
        return stats.mtimeMs;
    }

    let latest = stats.mtimeMs;
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
        if (entry.isDirectory() && skipDirNames.has(entry.name)) {
            continue;
        }

        latest = Math.max(latest, getLatestModifiedTime(path.join(targetPath, entry.name)));
    }

    return latest;
};

const needsBuild = (outputFilePath, inputs) => {
    if (!fs.existsSync(outputFilePath)) {
        return true;
    }

    const outputTime = fs.statSync(outputFilePath).mtimeMs;
    const latestInputTime = inputs.reduce(
        (latest, targetPath) => Math.max(latest, getLatestModifiedTime(targetPath)),
        0,
    );

    return latestInputTime > outputTime;
};

const describeSpawnError = (label, error) => {
    const message = error && typeof error.message === 'string' ? error.message : String(error);

    if (process.platform === 'win32') {
        return `${label} could not start (${message}). Windows had trouble launching a child process.`;
    }

    return `${label} could not start (${message}).`;
};

const createSpawnOptions = (overrides = {}) => ({
    stdio: 'inherit',
    windowsHide: false,
    ...overrides,
});

const spawnWithFriendlyErrors = (label, command, commandArgs, options) => {
    try {
        return spawn(command, commandArgs, createSpawnOptions(options));
    } catch (error) {
        throw new Error(describeSpawnError(label, error));
    }
};

const findNpmCliPath = () => {
    const execDir = path.dirname(process.execPath);
    const candidates = [
        path.join(execDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        path.resolve(execDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        path.resolve(execDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ];

    return candidates.find((candidatePath) => fs.existsSync(candidatePath)) || null;
};

const getNpmLaunchSpec = () => {
    const npmCliPath = findNpmCliPath();
    if (npmCliPath) {
        return {
            command: process.execPath,
            commandArgs: [npmCliPath],
            shell: false,
        };
    }

    return {
        command: 'npm',
        commandArgs: [],
        shell: process.platform === 'win32',
    };
};

const runCommand = (label, command, commandArgs, cwd, spawnOptions = {}) =>
    new Promise((resolve, reject) => {
        console.log(`${label}...`);
        let child;

        try {
            child = spawnWithFriendlyErrors(label, command, commandArgs, {
                cwd,
                ...spawnOptions,
            });
        } catch (error) {
            reject(error);
            return;
        }

        child.on('error', (error) => {
            reject(new Error(describeSpawnError(label, error)));
        });
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`${label} failed with exit code ${code ?? 'unknown'}.`));
        });
    });

const runNpmCommand = (label, npmArgs, cwd) => {
    const npmLaunchSpec = getNpmLaunchSpec();

    return runCommand(
        label,
        npmLaunchSpec.command,
        [...npmLaunchSpec.commandArgs, ...npmArgs],
        cwd,
        { shell: npmLaunchSpec.shell },
    );
};

const ensureDependencies = async (directory, label) => {
    if (fs.existsSync(path.join(directory, 'node_modules'))) {
        return;
    }

    await runNpmCommand(`Installing ${label} dependencies`, ['install', '--no-fund', '--no-audit'], directory);
};

const getLocalIpv4Addresses = () => {
    const addresses = [];
    const networkInterfaces = os.networkInterfaces();

    for (const interfaces of Object.values(networkInterfaces)) {
        for (const address of interfaces || []) {
            if (address.family === 'IPv4' && !address.internal && !addresses.includes(address.address)) {
                addresses.push(address.address);
            }
        }
    }

    return addresses;
};

const parseBooleanEnv = (value, defaultValue = false) => {
    if (typeof value !== 'string' || value.trim() === '') {
        return defaultValue;
    }

    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const runQuietCommand = (command, commandArgs, cwd) =>
    new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let child;

        try {
            child = spawn(command, commandArgs, {
                cwd,
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        } catch (error) {
            reject(error);
            return;
        }

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }

            reject(new Error(stderr.trim() || stdout.trim() || `Command failed with exit code ${code ?? 'unknown'}.`));
        });
    });

const isCommandAvailable = async (command) => {
    try {
        await runQuietCommand(command, ['--version'], rootDir);
        return true;
    } catch {
        return false;
    }
};

const ensureHttpsCertificates = async (hosts) => {
    fs.mkdirSync(httpsCertDir, { recursive: true });

    await runCommand('Installing local HTTPS trust', 'mkcert', ['-install'], rootDir);
    await runCommand(
        'Generating local HTTPS certificate',
        'mkcert',
        ['-key-file', httpsKeyPath, '-cert-file', httpsCertPath, ...hosts],
        backendDir,
    );
};

const readManagedPid = () => {
    if (!fs.existsSync(pidFilePath)) {
        return null;
    }

    const raw = fs.readFileSync(pidFilePath, 'utf8').trim();
    const pid = Number.parseInt(raw, 10);
    if (!Number.isInteger(pid) || pid <= 0) {
        fs.rmSync(pidFilePath, { force: true });
        return null;
    }

    try {
        process.kill(pid, 0);
        return pid;
    } catch {
        fs.rmSync(pidFilePath, { force: true });
        return null;
    }
};

const waitForPortToBeAvailable = (port, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;

        const poll = async () => {
            try {
                if (await isPortAvailable(port)) {
                    resolve();
                    return;
                }
            } catch (error) {
                reject(error);
                return;
            }

            if (Date.now() >= deadline) {
                reject(new Error(`Timed out waiting for port ${port} to become available.`));
                return;
            }

            setTimeout(poll, 500);
        };

        poll();
    });

const stopManagedServer = async (port) => {
    const pid = readManagedPid();
    if (!pid) {
        return false;
    }

    try {
        process.kill(pid, 'SIGTERM');
    } catch {
        fs.rmSync(pidFilePath, { force: true });
        return false;
    }
    await waitForPortToBeAvailable(port);
    fs.rmSync(pidFilePath, { force: true });
    return true;
};

const writeAccessFile = ({ adminPassword, adminUsername, localIps, port, protocol }) => {
    const lines = [
        'AdPlay Access',
        '',
        `Admin dashboard (this computer): ${protocol}://localhost:${port}/admin`,
        ...localIps.map((ip, index) => {
            const label = index === 0 ? 'Admin dashboard (same network)' : 'Admin dashboard (alternate IP)';
            return `${label}: ${protocol}://${ip}:${port}/admin`;
        }),
        '',
        ...(
            localIps.length
                ? localIps.map((ip, index) => {
                    const label = index === 0 ? 'Player link for TVs/tablets' : 'Player link (alternate IP)';
                    return `${label}: ${protocol}://${ip}:${port}/player`;
                })
                : [`Player link: ${protocol}://localhost:${port}/player`]
        ),
        '',
        'Login',
        `Username: ${adminUsername}`,
        `Password: ${adminPassword}`,
        '',
        'Keep the AdPlay window open while the app is running.',
    ];

    fs.writeFileSync(accessFilePath, `${lines.join(os.EOL)}${os.EOL}`, 'utf8');
};

const openBrowser = (url) =>
    new Promise((resolve) => {
        const onComplete = () => resolve();

        if (process.platform === 'darwin') {
            execFile('open', [url], onComplete);
            return;
        }

        if (process.platform === 'win32') {
            execFile('cmd', ['/c', 'start', '', url], onComplete);
            return;
        }

        execFile('xdg-open', [url], onComplete);
    });

const getJson = (url, timeoutMs = 3000) =>
    new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                try {
                    resolve({
                        body: body ? JSON.parse(body) : null,
                        statusCode: response.statusCode ?? 0,
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });

        request.on('error', reject);
        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`Timed out waiting for ${url}.`));
        });
    });

const getJsonWithHttps = (url, timeoutMs = 3000) =>
    new Promise((resolve, reject) => {
        const request = https.get(
            url,
            {
                rejectUnauthorized: false,
            },
            (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    body += chunk;
                });
                response.on('end', () => {
                    try {
                        resolve({
                            body: body ? JSON.parse(body) : null,
                            statusCode: response.statusCode ?? 0,
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            },
        );

        request.on('error', reject);
        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`Timed out waiting for ${url}.`));
        });
    });

const waitForServerReady = (url, timeoutMs = 45000) =>
    new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;

        const poll = () => {
            const request = http.get(url, (response) => {
                response.resume();
                if (response.statusCode && response.statusCode < 500) {
                    resolve();
                    return;
                }

                retry();
            });

            request.on('error', retry);
            request.setTimeout(3000, () => {
                request.destroy();
                retry();
            });
        };

        const retry = () => {
            if (Date.now() >= deadline) {
                reject(new Error(`Timed out waiting for ${url}.`));
                return;
            }

            setTimeout(poll, 750);
        };

        poll();
    });

const isPortAvailable = (port) =>
    new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();

        server.once('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                resolve(false);
                return;
            }

            reject(error);
        });

        server.listen(port, '0.0.0.0', () => {
            server.close(() => resolve(true));
        });
    });

const isAdPlayAlreadyRunning = async (port) => {
    try {
        const response = await getJson(`http://127.0.0.1:${port}/api/health`);
        return response.statusCode === 200 && response.body?.ok === true;
    } catch {
        return false;
    }
};

const getRunningProtocol = async (port) => {
    try {
        const response = await getJson(`http://127.0.0.1:${port}/api/health`);
        if (response.statusCode === 200 && response.body?.ok === true) {
            return 'http';
        }
    } catch {
        // ignore
    }

    try {
        const response = await getJsonWithHttps(`https://127.0.0.1:${port}/api/health`);
        if (response.statusCode === 200 && response.body?.ok === true) {
            return 'https';
        }
    } catch {
        // ignore
    }

    return null;
};

const main = async () => {
    logSection('AdPlay One-Click Startup');

    const envState = ensureManagedEnvFile();
    const port = Number.parseInt(envState.values.PORT || '3000', 10) || 3000;
    const localIps = getLocalIpv4Addresses();
    const autoHttpsEnabled = parseBooleanEnv(envState.values.AUTO_HTTPS, true);
    const mkcertInstalled = await isCommandAvailable('mkcert');
    const shouldAutoEnableHttps = autoHttpsEnabled && mkcertInstalled;

    if (shouldAutoEnableHttps) {
        const certificateHosts = ['localhost', '127.0.0.1', '::1', ...localIps].filter(
            (host, index, allHosts) => allHosts.indexOf(host) === index,
        );

        await ensureHttpsCertificates(certificateHosts);
        envState.values.HTTPS_ENABLED = 'true';
        envState.values.HTTPS_KEY_FILE = httpsKeyPath;
        envState.values.HTTPS_CERT_FILE = httpsCertPath;
    }

    const envPersisted = writeManagedEnvFile(envState.values, envState.existing);
    envState.changed = envState.changed || envPersisted;
    const protocol = parseBooleanEnv(envState.values.HTTPS_ENABLED, false) ? 'https' : 'http';

    if (envState.created) {
        console.log(`Created ${path.relative(rootDir, envFilePath)} with local app settings.`);
    } else if (envState.changed) {
        console.log(`Updated ${path.relative(rootDir, envFilePath)} with any missing settings.`);
    }

    writeAccessFile({
        adminPassword: envState.values.ADMIN_PASSWORD,
        adminUsername: envState.values.ADMIN_USERNAME,
        localIps,
        port,
        protocol,
    });
    console.log(`Wrote access details to ${path.relative(rootDir, accessFilePath)}.`);

    await ensureDependencies(backendDir, 'backend');
    await ensureDependencies(frontendDir, 'frontend');

    if (
        needsBuild(frontendIndexFile, [
            path.join(frontendDir, 'public'),
            path.join(frontendDir, 'src'),
            path.join(frontendDir, 'angular.json'),
            path.join(frontendDir, 'package.json'),
            path.join(frontendDir, 'package-lock.json'),
            path.join(frontendDir, 'tsconfig.app.json'),
            path.join(frontendDir, 'tsconfig.json'),
        ])
    ) {
        await runNpmCommand('Building frontend', ['run', 'build'], frontendDir);
    } else {
        console.log('Frontend build is up to date.');
    }

    if (
        needsBuild(backendDistEntry, [
            path.join(backendDir, 'src'),
            path.join(backendDir, 'package.json'),
            path.join(backendDir, 'package-lock.json'),
            path.join(backendDir, 'tsconfig.json'),
        ])
    ) {
        await runNpmCommand('Building backend', ['run', 'build'], backendDir);
    } else {
        console.log('Backend build is up to date.');
    }

    const preferredHost = localIps[0] || 'localhost';
    const adminUrl = `${protocol}://${preferredHost}:${port}/admin`;
    const localAdminUrl = `${protocol}://localhost:${port}/admin`;
    const playerUrls = localIps.map((ip) => `${protocol}://${ip}:${port}/player`);

    logSection('Starting AdPlay');
    console.log(`Admin:  ${adminUrl}`);
    if (adminUrl !== localAdminUrl) {
        console.log(`Local:  ${localAdminUrl}`);
    }
    if (playerUrls.length) {
        console.log(`Player: ${playerUrls[0]}`);
    }
    console.log(`Login:  ${envState.values.ADMIN_USERNAME} / ${envState.values.ADMIN_PASSWORD}`);
    console.log(`Info:   ${path.relative(rootDir, accessFilePath)}`);
    console.log('');

    if (!(await isPortAvailable(port))) {
        const runningProtocol = await getRunningProtocol(port);
        if (runningProtocol) {
            const needsRestart = runningProtocol !== protocol || (envPersisted && protocol === 'https');

            if (needsRestart) {
                const restarted = await stopManagedServer(port);
                if (!restarted) {
                    throw new Error(
                        `AdPlay is already running on port ${port} over ${runningProtocol}. Stop the existing app once so the launcher can switch it to ${protocol}.`,
                    );
                }
            } else {
                console.log(`AdPlay is already running on port ${port}.`);
                if (shouldOpenBrowser) {
                    await openBrowser(`${runningProtocol}://${preferredHost}:${port}/admin`);
                }
                return;
            }
        } else if (await isAdPlayAlreadyRunning(port)) {
            console.log(`AdPlay is already running on port ${port}.`);
            if (shouldOpenBrowser) {
                await openBrowser(adminUrl);
            }
            return;
        }

        throw new Error(
            `Port ${port} is already in use. Close the other app using that port or change PORT in backend/.env.`,
        );
    }

    const serverProcess = spawnWithFriendlyErrors('Starting AdPlay', process.execPath, [backendDistEntry], {
        cwd: backendDir,
        env: {
            ...process.env,
            ...envState.values,
        },
    });
    fs.writeFileSync(pidFilePath, `${serverProcess.pid}${os.EOL}`, 'utf8');

    let openedBrowser = false;
    let shuttingDown = false;

    const stopServer = () => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        if (!serverProcess.killed) {
            serverProcess.kill('SIGTERM');
        }
    };

    const cleanupPidFile = () => {
        const rawPid = fs.existsSync(pidFilePath) ? fs.readFileSync(pidFilePath, 'utf8').trim() : '';
        if (rawPid === String(serverProcess.pid)) {
            fs.rmSync(pidFilePath, { force: true });
        }
    };

    process.on('SIGINT', stopServer);
    process.on('SIGTERM', stopServer);

    serverProcess.on('error', (error) => {
        cleanupPidFile();
        console.error(describeSpawnError('Starting AdPlay', error));
        process.exit(1);
    });

    serverProcess.on('exit', (code) => {
        cleanupPidFile();
        process.exit(code ?? 0);
    });

    waitForServerReady(`http://127.0.0.1:${port}/api/health`)
        .then(async () => {
            if (!shouldOpenBrowser || openedBrowser) {
                return;
            }

            openedBrowser = true;
            await openBrowser(adminUrl);
        })
        .catch((error) => {
            console.error(error.message);
        });
};

main().catch((error) => {
    console.error('');
    console.error(error.message);
    process.exit(1);
});
