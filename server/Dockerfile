# syntax=docker/dockerfile:1.7
#
# Build context: REPO ROOT (compose sets `context: ..`). This Dockerfile
# lives under server/ but reaches across the repo to also build the mobile
# PWA, which is then embedded into the Go binary via //go:embed.

# ---- mobile PWA build (Node) ----
# Builds clients/mobile-web/dist via npm workspaces. We invoke the workspace
# explicitly so we don't drag desktop frontend deps into this stage.
FROM --platform=$BUILDPLATFORM node:20-alpine AS mobile
WORKDIR /repo

# Copy only the files needed for `npm install --workspace=clients/mobile-web`
# to maximise layer cache. The mobile workspace has its own package.json.
COPY package.json package-lock.json* ./
COPY clients/mobile-web/package.json clients/mobile-web/

# npm workspaces require ALL workspace package.json files to resolve the
# graph, even when installing one workspace. Desktop is referenced for its
# manifest only — we never run its install/build here.
COPY clients/desktop/frontend/package.json clients/desktop/frontend/

RUN --mount=type=cache,target=/root/.npm \
    npm install --workspace=clients/mobile-web --no-audit --no-fund

COPY clients/mobile-web/ clients/mobile-web/
RUN npm run build --workspace=clients/mobile-web


# ---- Go server build ----
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS build
WORKDIR /src

ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH}

# Server module lives under server/.
COPY server/go.mod server/go.sum* ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY server/ ./

# Drop the placeholder dist that ships with the repo, then copy the freshly
# built mobile bundle into the embed location. The Go embed declaration is
# `//go:embed all:dist` rooted at server/internal/api/.
RUN rm -rf internal/api/dist && mkdir -p internal/api/dist
COPY --from=mobile /repo/clients/mobile-web/dist/ ./internal/api/dist/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags="-s -w" -o /out/bookeeper-server ./cmd/bookeeper-server


# ---- runtime ----
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app

COPY --from=build /out/bookeeper-server /app/bookeeper-server

USER nonroot:nonroot

# Authenticated and bootstrap surfaces. Caddy in front terminates TLS/mTLS.
EXPOSE 7842 7843

VOLUME ["/data"]

ENTRYPOINT ["/app/bookeeper-server"]
