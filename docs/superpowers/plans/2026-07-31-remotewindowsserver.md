# remoteWindowsServer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a role-configured Pi extension that adds speech prompt rules and sends complete final remote answers over authenticated Tailscale HTTP to the local Mac, where they enter the existing `pi-speech` queue and play locally.

**Architecture:** `remoteWindowsServer` is a sibling global extension of `pi-speech`. In `remote` mode it adds the existing language instruction at `before_agent_start`, extracts only the final assistant answer at `agent_settled`, prepares the same speech chunks, and sends them sequentially. In `local` mode it binds an HTTP server to `100.80.187.52:8765`, validates the Tailscale source and HMAC-SHA256 signature, then calls `pi-speech`'s existing `enqueueSpeech()` once with the complete message's ordered chunk array. Explicit configuration selects the role; no IP-based role inference is used.

**Tech Stack:** TypeScript extension loaded by Pi/jiti, Node.js ESM modules, `node:http`, `node:crypto`, `node:fs/promises`, existing `pi-speech` modules, Node test runner.

## Global Constraints

- The two roles are selected explicitly through `~/.pi/agent/remoteWindowsServer.json`.
- Remote target is `http://100.80.187.52:8765`; local listener binds to `100.80.187.52:8765`.
- Local mode accepts only source address `100.87.111.111` after IPv4-mapped address normalization.
- Every non-health request uses HMAC-SHA256 over a canonical request string and the shared secret.
- Only `agent_settled` final assistant answers are transmitted; no streaming, tool output, thinking, aborted, or child JSON sessions.
- The local side delegates FIFO, deduplication, worker locking, and audio playback to `pi-speech`'s `enqueueSpeech()`.
- Remote transmission failure must not turn a successful Pi assistant response into an agent error.
- No remote audio/TTS backend is introduced.
- Secrets are never printed in status messages or errors.
- Every task ends with its focused test command and a commit.

---

## File Map

- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/index.ts`: Pi lifecycle hooks, `/remote` command, role dispatch.
- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/config.mjs`: config path, defaults, validation, atomic persistence.
- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/protocol.mjs`: payload schema, canonical signing, HMAC verification, source-address normalization.
- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/client.mjs`: sequential POST client, timeout, bounded retries, acknowledgements.
- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/server.mjs`: local HTTP server and request lifecycle.
- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/paths.mjs`: configurable paths and sibling `pi-speech` integration paths.
- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/README.md`: install/configuration/runbook for Mac and Windows/SSH PC.
- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/package.json`: private ESM package and test command.
- Create `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/test/*.test.mjs`: unit and integration tests.
- Modify `/Users/tdetaillez/.pi/agent/extensions/pi-speech/lib/pi-adapter.mjs`: expose shared final-answer and language-instruction behavior without changing existing semantics if needed.
- Modify `/Users/tdetaillez/.pi/agent/extensions/pi-speech/lib/text.mjs`: use the same exported `prepareSpeech()` contract from the bridge if extraction is required.
- Modify `/Users/tdetaillez/.pi/agent/extensions/pi-speech/test/*.test.mjs`: regression tests for any shared-module extraction.

---

### Task 1: Extract and lock down shared speech behavior

**Files:**
- Modify: `/Users/tdetaillez/.pi/agent/extensions/pi-speech/lib/pi-adapter.mjs`
- Modify: `/Users/tdetaillez/.pi/agent/extensions/pi-speech/lib/text.mjs`
- Test: `/Users/tdetaillez/.pi/agent/extensions/pi-speech/test/pi-adapter.test.mjs`
- Test: `/Users/tdetaillez/.pi/agent/extensions/pi-speech/test/text.test.mjs`

**Interfaces:**
- Produces `findFinalAssistantEntry(branch)`, `assistantText(entry)`, `languageInstruction(voice)`, and `prepareSpeech(text, maxLength)` as stable ESM imports for `remoteWindowsServer`.
- Preserves the current `pi-speech` behavior, including skipping aborted/error answers, stripping unsuitable Markdown, and honoring `german`/`glados`.

- [ ] **Step 1: Add regression tests** for German and GLaDOS prompt text, final-entry extraction, code-only filtering, Markdown cleanup, and chunk ordering.
- [ ] **Step 2: Run the focused tests** with `cd /Users/tdetaillez/.pi/agent/extensions/pi-speech && npm test -- --test-name-pattern='adapter|text'`; expected: existing tests pass before refactor.
- [ ] **Step 3: Make the smallest shared-module/export change** so the bridge can import the functions without copying prompt rules.
- [ ] **Step 4: Run the focused tests again**; expected: PASS with unchanged speech output.
- [ ] **Step 5: Commit** with `git -C /Users/tdetaillez/.pi/agent/extensions/pi-speech add lib test && git -C /Users/tdetaillez/.pi/agent/extensions/pi-speech commit -m "refactor: expose shared speech preparation"`.

### Task 2: Implement bridge configuration and paths

**Files:**
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/config.mjs`
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/paths.mjs`
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/test/config.test.mjs`
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/package.json`

