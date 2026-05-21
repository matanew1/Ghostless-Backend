# Ghostless Backend — Technical Reference

Behavioral dating backend. NestJS monorepo with six microservices, Kafka (Redpanda), PostgreSQL (Supabase), and Redis.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Database Schema](#database-schema)
3. [Authentication](#authentication)
4. [Zone System](#zone-system)
5. [Scoring Algorithm](#scoring-algorithm)
6. [Discovery Algorithm](#discovery-algorithm)
7. [Kafka Event Pipeline](#kafka-event-pipeline)
8. [Service API Reference](#service-api-reference)
9. [Quick Start](#quick-start)
10. [Key Design Decisions](#key-design-decisions)

---

## Architecture

Six services, each with its own port and Swagger docs:

| Service | Port | Responsibility |
|---|---|---|
| `api-gateway` | 3000 | Reverse proxy, JWT validation, rate limiting |
| `auth-service` | 3001 | Login, token issuance, refresh rotation |
| `user-service` | 3002 | Profiles, avatars, photos, onboarding |
| `chat-service` | 3003 | Messages, read receipts, WebSocket |
| `scoring-service` | 3004 | Metrics recalc, zone classification |
| `matching-service` | 3005 | Discovery, interest, match creation, unmatch |

All services share a single Prisma client (`@ghostless/database`) pointing to the same PostgreSQL database. Services communicate via **Kafka** for async side effects; synchronous calls are HTTP between the gateway and downstream services.

```
Mobile Client
     │
     ▼
api-gateway :3000
 ├── auth-service :3001
 ├── user-service :3002
 ├── chat-service :3003  ──── Kafka ──▶ scoring-service :3004
 ├── matching-service :3005 ─ Kafka ──▶ scoring-service :3004
 └── scoring-service :3004
```

Swagger index of all service docs: `GET http://localhost:3000/docs/services`

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | TEXT unique | nullable — Google-only users may omit |
| `google_id` | TEXT unique | nullable |
| `password_hash` | TEXT | bcrypt hash; null for OAuth-only accounts |
| `created_at` | TIMESTAMP | |

### `user_profiles`
| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID FK→users | |
| `display_name` | TEXT | |
| `bio` | TEXT | |
| `tags` | TEXT[] | interest labels from a preset list |
| `pace_preference` | ENUM | FAST / BALANCED / SLOW |
| `gender` | ENUM | MALE / FEMALE / NON_BINARY / OTHER |
| `seeking_genders` | ENUM[] | mutual discovery filter |
| `avatar_url` | TEXT | Supabase Storage public URL |
| `photos` | TEXT[] | up to 5 extra gallery photos (order = display order) |
| `onboarding_complete` | BOOL | false until gender + seekingGenders are set |

### `user_metrics`
Maintained exclusively by `scoring-service`. One row per user, updated after every Kafka event.

| Column | Type | Notes |
|---|---|---|
| `rts` | FLOAT | Response-Time Score 0–1 |
| `eds` | FLOAT | Engagement Depth Score 0–1 |
| `gi` | FLOAT | Ghost Index 0–1 |
| `reciprocity` | FLOAT | Send-balance average 0–1 |
| `composite_score` | FLOAT | Weighted final behavioral score |
| `zone` | ENUM | Current zone (default: STEADY) |
| `pending_zone` | ENUM | Zone candidate during soft transition |
| `pending_zone_runs` | INT | Consecutive recalc runs in pending zone |
| `total_messages` | INT | Lifetime sent count |
| `revision` | INT | Optimistic concurrency version counter |

### `matches`
| Column | Type | Notes |
|---|---|---|
| `user_a_id / user_b_id` | UUID FKs | canonical pair, `a < b` by UUID string sort |
| `score` | FLOAT | alignment score at match creation time |
| `status` | ENUM | PENDING / ACTIVE / ENDED |

### `match_interests`
One row per `(from_user, to_user)` swipe right. When a mutual pair exists, `matching-service` auto-creates a match row.

### `messages`
| Column | Type | Notes |
|---|---|---|
| `match_id` | UUID FK | |
| `sender_id` | UUID | |
| `content` | TEXT | |
| `is_question` | BOOL | pre-classified at ingest |
| `read_at` | TIMESTAMP | null = unread |

### `refresh_tokens`
| Column | Notes |
|---|---|
| `token_hash` | SHA-256 of the plain token; plain token is never stored |
| `expires_at` | 7-day TTL |

---

## Authentication

### Google OAuth flow

```
Client ──(Google ID token)──▶ POST /auth/google
  auth-service verifies with Google public keys
  ──▶ findOrCreate user row (by google_id)
  ──▶ ensureProfileAndMetrics (upserts both rows on first login)
  ──▶ issues access token (15 min JWT) + refresh token (7-day random hex)
  ──▶ stores SHA-256(refreshToken) in refresh_tokens table
  ──▶ returns { accessToken, refreshToken, userId, onboardingComplete }
```

### Email / Password flow

```
POST /auth/register   { email, password }
  ──▶ bcrypt.hash(password, 10)
  ──▶ creates User row (throws 409 if email already taken)
  ──▶ same token issuance as OAuth

POST /auth/login   { email, password }
  ──▶ bcrypt.compare(password, stored hash)
  ──▶ throws 401 on mismatch
  ──▶ same token issuance as OAuth
```

### Token lifecycle

- **Access token**: JWT signed with `JWT_SECRET`, 15-min TTL. Payload: `{ sub: userId, email }`.
- **Refresh token**: 32-byte cryptographically random hex. Only its `SHA-256` hash is persisted. One-time use — on `POST /auth/refresh`, the old DB row is deleted and a fresh pair is issued.
- **Logout**: `POST /auth/logout` deletes the refresh token row, invalidating that session.

### Gateway JWT propagation

`api-gateway` validates the `Authorization: Bearer <token>` header. Downstream services never re-verify JWTs — they trust the `x-user-id` header forwarded by the gateway.

---

## Zone System

Zones describe a user's communication behavior pattern. Five zones on a spectrum from least active to most active:

```
GHOST_TOWN ── CHILL ── STEADY ── PULSE ── SPARK
  (ghosting)  (slow)  (balanced) (fast)  (fast + deep)
```

New users start at **STEADY** (the center) until they send 5+ messages and enough data exists for classification.

### Zone definitions

| Zone | Pattern | Color |
|---|---|---|
| `GHOST_TOWN` | High ghost index, low reciprocity, very slow replies | Indigo `#818CF8` |
| `CHILL` | Slow but reciprocal; thoughtful, unhurried | Sky `#7DD3FC` |
| `STEADY` | Balanced speed and depth; the default center | Emerald `#34D399` |
| `PULSE` | Fast replies, concise messages, high volume | Amber `#F59E0B` |
| `SPARK` | Fast replies with high engagement depth | Purple `#C084FC` |

### Zone classifier

Evaluated by `scoring-service` after every metrics recalc. Priority order:

```
if totalMessages < 5                                       → STEADY   (cold start)
if gi > 0.6  AND rts < 0.35  AND reciprocity < 0.4        → GHOST_TOWN
if rts ≥ 0.75 AND eds ≥ 0.65                              → SPARK
if rts ≥ 0.65 AND eds < 0.55                              → PULSE
if rts ∈ [0.4, 0.65) AND eds ∈ [0.4, 0.7)                → STEADY
if rts < 0.45 AND reciprocity ≥ 0.4                       → CHILL
else                                                       → STEADY   (fallback)
```

### Soft zone transitions

A zone change requires **2 consecutive recalc runs** returning the same new zone before it is applied (`SOFT_TRANSITION_RUNS = 2`). This prevents thrashing from short message bursts.

When a transition commits, a `USER_ZONE_CHANGED` Kafka event is published so the matching-service in-memory cache stays current.

---

## Scoring Algorithm

`scoring-service` recomputes four metrics per user from raw message and match data. All values are in `[0, 1]`.

### 1. Response-Time Score (RTS)

How fast the user typically replies.

```
avg_delay_ms = mean of inter-message delay intervals
RTS = e^(−avg_delay / k)    where k = 12 hours in ms
```

- `RTS = 1.0` → instant replies
- `RTS ≈ 0.5` → average ~8-hour delay
- `RTS → 0` → very slow / inactive

### 2. Engagement Depth Score (EDS)

Quality and richness of messages.

```
normLen       = min(avgMessageLength / 200, 1)
questionRatio = questionMessages / totalMessages
depthNorm     = min(threadDepth / 10, 1)

EDS = min(normLen × (0.5 + questionRatio) × (0.5 + depthNorm), 1)
```

Rewards: longer messages, asking questions, sustained thread depth.

### 3. Ghost Index (GI)

Measures ghosting behaviour — how often peer messages go unread.

```
base    = unreadConversations / totalConversations
decayed = previousGI × e^(−λ × hoursSinceLastUpdate)    λ = 0.01

GI = max(base, decayed × 0.5 + base × 0.5)
```

GI **decays over time** — past ghosting fades if the user improves. `GI > 0.6` triggers GHOST_TOWN zone consideration.

### 4. Reciprocity

Balance of effort across all matches.

```
for each match:
    sample = min(sentByA, sentByB) / max(sentByA, sentByB)

Reciprocity = mean(samples)    [0.5 default if no data]
```

`1.0` = perfectly balanced. `0.0` = completely one-sided.

### 5. Composite Score

Weighted behavioral quality index used for match scoring:

```
Composite = 0.40 × RTS + 0.35 × EDS + 0.25 × Reciprocity − 0.20 × GI
```

| Signal | Weight | Rationale |
|---|---|---|
| RTS | 40% | Responsiveness is the strongest early engagement signal |
| EDS | 35% | Prevents fast-but-shallow users from dominating discovery |
| Reciprocity | 25% | Match-dependent signal; noisier on small samples |
| GI | −20% | Ghosting penalty — deducts even from otherwise high scorers |

---

## Discovery Algorithm

`matching-service` ranks candidates for a given user. The pipeline has three layers: pre-filter → zone gate → ghost gate → score.

### Layer 1 — Pre-filters (hard exclusions)

1. Candidate must have `onboardingComplete = true`.
2. **Mutual gender preference**: `myGender ∈ theirSeekingGenders` AND `theirGender ∈ mySeekingGenders`.
3. **Already connected**: all users involved in any existing match (any status) are excluded.

### Layer 2 — Zone compatibility gate

Uses a precomputed symmetric compatibility matrix. Gate threshold: **`alignment ≥ 0.5`**.

```
          GHOST   CHILL  STEADY  PULSE  SPARK
GHOST_TOWN  1.0    0.7    0.4    0.1    0.0
CHILL       0.7    1.0    0.8    0.4    0.2
STEADY      0.4    0.8    1.0    0.7    0.5
PULSE       0.1    0.4    0.7    1.0    0.8
SPARK       0.0    0.2    0.5    0.8    1.0
```

**Effect:** Adjacent zones see each other (CHILL↔STEADY = 0.8 ✓). Polar opposites are blocked (GHOST_TOWN↔SPARK = 0.0 ✗). No dead-end silos — every zone has 3–4 compatible neighbors.

Same-zone matches still rank higher in scoring (`alignment = 1.0`) vs adjacent (`0.7–0.8`).

### Layer 3 — Ghost compatibility gate

Protects non-ghosters from serial ghosters.

```
ghostGap = |myGI − theirGI|
if ghostGap > 0.5  →  skip candidate
```

Two ghosters can match each other (gap is small). A reliable user (GI = 0.1) will never be shown a serial ghoster (GI = 0.8).

### Scoring formula

```
score = interestSim + alignment + velocityMatch − ghostPenalty

  interestSim   = Jaccard(myTags, theirTags)          // 0–1  shared interests
  alignment     = matrix[myZone][theirZone]            // 0–1  zone compatibility
  velocityMatch = 1 − |myRTS − theirRTS|              // 0–1  similar response pace
  ghostPenalty  = max(myGI, theirGI) × 0.4
                + ghostGap × 1.0                       // asymmetry hurts most
```

Results are sorted descending; top 20 are returned.

---

## Kafka Event Pipeline

### Topics

| Topic constant | Topic name | Publisher | Consumers |
|---|---|---|---|
| `MESSAGE_SENT` | `ghostless.message.sent` | chat-service | scoring-service |
| `MESSAGE_READ` | `ghostless.message.read` | chat-service | scoring-service |
| `MATCH_CREATED` | `ghostless.match.created` | matching-service | scoring-service |
| `USER_ZONE_CHANGED` | `ghostless.user.zone.changed` | scoring-service | matching-service |
| `INTEREST_EXPRESSED` | `ghostless.user.interest` | matching-service | scoring-service |

### Event payloads

```typescript
MessageSentEvent       { matchId: string; senderId: string; sentAt: string }
MessageReadEvent       { matchId: string; messageId: string; readerId: string; readAt: string }
MatchCreatedEvent      { matchId: string; userAId: string; userBId: string }
UserZoneChangedEvent   { userId: string; previousZone: Zone; newZone: Zone; changedAt: string }
InterestExpressedEvent { fromUserId: string; toUserId: string; expressedAt: string }
```

### Full flow: message sent → possible zone change

```
1. User sends message
   ├── chat-service persists Message row
   └── publishes MESSAGE_SENT

2. scoring-service consumer (group: scoring-service-messages)
   ├── increments user_metrics.total_messages (fast, cheap)
   └── enqueues userId in RecalcEnqueuer

3. RecalcEnqueuer deduplicates burst events, then drains
   └── calls ScoringService.recalculateUser(userId)

4. ScoringService.recalculateUser
   ├── reads last 500 messages + all matches for userId
   ├── computes RTS, EDS, GI, Reciprocity, Composite
   ├── classifies new zone via ZoneClassifier
   ├── applies soft-transition logic (requires 2 stable runs)
   ├── writes updated user_metrics (optimistic lock on revision)
   └── if zone changed → publishes USER_ZONE_CHANGED

5. matching-service receives USER_ZONE_CHANGED
   └── updates in-memory zoneCache[userId] — no DB round-trip needed on next discovery call
```

### Full flow: swipe right → possible match

```
1. User swipes right → POST /discovery/interest { toUserId }
   ├── matching-service upserts MatchInterest row
   ├── checks for mutual interest (reverse row exists?)
   │   └── if mutual → createMatch → publishes MATCH_CREATED
   └── publishes INTEREST_EXPRESSED

2. scoring-service receives INTEREST_EXPRESSED
   └── enqueues fromUserId for recalc
       (activity signal can shift zone even without messages)

3. scoring-service receives MATCH_CREATED (if match was created)
   └── upserts user_metrics rows for both users, enqueues both for recalc
```

### Recalc queue (RecalcEnqueuer)

An in-process queue backed by Redis. Deduplicates rapid-fire events for the same user (10 messages → 1 recalc). If `recalculateUser` returns `'stale'` (optimistic lock lost to another worker), the userId is automatically re-enqueued.

---

## Service API Reference

### auth-service (:3001)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/google` | — | Login with Google ID token |
| POST | `/auth/register` | — | Create email/password account |
| POST | `/auth/login` | — | Email/password sign in |
| POST | `/auth/refresh` | — | Rotate refresh token (one-time use) |
| POST | `/auth/logout` | Bearer | Revoke current refresh token |

### user-service (:3002)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | Bearer | Own full profile |
| PATCH | `/users/me` | Bearer | Update profile fields |
| POST | `/users/me/avatar` | Bearer | Upload/replace avatar (base64 data URI) |
| POST | `/users/me/photos` | Bearer | Add gallery photo (max 5 total) |
| DELETE | `/users/me/photos/:index` | Bearer | Remove gallery photo by index |
| GET | `/users/me/zone` | Bearer | Own current zone |
| GET | `/users/:id/public` | Bearer | Partner's public profile |

### matching-service (:3005)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/discovery` | Bearer | Ranked candidate list (max 20) |
| POST | `/discovery/interest` | Bearer | Swipe right on a user |
| GET | `/discovery/matches` | Bearer | List own matches with partner info |
| DELETE | `/discovery/matches/:id` | Bearer | Unmatch (status → ENDED) |

### chat-service (:3003)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/chat/:matchId/messages` | Bearer | Paginated message history |
| POST | `/chat/:matchId/messages` | Bearer | Send a message |
| POST | `/chat/:matchId/read` | Bearer | Mark all unread messages as read |
| WS | `/chat` | Bearer in query | Real-time message stream |

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd Ghostless-Backend
cp .env.example .env        # fill in values below
npm install

# 2. Generate Prisma client
npm run prisma:generate

# 3. Apply all migrations to your database
npx prisma migrate deploy

# 4. Create Kafka topics (Redpanda must be running)
npm run kafka:topics

# 5. Start all services in watch mode
npm run start:dev
```

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `JWT_SECRET` | HS256 signing secret for access tokens |
| `JWT_EXPIRES_IN` | Access token TTL (default: `15m`) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime (default: `7`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `KAFKA_BROKER` | Kafka broker address (default: `localhost:9092`) |
| `REDIS_URL` | Redis URL for the recalc queue |
| `SUPABASE_URL` | Supabase project URL (for Storage uploads) |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key |

### Running tests

```bash
npm test             # unit tests for all services
npm run test:e2e     # end-to-end tests
```

---

## Key Design Decisions

**Why Kafka instead of direct HTTP calls between services?**
Scoring is a side effect of chat activity. Kafka decouples the write path (storing a message) from the compute path (recalculating metrics). A slow recalc never blocks message delivery, and events are replayable if the scoring service restarts.

**Why optimistic concurrency (`revision` column) on `UserMetrics`?**
Multiple Kafka consumers can process events for the same user concurrently. Each write increments `revision` and checks the previous value — if another worker won the race, the loser receives `'stale'` and re-enqueues rather than overwriting with stale data.

**Why soft zone transitions (2 consecutive runs)?**
A single unusually fast message burst shouldn't instantly flip someone from CHILL to SPARK. Requiring two consecutive stable classifications smooths short-term noise without adding latency for genuine behavioral shifts.

**Why STEADY as the new-user default?**
STEADY is the center of the compatibility spectrum. Starting there gives new users the widest candidate pool (CHILL↔STEADY = 0.8, PULSE↔STEADY = 0.7 both pass the discovery gate) while leaving room to drift toward their real zone as data accumulates.

**Why a hard ghost gate in discovery in addition to score penalties?**
Scoring alone only lowers a ghoster's rank — it can't prevent a non-ghoster from seeing them when their interest score is high. The `|GI gap| > 0.5` gate is a reliability contract: users with incompatible ghosting patterns are never shown to each other, regardless of shared interests.

**Why store photos in a `String[]` instead of a separate table?**
Gallery photos are purely ordered display data with no relational semantics. An array column avoids a join on every profile fetch and keeps the schema flat. The 5-photo cap is enforced in the service layer.

**Why SHA-256 the refresh token before storing it?**
If the database leaks, raw refresh tokens would allow account takeover. Storing the hash means leaked DB rows are useless — the plain token is only ever in transit. (bcrypt is intentionally not used here — we need fast lookup, not password hardening.)
