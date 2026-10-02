import {readFile} from 'node:fs/promises';
import {signature} from '../src/server.js';
const secret = process.env.WEBHOOK_SECRET;
if (!secret || secret.startsWith('REPLACE_')) {
  console.error('Set WEBHOOK_SECRET to the same value used by the receiver.');
  process.exitCode = 1;
} else {
  try {
    const body = await readFile(new URL('./event.json', import.meta.url));
    const response = await fetch('http://127.0.0.1:8788/webhook', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), body,
      headers: {'Content-Type': 'application/json', 'X-Hub-Signature-256': signature(body, secret)},
    });
    console.log(response.status, await response.json());
    if (!response.ok) process.exitCode = 1;
  } catch { console.error('Could not send the local event. Start the receiver first.'); process.exitCode = 1; }
}