**Interfaces:**
- `createPaths(options)` returns `configFile`, `runtimeDir`, `lastErrorFile`, and `piSpeechExtensionDir`.
- `readConfig(paths)`, `writeConfig(paths, config)`, and `validateConfig(value)` handle `{version: 1, role, localUrl, listenHost, listenPort, allowedRemoteIp, voice, sharedSecret, enabled}`.
- Defaults use the requested addresses and port while requiring an explicitly supplied non-empty secret before network operation.

- [ ] **Step 1: Create the sibling extension directory and initialize its standalone Git repository** with `mkdir -p /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/{lib,test}` and `git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer init`.
- [ ] **Step 2: Write failing tests** for valid remote/local configs, rejected missing role/secret, rejected invalid IP/port/voice, default paths, restrictive config-file mode, and atomic writes.
- [ ] **Step 3: Run `node --test test/config.test.mjs`** from the new extension directory; expected: FAIL because modules do not exist.
- [ ] **Step 4: Implement config validation and atomic persistence** using `PI_CODING_AGENT_DIR`, `PI_REMOTE_WINDOWS_SERVER_*` environment overrides for tests, and `0600` file permissions.
- [ ] **Step 5: Run the focused test**; expected: PASS.
- [ ] **Step 6: Commit** with `git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer add package.json lib test/config.test.mjs && git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer commit -m "feat: add remote bridge configuration"`.

### Task 3: Implement the authenticated protocol

**Files:**
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/protocol.mjs`
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/test/protocol.test.mjs`

**Interfaces:**
- `createSpeechPayload({sessionId, messageEntryId, voice, chunks})` returns protocol version 1 payload.
- `canonicalRequest({method, path, timestamp, body})` returns the exact signing string `${method}\n${path}\n${timestamp}\n${body}`.
- `signRequest({secret, method, path, timestamp, body})` returns lowercase hex HMAC-SHA256.
- `verifyRequest({secret, headers, method, path, body, now})` rejects malformed/missing signatures and timestamps outside a five-minute window.
- `normalizeRemoteAddress(address)` handles `::ffff:100.87.111.111` and plain IPv4.
- `validateSpeechPayload(payload)` enforces strings, voice in `german|glados`, a non-empty `chunks` array, and a 1200-character limit per chunk.

- [ ] **Step 1: Write failing tests** for deterministic signatures, tampering, stale timestamps, malformed headers, IPv4-mapped addresses, chunk-array limits, and valid payloads.
- [ ] **Step 2: Run `node --test test/protocol.test.mjs`**; expected: FAIL.
- [ ] **Step 3: Implement HMAC-SHA256, constant-time comparison, timestamp checks, address normalization, and payload validation using only Node built-ins.
- [ ] **Step 4: Run the focused test**; expected: PASS.
- [ ] **Step 5: Commit** with `git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer add lib/protocol.mjs test/protocol.test.mjs && git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer commit -m "feat: secure speech bridge protocol"`.

### Task 4: Implement the remote HTTP client

**Files:**
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/client.mjs`
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/test/client.test.mjs`

**Interfaces:**
- `sendSpeechChunks(config, {sessionId, messageEntryId, voice, chunks}, options)` sends one request containing the ordered `chunks` array and resolves after acknowledgement.
- The request includes `X-Remote-Speech-Timestamp`, `X-Remote-Speech-Signature`, JSON content type, and a bounded body size.
- `options.fetch` or an injected request function is used by tests; production uses Node `fetch` with an `AbortSignal.timeout()` equivalent.
- Retries are limited to three attempts for network errors and 5xx responses; 4xx responses fail immediately.

- [ ] **Step 1: Write failing tests** using a fake HTTP handler for one complete ordered chunk array, signature verification, acknowledgement handling, retry, timeout, and immediate 4xx failure.
- [ ] **Step 2: Run `node --test test/client.test.mjs`**; expected: FAIL.
- [ ] **Step 3: Implement one signed request per complete answer**; preserve chunk order inside the JSON array and never split the message across queue operations.
- [ ] **Step 4: Run the focused test**; expected: PASS.
- [ ] **Step 5: Commit** with `git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer add lib/client.mjs test/client.test.mjs && git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer commit -m "feat: send speech chunks to local bridge"`.

### Task 5: Implement the local HTTP receiver

**Files:**
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/lib/server.mjs`
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/test/server.test.mjs`

**Interfaces:**
- `createSpeechServer({config, paths, enqueue, onError})` returns `{server, start(), close()}`.
- `POST /speech` authenticates source and HMAC, validates payload, deduplicates by `(sessionId,messageEntryId)`, and calls `enqueue(paths, {sessionId, messageEntryId, voice, chunks})` once.
- Duplicate complete answers return `{ok:true, duplicate:true}` without a second enqueue.
- `GET /health` returns `{ok:true, role:"local"}` without authentication.
- Unknown routes return 404; invalid JSON/payload returns 400; unauthorized source/signature returns 403/401; server errors return 500 without stack traces.

