# Spare Notify

A real-time notification system built for the Spare engineering take-home assignment.

## What I Built

A minimal notification backend (Encore.ts + PostgreSQL) and a TypeScript CLI compiled
to a single executable binary (Bun). The system supports two notification channels —
`in_app` (persisted and queryable) and `email` (simulated via console log) — with
full CRUD operations on users and notifications.

## Backend

### Prerequisites
- [Encore CLI](https://encore.dev/docs/install)
- Node.js 18+

### Run locally
```bash
cd backend
npm install
encore run
```

Encore provisions a local PostgreSQL instance and runs migrations automatically.
The API will be available at the URL printed in the terminal (typically `http://localhost:4000`).

### Encore Dashboard
While running, visit http://localhost:9400 for the Encore dev dashboard (API explorer, traces, logs).

## CLI

### Build the binary
```bash
cd cli
bun install
bun build --compile ./src/cli.ts --outfile notify
```

### Configuration
Set the backend URL via environment variable or flag:
```bash
export NOTIFY_API_URL=http://localhost:4000
# or per-command:
./notify --api-url=http://localhost:4000 <command>
```

### Commands

```bash
# Users
./notify users create --name="Alice" --email="alice@example.com"
./notify users list

# Notifications
./notify send --user-id=<id> --channel=in_app --title="Hello" --body="Welcome!"
./notify send --user-id=<id> --channel=email  --title="Invoice" --body="Ready."
./notify list   --user-id=<id>
./notify unread --user-id=<id>
./notify read   --id=<notification-id>
```

## Running with Docker

The repo ships with a `docker-compose.yml` that boots PostgreSQL and the Encore
backend together, plus a separate `Dockerfile` for the CLI that builds the
`notify` binary inside an image.

### 1. Configure environment

```bash
cp .env.example .env
# then edit .env and set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
```

### 2. Start Postgres + backend

```bash
docker compose up --build
```

The `db` service has a `pg_isready` healthcheck, so the `backend` container
won't start until Postgres is accepting connections. The API is exposed on
host port **4000**.

### 3. Use the CLI container against the running backend

Build the CLI image once:

```bash
docker build -t spare-notify-cli ./cli
```

Then run any command (the `notify` binary is the image's entrypoint, so you
just pass arguments). `--network=host` lets the container reach the backend
on `localhost:4000`:

```bash
docker run --rm --network=host spare-notify-cli users list
docker run --rm --network=host spare-notify-cli send \
  --user-id=<id> --channel=in_app --title="Hi" --body="Hello"
```

If you'd rather point at a different host, set `NOTIFY_API_URL`:

```bash
docker run --rm -e NOTIFY_API_URL=http://host.docker.internal:4000 \
  spare-notify-cli users list
```

## Authentication

All `users` and `notifications` endpoints (except the SSE stream) require an
`X-API-Key` header. The auth handler lives in `backend/auth` and validates the
header against bcrypt hashes stored in the `api_keys` table.

### Generate a key

`POST /auth/keys` is intentionally **unauthenticated** so you can bootstrap your
first key. The raw key is returned **once** in the response — store it somewhere
safe.

```bash
curl -sX POST http://localhost:4000/auth/keys \
  -H "Content-Type: application/json" \
  -d '{"name":"my-laptop"}'
# => {"id":"...","key":"<64 hex chars>","name":"my-laptop","createdAt":"..."}
```

### Use the key with the CLI

```bash
# As an env var (recommended for shell sessions)
export NOTIFY_API_KEY=<paste-key-here>
./notify users list

# Or per-command
./notify --api-key=<key> users list
```

### Verify the key

```bash
./notify --api-key=<key> users list   # any protected endpoint
# or via curl
curl -s http://localhost:4000/auth/verify -H "X-API-Key: <key>"
```

### Disable auth (local development)

Set `AUTH_ENABLED=false` in `.env` (or the backend's environment) to bypass auth
entirely. Every request is treated as authenticated with a placeholder identity.

## Pagination

All list endpoints (`GET /users`, `GET /notifications`, `GET /notifications/unread`)
support cursor-based pagination. Each response has the shape:

```json
{ "data": [...], "nextCursor": "<id-or-null>", "hasMore": true }
```

CLI usage:

```bash
# First page (default limit = 20, max 100)
./notify list --user-id=<uid> --limit=10

# Copy the printed "Next cursor" value and pass it back
./notify list --user-id=<uid> --limit=10 --cursor=<id-from-previous-output>

# Same flags work on `users list` and `unread`
./notify users list --limit=5
./notify unread --user-id=<uid> --limit=50 --cursor=<id>
```

When `hasMore` is true the CLI prints `More results available. Next cursor: <id>`
so you can paste it straight into the next call.

## Real-time streaming (SSE)

`GET /notifications/stream?userId=<id>` is a Server-Sent Events feed. When a new
notification is created for that user via `POST /notifications`, an in-memory
pub/sub fan-out pushes the JSON payload to every active SSE subscriber for that
userId. The endpoint also emits 30-second `: ping` heartbeats to keep idle
connections alive through intermediaries.

The pub/sub is process-local — fine for a single-instance dev run, but it must
be replaced with Redis / NATS pub/sub before scaling out (a code comment in
`notifications.ts` marks the swap-out point).

The SSE endpoint is **intentionally unauthenticated** so the CLI can subscribe
without an API key (custom headers can't be set with the browser `EventSource`
API either). A production version would accept a key via `?apiKey=` or a
short-lived signed token.

```bash
# In one terminal
./notify stream --user-id=<uid>

# In another, trigger a notification
./notify send --user-id=<uid> --channel=in_app --title="Hi" --body="real-time!"
```

The streaming terminal prints each event as it arrives. Press `Ctrl+C` to
disconnect.

## Running tests

The integration tests in `backend/users/users.test.ts` and
`backend/notifications/notifications.test.ts` use Vitest (the framework that
Encore.ts shells out to) and hit a freshly provisioned Postgres schema managed
by the Encore test runner.

```bash
cd backend
encore test ./...
```

`encore test` brings up a clean database, runs migrations, then invokes Vitest.

## Architecture & Choices

**Encore.ts** was chosen as the backend framework because it provides zero-config
PostgreSQL provisioning, automatic API schema generation, and built-in observability
(traces, logs) with minimal boilerplate. Services are co-located with their migrations.

**Two Encore services** (`users`, `notifications`) with separate databases enforce
service boundaries. The notifications service references user IDs but does not import
the users service directly — loose coupling by foreign key, not code dependency.

**Email simulation** is implemented as a `console.log` side effect in `dispatchChannel()`.
In production this would be replaced with a call to SendGrid, Resend, or an internal
email queue. The abstraction point is already in place.

**Commander.js** was chosen for the CLI argument parsing because it handles
subcommands, typed options, and `--help` generation cleanly, keeping `cli.ts` minimal.

**Bun `--compile`** bundles the CLI and all dependencies into a single self-contained
binary with no runtime dependency on Node.js or Bun being installed on the target machine.

## If I Had More Time

- Add WebSocket or SSE support for true real-time push to connected clients
- User preferences table for per-user channel opt-in/opt-out
- Pagination on list endpoints (cursor-based)
- Retry logic and a dead-letter queue for failed email dispatches
- Authentication (JWT or API key) on all endpoints
- Integration tests using Encore's built-in test runner against a real test DB
- Rate limiting on the send endpoint to prevent notification spam
