# Honeyglass

**Evidence-first, read-only pre-trade safety screen for BEP-20 tokens on BNB Smart Chain.**

Honeyglass is an [A2A](https://a2a-protocol.org/) agent for the Pokter marketplace. Give it a token contract address; it returns a `PASS / CAUTION / FAIL / UNKNOWN` verdict with **per-signal evidence** and **named sources** — designed to be called by another agent as a gate before buying a token.

It is read-only by design. There is no signer, no wallet, no private key, and no code path that moves funds or writes on-chain. It cannot — and does not claim to — guarantee a token is safe.

---

## What it checks

For a token it resolves these signals (each can be `unknown` and is never silently treated as safe):

honeypot / sellability · buy tax · sell tax · ownership renounced · mintable supply · source verified · upgradeable proxy · can-take-back-ownership · hidden owner · self-destruct · transfer pausable · trading cooldown · blacklist capability · holder count · LP locked/burned %.

**Verdict logic (deterministic, thresholds configurable):**

| Verdict | When |
|---|---|
| `FAIL` | confirmed honeypot, un-sellable, self-destruct, hidden owner, or extreme tax (≥ `*_FAIL_PCT`) |
| `CAUTION` | owner privileges (mint/take-back/pause while not renounced), high tax, proxy, cooldown, blacklist, unverified source, weak LP lock, thin holders — or **honeypot status unknown** |
| `PASS` | honeypot status positively known `false` **and** no caution applies |
| `UNKNOWN` | no signals could be resolved at all (e.g. both sources down, or token not indexed) |

`confidence` (0–1) is the fraction of signals that could be resolved.

## Data sources

- **[GoPlus Security](https://gopluslabs.io/) token API** — primary, comprehensive. Free public tier; optional access token for higher limits.
- **[honeypot.is](https://honeypot.is/)** — independent simulation used as a cross-check on the honeypot/sellability verdict.

Both are third parties. Honeyglass merges them (any source reporting a honeypot ⇒ honeypot; GoPlus tax figures preferred to avoid unit mismatch) and records each source's status and fetch time in the response.

---

## Project layout

```
src/
  index.ts        # entrypoint (boot + graceful shutdown)
  server.ts       # Fastify app: routes, rate limit, error handling
  config.ts       # env parsing/validation (zod)
  constants.ts    # names, versions, chain map, burn addresses
  types.ts        # Signals / Finding / ScreenResult
  jsonrpc.ts      # JSON-RPC 2.0 helpers + error codes
  validation.ts   # request param schemas
  rubric.ts       # deterministic verdict engine (pure)
  screen.ts       # orchestrator: fetch → merge → evaluate
  agentCard.ts    # A2A Agent Card
  fixtures.ts     # dry-run synthetic test vectors
  rpc.ts          # JSON-RPC method dispatch
  sources/
    http.ts       # fetch with hard timeout
    goplus.ts     # GoPlus client + normalizer
    honeypot.ts   # honeypot.is client + normalizer
test/             # vitest: rubric, validation, screen, server
```

## Setup

Requires **Node 20+**.

```bash
npm install
cp .env.example .env    # optional — all values have sensible defaults
```

## Run locally

```bash
npm run dev             # hot-reload (tsx), pretty logs
# or
npm run build && npm start
```

Server listens on `http://localhost:8080` by default.

## Test

```bash
npm test                # 36 tests, no network (live calls are mocked)
npm run typecheck
```

---

## API

### `GET /health`
Cheap liveness check (no external calls). Used by Render's health check.
```json
{ "status": "ok", "agent": "Honeyglass", "version": "1.0.0", "uptimeSec": 42 }
```

### `GET /.well-known/agent-card.json`
The A2A Agent Card. Declares the `screen-token` skill, supported chains, dry-run fixtures, the RPC method contract, and the full disclosure list.

### `POST /` — JSON-RPC 2.0

**Method `screen`** (primary) — params:

| field | type | default | notes |
|---|---|---|---|
| `address` | string | — | `0x` + 40 hex chars (required) |
| `chainId` | `56` \| `97` | `56` | 56 = BSC mainnet, 97 = testnet |
| `dryRun` | boolean | `false` | return a synthetic fixture, **no external calls** |

**Method `message/send`** (A2A-compatible) — pass a `DataPart` with the same fields (or a `TextPart` whose text is the address). Returns an A2A `Task` whose artifact carries the `ScreenResult`.

**Error codes:** `-32700` parse · `-32600` invalid request · `-32601` method not found · `-32602` invalid params (with field-level `data`) · `-32603` internal · `-32000` rate limited.

### Sample request
```bash
curl -s -X POST http://localhost:8080/ \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"screen",
       "params":{"address":"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c","chainId":56}}'
```

### Sample response (abridged — a `FAIL` via the dry-run honeypot fixture)
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "schemaVersion": "1.0",
    "agent": "Honeyglass",
    "token": { "address": "0x00000000000000000000000000000000deadbeef", "chainId": 56, "chainName": "BNB Smart Chain" },
    "verdict": "FAIL",
    "confidence": 1,
    "summary": "Do not trade — Confirmed honeypot: token cannot be sold normally.",
    "findings": [
      { "code": "honeypot", "severity": "fail", "message": "Confirmed honeypot: token cannot be sold normally.", "signal": "isHoneypot" },
      { "code": "sell_tax_extreme", "severity": "fail", "message": "Sell tax is extreme (100%).", "signal": "sellTaxPct" }
    ],
    "signals": { "isHoneypot": true, "canSell": false, "sellTaxPct": 100, "sourceVerified": false, "holderCount": 12, "lpLockedPct": 0 },
    "sources": [
      { "name": "GoPlus Security", "status": "skipped", "fetchedAt": null, "detail": "dry-run: synthetic fixture, no external call" },
      { "name": "honeypot.is",     "status": "skipped", "fetchedAt": null, "detail": "dry-run: synthetic fixture, no external call" }
    ],
    "disclosures": [ "…" ],
    "notFinancialAdvice": true,
    "dryRun": true,
    "generatedAt": "2026-10-05T11:08:03.137Z"
  }
}
```

### Dry-run fixtures
`dryRun: true` never touches the network. Documented **synthetic** vectors (not real tokens):

| address | verdict |
|---|---|
| `0x000000000000000000000000000000000000f00d` | `PASS` |
| `0x00000000000000000000000000000000deadbeef` | `FAIL` |
| any other valid address | `CAUTION` |

---

## Configuration

All via environment variables (see [.env.example](.env.example)). Key ones:

| var | default | purpose |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | bind (Render sets `PORT`) |
| `PUBLIC_URL` | — | base URL advertised in the Agent Card |
| `REQUEST_TIMEOUT_MS` | `8000` | hard timeout per upstream call |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | `60` / `1 minute` | per-IP rate limit |
| `GOPLUS_ACCESS_TOKEN` | — | optional, higher GoPlus limits |
| `SELL_TAX_FAIL_PCT` … `MIN_LP_LOCKED_PCT` | balanced | verdict thresholds |

## Security posture

- **Read-only.** No signer, wallet, key handling, or on-chain write exists anywhere in the code.
- **No secrets in code.** Only optional API tokens, via env. `.env.example` holds placeholders only.
- **Hard timeouts** on every upstream call; **per-IP rate limiting**; **structured logging** (pino) with the `authorization` header redacted.
- **Deterministic errors** (fixed JSON-RPC code table) and a pure, testable verdict engine.
- **Honest unknowns** — a signal that can't be fetched is `unknown`, never a silent pass; unknown honeypot status can't yield `PASS`.

---

## Deploy to Render (public HTTPS)

1. Push this repo to GitHub.
2. **Render → New + → Blueprint**, select the repo. It reads [render.yaml](render.yaml):
   - build `npm install && npm run build`, start `npm start`, health check `/health`.
3. After the first deploy, copy the service URL (e.g. `https://honeyglass.onrender.com`) and set the `PUBLIC_URL` env var to it, then redeploy so the Agent Card advertises the right URL.
4. Verify:
   ```bash
   curl https://YOUR-APP.onrender.com/health
   curl https://YOUR-APP.onrender.com/.well-known/agent-card.json
   ```

(Equivalently without the blueprint: a Node Web Service, build `npm install && npm run build`, start `npm start`, health check path `/health`, `NODE_ENV=production`.)

---

## Verification checklist — before ERC-8004 registration in Pokter

Run against your **public HTTPS** URL. All must pass:

- [ ] `GET /health` returns `200` and `{"status":"ok"}`.
- [ ] `GET /.well-known/agent-card.json` returns `200`, is valid JSON, and its `url` field is your **public HTTPS** URL (not `localhost`).
- [ ] The card lists the `screen-token` skill and both supported chains (56, 97).
- [ ] **Dry-run PASS:** `screen` with `{"address":"0x000000000000000000000000000000000000f00d","dryRun":true}` ⇒ `verdict: "PASS"`, no network dependency.
- [ ] **Dry-run FAIL:** `{"address":"0x00000000000000000000000000000000deadbeef","dryRun":true}` ⇒ `verdict: "FAIL"`.
- [ ] **Live PASS:** `screen` with WBNB `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` (chain 56) ⇒ `verdict: "PASS"`, both sources `ok`.
- [ ] **Live FAIL/CAUTION:** screen a token you know is malicious ⇒ `FAIL` or `CAUTION` with populated `findings`.
- [ ] **A2A path:** `message/send` with a `DataPart` returns a `task` whose artifact carries the result.
- [ ] **Bad input is deterministic:** `{"address":"0xbad"}` ⇒ error `-32602` with field-level `data`.
- [ ] **Unknown method:** ⇒ error `-32601`.
- [ ] Every live response includes `sources[]` with fetch timestamps and the `disclosures[]` block.
- [ ] TLS valid; response time acceptable under your timeout (`REQUEST_TIMEOUT_MS`).

Once all are green, register the agent in Pokter and point ERC-8004 registration at `https://YOUR-APP.onrender.com/.well-known/agent-card.json`.

---

## Disclosures

Honeyglass is an automated, read-only risk screen on BNB Smart Chain (mainnet 56, testnet 97) for BEP-20 tokens, using third-party sources (GoPlus, honeypot.is) that it does not control. Results reflect source data at fetch time; contracts can change afterward. **This is not financial advice and not a guarantee of safety.** A `PASS` means no blocking signals were found in the available checks — nothing more. Testnet coverage is frequently unavailable, so testnet results are often `UNKNOWN`.
