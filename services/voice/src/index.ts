import express from 'express';
import { createServer } from 'node:http';
import { config } from './config.js';
import { health } from './routes/health.js';
import { attach, PATH } from './voice/channel.js';
import { prewarmJwks } from './auth/cognito.js';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(health);

const server = createServer(app);

// The WebSocket needs the http.Server, not the Express app — an upgrade is a
// protocol handshake, not a request.
attach(server);
prewarmJwks();

server.listen(config.port, () => {
  console.log(`voice service listening on :${config.port}`);
  console.log(`  ${PATH} (${config.sarvam.sttModel} → ${config.bedrock.modelId})`);
});
