FROM node:22-bookworm-slim

# Encore install script and runtime helpers
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install Encore CLI (writes to /root/.encore)
RUN curl -fsSL https://encore.dev/install.sh | sh
ENV PATH="/root/.encore/bin:${PATH}"

WORKDIR /app

# Install npm deps first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install

# App source
COPY . .

EXPOSE 4000

# `encore run` serves the dev API. The compose file injects POSTGRES_* env vars
# so Encore can connect to the bundled Postgres service instead of provisioning
# its own.
CMD ["encore", "run", "--listen", "0.0.0.0:4000"]
