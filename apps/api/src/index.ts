import { buildApp } from './app.js';
import { env } from './config.js';
import { initDb } from './db/index.js';

const app = buildApp();

async function start() {
  try {
    await initDb();
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`API server listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
