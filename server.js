import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
// the handler reads its body limit when imported; adapter-node's 512K default
// is below what an uploaded image may need
process.env.BODY_SIZE_LIMIT ??= '16M';
const { handler } = await import('./build/handler.js');
const target = process.env.HASS_URL;
if (!target) throw new Error('HASS_URL is required');
const port = Number(process.env.PORT || 5050);
const app = express();
app.use(
	createProxyMiddleware({
		pathFilter: ['/local/', '/api/'],
		target,
		changeOrigin: true
	})
);
app.use(handler);
app.listen(port, () => console.log(`Hearth listening on port ${port}`));
