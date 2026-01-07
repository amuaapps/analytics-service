# Analytics Microservice Contract & Storage Specification (v1.0.0)

**Document version:** v1.0.0  
**Status:** Active  
**Scope:** Defines the API ingest contract, operational storage model, and query/output contract for the Analytics Microservice.  
**Compatibility:** Non-breaking changes may add optional fields. Breaking changes require a major version bump.

---

## 0. Goals & Non-Goals

### Goals
- Provide a **single analytics ingestion API** that any frontend (or backend) can call.
- Store analytics events in a **best-practice, cloud-native, serverless** way.
- Expose analytics events through a **stable read API** so other services can query them.
- Maintain **loose coupling**: consumers interact via API contracts, not databases.
- Support **multi-cloud** deployment: AWS and Azure.

### Non-Goals (v1)
- Advanced aggregations/BI (funnels, cohorts, rollups).  
- Cross-service joins or analytics DB access from other services.  
- PII collection. If you need it, treat as a separate, explicitly designed system.

---

## 1. Ingestion API Contract

### 1.1 Endpoint
- **Method:** `POST`
- **Path:** `/api/v1/events`
- **Purpose:** Accept a batch of analytics events and enqueue for processing.

### 1.2 Authentication
- **Required header:** `X-Analytics-Write-Key`
- The key must match one of the configured write keys for the environment.
- If missing/invalid → respond **401** (do not partially ingest).

### 1.3 CORS
- The service must support CORS for browser-based clients.
- Allowed origins must be configurable per environment.

### 1.4 Request envelope
The request body is a JSON object with the following fields:

| Field | Type | Required | Constraints / Notes |
|---|---|---:|---|
| `schemaVersion` | string | ✅ | Must be `"1.0.0"` |
| `sentAt` | string (ISO 8601) | ❌ | When the client sent the batch |
| `events` | array | ✅ | 1–50 events per request |

**Batch validation rule (v1):** If any event is invalid, the service must reject the entire batch with **400**.

### 1.5 Event types
Each `events[]` entry is exactly one of:

- **track** (custom event)
- **page** (page/screen view)
- **identify** (user trait update)

### 1.6 Event object (common fields)
All event types share these fields:

| Field | Type | Required | Constraints / Notes |
|---|---|---:|---|
| `schemaVersion` | string | ✅ | Must be `"1.0.0"` |
| `eventId` | string | ✅ | Client-generated unique id (UUID recommended) |
| `type` | string | ✅ | `track` \| `page` \| `identify` |
| `occurredAt` | string (ISO 8601 UTC) | ✅ | Time the event happened on the client |
| `source` | object | ✅ | See **1.7** |
| `actor` | object | ✅ | See **1.8** |
| `context` | object | ❌ | See **1.9** |
| `consent` | object | ❌ | See **1.10** |
| `properties` | object | ❌ | Allowed only for `track` and `page` |
| `traits` | object | ❌ | Required only for `identify` |

### 1.7 `source` object
| Field | Type | Required | Constraints / Notes |
|---|---|---:|---|
| `appId` | string | ✅ | Stable identifier for emitting app (e.g., `web-storefront`) |
| `platform` | string | ✅ | `web` \| `ios` \| `android` \| `server` |
| `env` | string | ✅ | `dev` \| `staging` \| `prod` |
| `appVersion` | string | ❌ | Optional app build/release identifier |

### 1.8 `actor` object
At least one of `userId` or `anonymousId` **must** be present.

| Field | Type | Required | Constraints / Notes |
|---|---|---:|---|
| `userId` | string | ❌ | Authenticated user identifier |
| `anonymousId` | string | ❌ | Stable per-device/session identifier (unauth traffic) |
| `sessionId` | string | ❌ | Client session identifier |

### 1.9 `context` object (optional)
Used for lightweight runtime context. Do not dump large browser/device objects.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `locale` | string | ❌ | e.g. `en-US` |
| `timezone` | string | ❌ | e.g. `Europe/Berlin` |
| `page.url` | string | ❌ | Full URL |
| `page.path` | string | ❌ | Path portion |
| `page.referrer` | string | ❌ | Referrer URL |
| `page.title` | string | ❌ | Page title |
| `userAgent` | string | ❌ | Optional; do not log |
| `device.*` | object | ❌ | Optional, small subset only |

