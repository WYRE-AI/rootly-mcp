# Multi-stage build → GHCR
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json .npmrc ./
ARG NODE_AUTH_TOKEN
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

FROM node:22-alpine AS production
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser
WORKDIR /app
COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_PORT=8080 \
    LOG_LEVEL=info
CMD ["node", "dist/http.js"]
