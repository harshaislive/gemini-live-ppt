FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PATH="/root/.local/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh

WORKDIR /app

COPY client/package.json client/package-lock.json /app/client/
WORKDIR /app/client
RUN npm ci

COPY client /app/client
RUN npm run build

COPY server /app/server
WORKDIR /app/server
RUN uv sync --locked --no-dev

WORKDIR /app
COPY deploy/start-app.sh /app/deploy/start-app.sh
RUN chmod +x /app/deploy/start-app.sh

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

CMD ["/app/deploy/start-app.sh"]
