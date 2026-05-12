FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun build --compile ./src/cli.ts --outfile notify

# Final image: minimal glibc runtime carrying just the compiled binary.
FROM debian:bookworm-slim

WORKDIR /app
COPY --from=build /app/notify ./notify

ENTRYPOINT ["./notify"]
