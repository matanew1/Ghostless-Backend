# Ghostless Backend

Behavioral dating backend — NestJS monorepo with microservices, Kafka (Redpanda), PostgreSQL, and Redis.

## Architecture

| Service | Port | Swagger |
|---------|------|---------|
| api-gateway | 3000 | http://localhost:3000/docs |
| auth-service | 3001 | http://localhost:3001/docs |
| user-service | 3002 | http://localhost:3002/docs |
| chat-service | 3003 | http://localhost:3003/docs |
| scoring-service | 3004 | http://localhost:3004/docs |
| matching-service | 3005 | http://localhost:3005/docs |

Gateway index of all Swagger URLs: `GET http://localhost:3000/docs/services`

## Zones

`GHOST_TOWN` → `CHILL` → `STEADY` → `PULSE` → `SPARK` (plus internal `UNMAPPED` for cold start).

## Quick start

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run kafka:topics
npm run start:dev
```

## Kafka topics

- `ghostless.message.sent`
- `ghostless.message.read`
- `ghostless.match.created`
- `ghostless.user.zone.changed`

## Tests

```bash
npm test
```

## OAuth

Configure `GOOGLE_CLIENT_ID` and `APPLE_CLIENT_ID` in `.env`. For local dev without real IdPs, use service-level Swagger on auth-service to inspect contracts.