### 1.10 `consent` object (optional)
| Field | Type | Required | Notes |
|---|---|---:|---|
| `analytics` | boolean | ✅ | If user consented to analytics |
| `timestamp` | string (ISO 8601) | ✅ | When consent was recorded |

### 1.11 Event-specific fields

#### 1.11.1 `track`
| Field | Type | Required | Notes |
|---|---|---:|---|
| `name` | string | ✅ | See **1.12 naming** |
| `properties` | object | ❌ | Event properties |

#### 1.11.2 `page`
| Field | Type | Required | Notes |
|---|---|---:|---|
| `name` | string | ✅ | Recommended: `page.viewed` |
| `properties` | object | ❌ | Page properties |

#### 1.11.3 `identify`
| Field | Type | Required | Notes |
|---|---|---:|---|
| `traits` | object | ✅ | Trait object (JSON) |
| `name` | — | ❌ | Not allowed |
| `properties` | — | ❌ | Not allowed |

### 1.12 Naming & custom payload guardrails

#### Event name rule (`track`/`page`)
- Must be lower snake-case with optional dot namespaces.
- Recommended pattern: `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$`

Examples:
- `page.viewed`
- `checkout.started`
- `button.clicked`

#### `properties` / `traits` rule
- Must be JSON-serializable objects.
- Keys must follow the same naming pattern as event names.
- Keys **must not** start with `_` (reserved).
- Max depth: 3
- Max keys per object level: 50
- Max string length: 2,048
- Max array length: 100
- Max per-event payload size target: 32 KB (service should enforce a hard cap)

### 1.13 Responses
- **202 Accepted** on success (events enqueued)
- **400** on validation errors (reject entire batch)
- **401** on missing/invalid write key
- **413** on payload too large (if enforced)
- **429** on rate limiting (if configured)
- **5xx** on server errors (no raw stack traces to client)

---

## 2. Storage Model (Operational + Raw)

### 2.1 Processing semantics
- Ingestion is **asynchronous**: API accepts and enqueues; a worker persists.
- Queue processing is **at-least-once**; storage writes must be **idempotent**.
- A dead-letter mechanism must exist (DLQ/poison queue).

### 2.2 Canonical stored event record
After processing, the system must persist a normalized canonical record.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `schemaVersion` | string | ✅ | `"1.0.0"` |
| `eventId` | string | ✅ | Same as ingest |
| `type` | string | ✅ | `track` \| `page` \| `identify` |
| `name` | string | ❌ | For `track`/`page` |
| `occurredAt` | string (ISO 8601) | ✅ | Client time |
| `receivedAt` | string (ISO 8601) | ✅ | Server time (when accepted/processed) |
| `source` | object | ✅ | Same shape as ingest |
| `actor` | object | ✅ | Same shape as ingest |
| `context` | object | ❌ | Same shape as ingest |
| `properties` | object | ❌ | For `track`/`page` |
| `traits` | object | ❌ | For `identify` |

**Internal-only metadata (not exposed via API):**
- Partition keys / sort keys
- Processing attempts, DLQ reasons
- Cloud resource ids

### 2.3 Operational query store design (cloud-agnostic)
The operational store is optimized for:
- Query by `appId` + time range
- Optional query by user (`userId`) or anonymous visitor (`anonymousId`)
- Pagination
- TTL-based retention

**Retention (recommended):** configure TTL (e.g., 30–180 days) per environment.

### 2.4 AWS operational store (DynamoDB)
**Table:** `analytics_events`

**Primary key design (recommended):**
- Partition key: `pk = "APP#<appId>#DAY#<YYYY-MM-DD>"`
- Sort key: `sk = "TS#<epochMillis>#EVT#<eventId>"`

**Required attributes (recommended):**
- `occurredAtEpochMs` (number) for ordering
- `expiresAt` (epoch seconds) for TTL
- Canonical fields from **2.2**

**Optional GSIs (enable if required by queries):**
- **GSI1 (by user/day)**  
  `gsi1pk = "USER#<userId>#DAY#<YYYY-MM-DD>"`  
  `gsi1sk = "TS#<epochMillis>#EVT#<eventId>"`
- **GSI2 (by anonymous/day)**  
  `gsi2pk = "ANON#<anonymousId>#DAY#<YYYY-MM-DD>"`  
  `gsi2sk = "TS#<epochMillis>#EVT#<eventId>"`

