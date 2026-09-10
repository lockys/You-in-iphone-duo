FROM node:24-bookworm-slim AS build
WORKDIR /app
# The runtime installs system FFmpeg; skip optional npm binary downloads.
ENV FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run deploy -- node

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000 FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe MEDIA_TEMP_DIR=/app/.media-cache
COPY --from=build --chown=node:node /app/.output ./
RUN mkdir -p /app/.media-cache && chown node:node /app/.media-cache
USER node
EXPOSE 3000
CMD ["node", "index.js"]
