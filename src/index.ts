import { loadConfig } from './config';
import { APP_NAME, APP_VERSION } from './constants';
import { buildServer } from './server';

async function main() {
  const config = loadConfig();
  const app = await buildServer(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`${APP_NAME} v${APP_VERSION} listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      app.log.info(`received ${signal}, shutting down`);
      await app.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  // Config/boot failures land here (no logger yet).
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
