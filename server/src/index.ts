import { loadConfig, loadDotEnv } from './config.js';
import { buildApp } from './app.js';
import { startRetentionJob } from './modules/retention/job.js';

loadDotEnv();
const config = loadConfig();

const app = await buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  const stopRetention = startRetentionJob(app);
  app.log.info(`Painel e API em http://${config.host}:${config.port}`);
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'encerrando');
    stopRetention();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
