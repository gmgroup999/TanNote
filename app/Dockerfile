# syntax=docker/dockerfile:1.4
# TanNote frontend — used by Z-Node (buildSubdir=app). Adds proper cache
# headers so the SPA shell is never served stale (the cause of white-screen
# after deploys: a cached index.html referencing old, now-404 asset hashes).
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

FROM nginx:alpine
# Hashed assets: cache forever + real 404 if missing (never fall back to HTML).
# Everything else (index.html, sw.js, manifest, icons, routes): no-cache so the
# WebView always revalidates and picks up new asset hashes immediately.
RUN printf 'server {\n  listen 3010;\n  root /usr/share/nginx/html;\n  index index.html;\n  location /assets/ {\n    try_files $uri =404;\n    add_header Cache-Control "public, max-age=31536000, immutable";\n  }\n  location / {\n    try_files $uri /index.html;\n    add_header Cache-Control "no-cache";\n  }\n}\n' > /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 3010
CMD ["nginx", "-g", "daemon off;"]
