import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createWebhookServer, signature, verify} from '../src/server.js';

test('signatures depend on the exact bytes and reject malformed input', () => {
  const body = Buffer.from('{"id":"one"}');
  const signed = signature(body, 'test-secret');
  assert.equal(verify(body, signed, 'test-secret'), true);
  assert.equal(verify(Buffer.from('{ "id":"one"}'), signed, 'test-secret'), false);
  for (const bad of [undefined, '', 'sha256=abc', 'sha256=' + 'z'.repeat(64)]) {
    assert.equal(verify(body, bad, 'test-secret'), false);
  }
});
test('receiver validates before accepting and handles replayed event IDs', async t => {
  const secret = 'local-test-secret';
  const server = createWebhookServer(secret).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const send = (body, sig = signature(body, secret), contentType = 'application/json') => fetch(url, {
    method: 'POST', body, headers: {'Content-Type': contentType, 'X-Hub-Signature-256': sig},
  });
  const body = '{"id":"evt-1","type":"order.created"}';
  assert.equal((await send(body, 'sha256=bad')).status, 401);
  assert.equal((await send('{')).status, 400);
  assert.equal((await send('{}')).status, 422);
  assert.equal((await send('null')).status, 422);
  assert.equal((await send(body, signature(body, secret), 'text/plain')).status, 415);
  assert.equal((await send('a'.repeat(65537))).status, 413);
  const first = await send(body);
  assert.equal(first.status, 202);
  assert.equal((await first.json()).duplicate, false);
  const second = await send(body);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).duplicate, true);
});
