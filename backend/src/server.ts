import { createServer } from 'node:http';
import { createApp } from './app';
import { getConfig } from './config';
import { logError, logInfo } from './logger';
import { getSystemStatus } from './services/system.service';

const config = getConfig();
const app = createApp();
const server = createServer(app);

server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
        logError('server.start_failed', {
            reason: 'port_in_use',
            message: `Port ${config.port} is already in use. Stop the other server or set PORT to a different value.`,
            port: config.port,
        });
        process.exit(1);
        return;
    }

    logError('server.start_failed', {
        code: error.code ?? 'unknown',
        message: error.message,
    });
    process.exit(1);
});

server.listen(config.port, '0.0.0.0', () => {
    logInfo('server.started', { port: config.port });

    const status = getSystemStatus();
    for (const address of status.localIps) {
        logInfo('server.available', { url: `http://${address}:${config.port}` });
    }
});
