# Webhook testing examples

A local webhook lab for understanding signatures, payload validation, and duplicate
deliveries. Includes a receiver, a sender, a synthetic event, and failure tests.
Requires Node.js 22+; no packages or service accounts are needed.

## Run a signed delivery

```sh
git clone https://github.com/AsimServices/webhook-testing-examples.git
cd webhook-testing-examples
```

Copy `.env.example` to `.env`, replace the placeholder with a local test secret,
and run these commands in two terminals in the repository:

```sh
# Terminal 1
node --env-file=.env src/server.js
# Terminal 2
node --env-file=.env examples/send.js
node --env-file=.env examples/send.js
```

The first delivery returns 202 with `duplicate: false`. The second returns 200 with
`duplicate: true`. Edit `examples/event.json` to give the next event a different ID.
Run `npm test` for tampering, malformed JSON, oversized payloads, and replay cases.

## How verification works

1. Read the raw body, enforcing a 64 KiB limit.
2. Compute HMAC-SHA256 with the shared secret and those exact bytes.
3. Validate the signature shape, then compare equal-length buffers with
   `timingSafeEqual`.
4. Parse JSON only after verification; require an event ID and type.
5. Recognize IDs already accepted by this receiver.

This lab uses the `X-Hub-Signature-256: sha256=...` convention described in
[GitHub's webhook documentation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).
Its event schema and deduplication ID are specific to this lab: a real GitHub
integration would use the delivery metadata and event schema from GitHub.
Stripe, Slack, and other providers can sign different inputs and include timestamps.
Follow each provider's specification; do not assume this verifier fits every service.

## Diagnose a failed delivery

| Status | Meaning in this lab | Next check |
| --- | --- | --- |
| 401 | Signature mismatch | Same secret? Exact raw bytes? |
| 400 | Signed body is not valid JSON | Quotes, commas, and encoding |
| 413 | Body exceeds 64 KiB | Payload size |
| 415 | Wrong Content-Type | Send application/json |
| 422 | Required event fields missing | String id and type |
| 503 | In-memory demo reached 1,000 IDs | Restart the lab |

The demo performs no business action. IDs exist only in memory and disappear on
restart. Production processing needs durable, atomic deduplication, durable queues,
appropriate replay controls, request limits, and a retry strategy. Bindings here are
loopback-only; do not expose this learning server as a production webhook endpoint.

## Test an automation webhook interactively

Try these requests interactively using [PlaygroundAPI.com](https://playgroundapi.com/playground).
For a Make, n8n, or Zapier test workflow you control, copy the synthetic JSON event,
choose POST, set `Content-Type: application/json`, and use that workflow's test URL.
Activate its test listener first and inspect both the HTTP response and workflow
execution. Sending a webhook can trigger real downstream actions; use a test workflow.

The local sender signs its exact file bytes. Editing that body requires a new
signature. The hosted Playground proxy cannot reach this loopback receiver; use
the local sender for this lab. Playground requests pass through its server.

## Related resources

- [Make webhook guide](https://playgroundapi.com/blog/test-makecom-webhook-before-going-live)
- [Make's official webhook documentation](https://help.make.com/webhooks)
- [General HTTP examples](https://github.com/AsimServices/playgroundapi-examples)

Tests use synthetic events on loopback and make no third-party calls. MIT licensed.
