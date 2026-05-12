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