- [ ] **Step 1: Write failing tests** with an ephemeral localhost port for health, valid signed multi-chunk speech, wrong source, wrong signature, malformed body, duplicate complete answer, queue-disabled result, and shutdown.
- [ ] **Step 2: Run `node --test test/server.test.mjs`**; expected: FAIL.
- [ ] **Step 3: Implement bounded JSON body reading, source allowlist, protocol verification, and direct delegation of the complete chunk array to `enqueueSpeech()`. Let `pi-speech` persist message-level dedupe markers so restart behavior remains consistent.
- [ ] **Step 4: Run the focused test**; expected: PASS.
- [ ] **Step 5: Commit** with `git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer add lib/server.mjs test/server.test.mjs && git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer commit -m "feat: receive authenticated speech chunks"`.

### Task 6: Implement the Pi extension lifecycle and commands

**Files:**
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/index.ts`
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/test/index.test.mjs`

**Interfaces:**
- Registers `/remote` with `status`, `on`, and `off` completions.
- Remote `before_agent_start` returns the original system prompt plus `languageInstruction(config.voice)`; local mode returns nothing.
- Remote `agent_settled` uses `isSpeechEligibleContext`, `findFinalAssistantEntry`, `assistantText`, and `prepareSpeech`, then calls `sendSpeechChunks` once for the complete answer.
- Local `session_start` starts the HTTP receiver; local `session_shutdown` closes it. Remote mode never starts a listener.
- Status reports role, endpoint, enabled state, last success/error, and reachability without exposing the secret.

- [ ] **Step 1: Write failing extension tests** with a fake Pi API and fake client/server dependencies for role gating, prompt injection, final-answer-only behavior, child JSON exclusion, command state changes, startup/shutdown, and non-fatal delivery errors.
- [ ] **Step 2: Run `node --test test/index.test.mjs`**; expected: FAIL.
- [ ] **Step 3: Implement lifecycle handlers and command UI**. Use a module-level run state only for the current turn and clear it after `agent_settled`.
- [ ] **Step 4: Run the focused test**; expected: PASS.
- [ ] **Step 5: Commit** with `git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer add index.ts test/index.test.mjs && git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer commit -m "feat: add role-aware Pi remote speech extension"`.

### Task 7: Add installation documentation and run the full test suites

**Files:**
- Create: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/README.md`
- Modify: `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/package.json`
- Test: all files under `/Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/test/` and `/Users/tdetaillez/.pi/agent/extensions/pi-speech/test/`

**Interfaces:**
- README documents installation on both hosts, explicit role configs, generating a random shared secret, Windows firewall binding to Tailscale, `/reload`, `/remote status`, and a health check.
- The package test command runs `node --test test/*.test.mjs`.

- [ ] **Step 1: Write the README** with copy-pasteable config examples using `100.80.187.52`, `100.87.111.111`, and port `8765`; state that the remote host must have the shared speech modules available beside the bridge.
- [ ] **Step 2: Run the bridge suite** with `cd /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer && npm test`; expected: PASS.
- [ ] **Step 3: Run the existing speech suite** with `cd /Users/tdetaillez/.pi/agent/extensions/pi-speech && npm test`; expected: PASS.
- [ ] **Step 4: Run a no-audio smoke check** with `pi --no-extensions -e /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer/index.ts --no-session -p "/remote status"` using a temporary config directory; expected: a role/status response and no spawned TTS process.
- [ ] **Step 5: Commit** with `git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer add README.md package.json && git -C /Users/tdetaillez/.pi/agent/extensions/remoteWindowsServer commit -m "docs: document remote speech bridge setup"`.

### Task 8: Perform the deliberate Tailscale integration check

**Files:**
- No source changes unless a verified defect is found.
- Test: live local/remote Pi process pair.

- [ ] **Step 1: Configure the local Mac** with the generated secret, local role, listener address, and `allowedRemoteIp: "100.87.111.111"`.
- [ ] **Step 2: Configure the remote PC** with the identical secret, remote role, `localUrl: "http://100.80.187.52:8765"`, and the intended voice.
- [ ] **Step 3: Verify connectivity** from the remote PC with `GET /health` over Tailscale; expected: `{ "ok": true, "role": "local" }`.
- [ ] **Step 4: Run one real remote Pi answer**; expected: one local queue entry per final answer, ordered local playback, no remote TTS process.
- [ ] **Step 5: Verify negative cases** by using a wrong secret and wrong source; expected: rejection without audio.
- [ ] **Step 6: Record the result** in the bridge README's troubleshooting section and commit only if documentation changed.

## Self-Review Checklist

- Spec coverage: roles/configuration (Tasks 2 and 6), complete-answer flow and prompt rules (Tasks 1 and 6), HTTP endpoints/security (Tasks 3–5), queue integration (Task 5), commands/status (Task 6), errors (Tasks 4–6), tests (all tasks), installation and integration (Tasks 7–8).
- Placeholder scan: no `TODO`, `TBD`, or unspecified “appropriate handling” steps appear in the plan.
- Type/interface consistency: `sendSpeechChunks`, `createSpeechServer`, protocol helpers, and lifecycle dependencies are named consistently across tasks.
- Scope: the plan keeps audio local and excludes session synchronization and remote TTS as specified.
