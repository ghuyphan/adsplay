import fs from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createApp } from './app';
import { getConfig } from './config';
import { logError, logInfo } from './logger';
import { getSystemStatus } from './services/system.service';

const config = getConfig();
const app = createApp();
const server = config.httpsEnabled
    ? createHttpsServer(
          {
              cert: fs.readFileSync(config.httpsCertFile!, 'utf8'),
              key: fs.readFileSync(config.httpsKeyFile!, 'utf8'),
          },
          app,
      )
    : createHttpServer(app);
const protocol = config.httpsEnabled ? 'https' : 'http';

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
    logInfo('server.started', { port: config.port, protocol });

    const status = getSystemStatus();
    for (const address of status.localIps) {
        logInfo('server.available', { url: `${protocol}://${address}:${config.port}` });
    }
});
