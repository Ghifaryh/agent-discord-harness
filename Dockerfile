FROM golang:1.23-alpine AS go-builder

RUN apk add --no-cache git

# Build outline-cli
WORKDIR /build/outline-cli
COPY bin/outline-cli/ .
RUN go build -o /build/outline-cli/outline-cli .

# Build plane-cli
WORKDIR /build/plane-cli
COPY bin/plane-cli/ .
RUN go build -o /build/plane-cli/plane-cli .

# Build forgejo-cli
WORKDIR /build/forgejo-cli
COPY bin/forgejo-cli/ .
RUN go build -o /build/forgejo-cli/forgejo-cli .

# ──────────────────────────────────────────────

FROM node:22-alpine AS node-builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ──────────────────────────────────────────────

FROM node:22-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=node-builder /app/dist ./dist
COPY --from=go-builder /build/outline-cli/outline-cli ./bin/outline-cli
COPY --from=go-builder /build/plane-cli/plane-cli ./bin/plane-cli
COPY --from=go-builder /build/forgejo-cli/forgejo-cli ./bin/forgejo-cli
COPY config/ ./config/

RUN chmod +x ./bin/outline-cli ./bin/plane-cli ./bin/forgejo-cli

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
