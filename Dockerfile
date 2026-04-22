FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY client/package.json client/package-lock.json /app/client/
WORKDIR /app/client
RUN npm ci

COPY client /app/client
COPY server/content /app/server/content
RUN npm run build

WORKDIR /app
COPY deploy/start-app.sh /app/deploy/start-app.sh
RUN chmod +x /app/deploy/start-app.sh

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

CMD ["/app/deploy/start-app.sh"]
