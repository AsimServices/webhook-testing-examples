import {createServer} from 'node:http';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function signature(body, secret) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}
export function verify(body, header, secret) {
  if (typeof header !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const expected = Buffer.from(signature(body, secret).slice(7), 'hex');
  return timingSafeEqual(expected, Buffer.from(header.slice(7), 'hex'));
}
export function createWebhookServer(secret) {
  if (!secret || secret.startsWith('REPLACE_')) throw new Error('Set WEBHOOK_SECRET.');
  const seen = new Set();
  return createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== '/webhook') return reply(404, {error: 'use POST /webhook'});
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
      return reply(415, {error: 'use application/json'});
    }
    const chunks = [];
    let length = 0;
    try {
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 65536) return reply(413, {error: 'body exceeds 64 KiB'});
        chunks.push(chunk);
      }
    } catch { return reply(400, {error: 'incomplete body'}); }
    const raw = Buffer.concat(chunks);
    if (!verify(raw, req.headers['x-hub-signature-256'], secret)) return reply(401, {error: 'invalid signature'});
    let event;
    try { event = JSON.parse(raw.toString('utf8')); }
    catch { return reply(400, {error: 'invalid JSON'}); }
    if (!event || typeof event.id !== 'string' || event.id.length < 1 || event.id.length > 128
        || typeof event.type !== 'string' || !event.type) return reply(422, {error: 'id and type are required strings'});
    if (seen.has(event.id)) return reply(200, {accepted: true, duplicate: true});
    // Demo only: no side effect is performed. Persist idempotency atomically in production.
    if (seen.size >= 1000) return reply(503, {error: 'demo capacity reached; restart the receiver'});
    seen.add(event.id);
    return reply(202, {accepted: true, duplicate: false});
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    createWebhookServer(process.env.WEBHOOK_SECRET).listen(8788, '127.0.0.1',
      () => console.log('Webhook lab: http://127.0.0.1:8788/webhook'));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
