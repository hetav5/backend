# Daybreak CRM — AI-Native Mini CRM (Backend)

An **AI-native Mini CRM** for a D2C coffee brand. A marketer states a goal in plain
language ("win back customers who haven't ordered in 60 days") and an **AI agent**
proposes the audience, drafts the copy, recommends a channel, and — only on
**explicit human approval** — launches the campaign and reports back. Delivery is
modeled by a **separate stubbed channel service** that calls back asynchronously
with the full communication lifecycle.

> Product bet: a *true AI agent that executes the campaign end to end* — not a
> dashboards-everywhere CRM. The agent loop is the product; analytics support it.

This repo is the **backend** (two services). The frontend (Next.js chat UI) lives
in a separate repo and talks to the API/SSE contract below.

---

## Architecture

```
 Next.js frontend ──REST + SSE──►  CRM API (NestJS)  ──BullMQ "send"──►  Channel Service (NestJS)
                                       │  ▲                                    │  (stubbed provider)
                                       │  └──── "receipt" queue ◄──HMAC webhook─┘   simulates lifecycle,
                                       ▼                                            emits delivered/opened/
                                  Postgres + Redis                                  read/clicked/failed/converted
```

Three processes, two Nest apps in one monorepo:

| App | Responsibility |
|-----|----------------|
| `apps/crm` | API, the Gemini agent (SSE), segments, campaigns, the send queue, the receipt webhook + worker, analytics |
| `apps/channel` | Stubbed messaging provider: `POST /dispatch`, then async HMAC-signed callbacks into the CRM |
| `libs/shared` | Shared types, HMAC util, and the communication **state-machine** ranking |

**Stack:** NestJS 11 · Prisma 6 + Postgres · BullMQ + Redis · Google Gemini
(`@google/genai`, `gemini-2.5-flash`) behind a swappable `LlmService`.

---

## The AI agent (`apps/crm/src/agent`)

A **manual function-call loop** over Gemini (we drive the cycle so we can gate the
one destructive action). Tools:

- `preview_audience(ruleTree)` — compiles a rule tree to SQL and returns a real
  count + sample (read-only; the agent calls it freely to ground its numbers).
- `draft_message`, `recommend_channel` — structured cards for the UI.
- `create_campaign` — persists a **DRAFT** (never sends).
- `launch_campaign` — **gated**: returns `{ requiresApproval: true, ... }`; it
  cannot send. Only `POST /campaigns/:id/launch` (a human clicking *Approve & Send*)
  actually dispatches.
- `get_campaign_analytics` — funnel + attributed orders.

Tokens and tool results stream to the browser over SSE.

---

## The send / receipt loop (system-design centerpiece)

**Launch** → in one transaction, materialize the audience, create `QUEUED`
communications, flip the campaign to `SENDING`, and enqueue one BullMQ `send` job
per recipient (bounded concurrency, exponential backoff, 4 attempts; terminal
failure → `FAILED`).

**Channel service** acks `POST /dispatch` with `202`, then asynchronously simulates
a realistic per-channel lifecycle with drop-off, a configurable failure rate, and
**deliberate duplicate + out-of-order deliveries**. Each event is POSTed to the CRM
`/receipts` endpoint with an **HMAC-SHA256 signature** over the raw body.

**Receipt ingestion** verifies the HMAC, enqueues to a `receipt` queue, and returns
`200` fast (thin, backpressure-safe). The worker applies events:
- **Idempotent** — `CommunicationEvent.eventId` is unique; duplicates are no-ops
  (also deduped at the queue via `jobId = eventId`).
- **Order-safe** — a monotonic state rank (`QUEUED<SENT<DELIVERED<OPENED<READ<CLICKED`,
  `FAILED` terminal) means a late `delivered` can't downgrade an already-`read` comm.
  `Communication.status` is a **projection**; the event log is the source of truth.
- **Attribution** — a `converted` event creates the resulting order + an
  `OrderAttribution` linking revenue back to the communication.

Verified locally: launching to 746 lapsed customers produced a clean funnel
(sent 692 / delivered 662 / opened 408 / read 336 / clicked 150 / failed 54;
692+54 = 746) with 20 attributed orders.

### Tradeoffs (consciously made)

- **BullMQ + Redis** for real retries/backoff/concurrency and an honest scale story.
  At higher volume: partition the `send` queue per channel, add a dead-letter queue,
  and put the channel service behind its own queue.
- **Idempotency + state-rank over strict ordering** — real webhooks arrive out of
  order and duplicated; we embrace that rather than assume an ordered stream.
- **Not built (by design):** real provider integrations, multi-tenant auth, A/B
  testing, deals/pipeline. The brief is a marketing/engagement tool, not a sales CRM.

---

## Running locally

Prereqs: Node 20+, Docker.

```bash
cp .env.example .env          # then set GEMINI_API_KEY (free key from aistudio.google.com)
npm install
docker compose up -d          # Postgres + Redis
npx prisma migrate dev        # create schema
npm run prisma:seed           # ~2,000 customers, ~9k orders across RFM cohorts

# two terminals:
npm run start:crm:dev         # CRM API on :3001
npm run start:channel:dev     # Channel service on :3002
```

Smoke test (no LLM needed):

```bash
# preview an audience
curl -s -X POST localhost:3001/segments/preview -H 'content-type: application/json' \
  -d '{"definition":{"all":[{"field":"lastOrderDaysAgo","op":">","value":60}]}}'

# drive the full loop with the helper, then watch analytics
npx ts-node scripts/mkcampaign.ts            # prints a campaign id
curl -s -X POST localhost:3001/campaigns/<id>/launch
curl -s localhost:3001/campaigns/<id>/analytics
```

Talk to the agent:

```bash
curl -N -X POST localhost:3001/agent/stream -H 'content-type: application/json' \
  -d '{"message":"Win back coffee buyers who have not ordered in 60 days."}'
```

Tests: `npm test` (state machine + segment compiler).

---

## API & SSE contract

| Method | Path | Notes |
|--------|------|-------|
| POST | `/agent/stream` | SSE: `token`, `tool_result`, `message_done`, `error` |
| GET | `/agent/conversations/:id` | transcript reload |
| POST | `/segments/preview` | `{ definition: RuleTree }` → `{ count, sample }` |
| GET | `/campaigns` · `/campaigns/:id` | list / detail |
| POST | `/campaigns/:id/launch` | **the only commit path** → `SENDING` |
| GET | `/campaigns/:id/analytics` | `{ funnel, attributedOrders, attributedRevenue }` |
| GET | `/customers` · `/customers/:id` | cursor-paginated browser |
| POST | `/receipts` | internal HMAC-signed channel callback |

See `FRONTEND_PLAN.md` for the full payload shapes.
