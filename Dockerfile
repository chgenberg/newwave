FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-core fonts-noto-color-emoji ca-certificates poppler-utils \
  && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Klubbregistret (scripts/scrape-clubs.mjs publish) ligger som release-tillgång, inte i repot.
ARG CLUBS_RELEASE=clubs-2026-10-22
ADD https://github.com/chgenberg/newwave/releases/download/${CLUBS_RELEASE}/clubs.tar.gz /tmp/clubs.tar.gz
RUN mkdir -p registry/clubs && tar -xzf /tmp/clubs.tar.gz -C registry/clubs && rm /tmp/clubs.tar.gz

COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]