**Idempotency guidance:**
- Ensure duplicate deliveries do not create duplicate rows for the same event.
- Prefer conditional writes and/or de-duplication checks (implementation detail).

### 2.5 Azure operational store (Cosmos DB NoSQL)
**Database:** `analytics`  
**Container:** `events`  
**Partition key path:** `/pk`

**Partition key design (recommended):**
- `pk = "APP#<appId>#DAY#<YYYY-MM-DD>"`

**Required fields (recommended):**
- `id = eventId`
- `occurredAtEpochMs` for ordering
- Canonical fields from **2.2**

**TTL:** enabled at container level (configured days).

### 2.6 Raw immutable store (audit + replay)
Raw storage captures ingested events in an immutable, cheap store for:
- audit trails
- reprocessing/replay
- long retention with lifecycle policies

#### AWS raw store
- S3 bucket (private, encrypted, lifecycle policies)

#### Azure raw store
- Blob Storage container (private, lifecycle policies)

**Recommended raw object layout:**
- `raw/appId=<appId>/env=<env>/dt=<YYYY-MM-DD>/hour=<HH>/<uuid>.jsonl`

**Format guidance:**
- JSONL recommended (one JSON per line) for efficient streaming and big-data compatibility.
- Raw records may include ingestion envelope metadata (e.g., `sentAt`) but must not contain secrets.

---

## 3. Query / Output API Contract

### 3.1 Endpoint
- **Method:** `GET`
- **Path:** `/api/v1/events`
- **Purpose:** Query stored analytics events via stable API.

### 3.2 Query parameters
| Parameter | Type | Required | Constraints / Notes |
|---|---|---:|---|
| `appId` | string | ✅ | Same `source.appId` |
| `from` | string (ISO 8601) | ✅ | Inclusive |
| `to` | string (ISO 8601) | ❌ | Exclusive; if omitted, defaults to now |
| `types` | string list | ❌ | `track,page,identify` |
| `names` | string list | ❌ | Filter by event name(s) |
| `userId` | string | ❌ | Filter by actor user |
| `anonymousId` | string | ❌ | Filter by actor anonymous |
| `sessionId` | string | ❌ | Filter by session |
| `limit` | number | ❌ | Default 50; max 200 |
| `cursor` | string | ❌ | Opaque pagination cursor |
| `sort` | string | ❌ | `asc` or `desc` (default `desc`) |

**Guardrails (recommended):**
- Maximum query window: 31 days (reject with 400 if exceeded)
- If `userId` is provided, prefer user index access paths; if `anonymousId` is provided, prefer anonymous index access paths.

### 3.3 Response body (paged results)
Response is a JSON object:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `items` | array | ✅ | List of event records |
| `nextCursor` | string | ❌ | If present, fetch next page |

### 3.4 Event record returned to consumers
Each `items[]` entry is a canonical event record intended for external consumption.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `schemaVersion` | string | ✅ | `"1.0.0"` |
| `eventId` | string | ✅ | |
| `type` | string | ✅ | |
| `name` | string | ❌ | Present for `track`/`page` |
| `occurredAt` | string (ISO 8601) | ✅ | Client time |
| `receivedAt` | string (ISO 8601) | ✅ | Server time |
| `source` | object | ✅ | Same shape as ingest |
| `actor` | object | ✅ | Same shape as ingest |
| `context` | object | ❌ | Same shape as ingest |
| `properties` | object | ❌ | For `track`/`page` |
| `traits` | object | ❌ | For `identify` |

**Important:** The API must not expose internal partition keys, cloud resource identifiers, or raw storage paths.

### 3.5 Pagination cursor rules
- Cursor must be **opaque** to consumers.
- Cursor must be stable across pages and safe to log.
- Cursor must not leak internal keys in plain form (use encoding).

---

## 4. Versioning & Backward Compatibility

### 4.1 Schema versioning
- `schemaVersion` is required in the ingest envelope and event objects.
- The service must reject unknown major versions by default.

### 4.2 Backward-compatible changes (allowed in v1.x)
- Adding optional fields
- Adding new event names
- Adding optional filters/params

### 4.3 Breaking changes (require v2.0.0+)
- Renaming/removing required fields
- Changing field meanings/types
- Changing response shapes in a non-additive way

---

## 5. Changelog

- **v1.0.0** — Initial spec: ingest contract + operational/raw storage model + query/output contract.
