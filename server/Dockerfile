# syntax=docker/dockerfile:1.7

# ---- builder ----
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS build
WORKDIR /src

# Pure-Go SQLite (modernc.org/sqlite) needs no CGO → trivial cross-compile.
# TARGETOS/TARGETARCH are populated by buildx when building multi-arch
# (e.g. `docker buildx build --platform linux/amd64,linux/arm64 ...`).
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH}

COPY go.mod go.sum* ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
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
