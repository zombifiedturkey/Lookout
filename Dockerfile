# --- web UI ---
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web ./
RUN npm run build

# --- backend ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime ---
FROM node:22-alpine
WORKDIR /app
# ffmpeg trims saved clips. Runs as root so a mapped /data folder on Unraid is writable.
RUN apk add --no-cache ffmpeg && mkdir -p /data
ENV NODE_ENV=production PORT=8080 LOOKOUT_DATA=/data
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=web /web/dist ./public
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null 2>&1 || exit 1
CMD ["node", "dist/index.js"]
