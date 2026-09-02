import net from 'node:net';

const timeoutMs = Number.parseInt(
  process.env.DEPENDENCY_WAIT_TIMEOUT_MS ?? '120000',
  10
);
const retryMs = 1000;

function databaseTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const url = new URL(databaseUrl);
  return {
    name: 'PostgreSQL',
    host: url.hostname,
    port: Number.parseInt(url.port || '5432', 10),
  };
}

function waitForTcp({ name, host, port }) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port });
      let attemptFinished = false;

      socket.setTimeout(3000);
      socket.once('connect', () => {
        if (attemptFinished) return;
        attemptFinished = true;
        socket.destroy();
        console.log(`${name} is reachable at ${host}:${port}`);
        resolve();
      });

      const retry = () => {
        if (attemptFinished) return;
        attemptFinished = true;
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(
            new Error(
              `${name} is not reachable at ${host}:${port} after ${timeoutMs}ms`
            )
          );
          return;
        }
        setTimeout(tryConnect, retryMs);
      };

      socket.once('error', retry);
      socket.once('timeout', retry);
    };

    tryConnect();
  });
}

await Promise.all([
  waitForTcp(databaseTarget()),
  waitForTcp({
    name: 'Redis',
    host: process.env.REDIS_SERVER_HOST ?? 'redis',
    port: Number.parseInt(process.env.REDIS_SERVER_PORT ?? '6379', 10),
  }),
]);
