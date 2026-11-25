# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-alpine
ARG RUST_IMAGE=rust:1-alpine
ARG RUNTIME_IMAGE=gcr.io/distroless/static-debian12

# --- Web: builds the mobile app that the server binary embeds.
FROM ${NODE_IMAGE} AS web
WORKDIR /src
COPY . .
RUN npm ci && npm run build -w @bookeeper/mobile

# --- Rust: static (musl) server binary.
FROM ${RUST_IMAGE} AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY . .
# The binary embeds apps/mobile/dist, so it must exist before cargo runs.
COPY --from=web /src/apps/mobile/dist apps/mobile/dist
RUN cargo build --release --locked -p bookeeper-server \
 && mkdir -p /out/data \
 && cp target/release/bookeeper-server /out/bookeeper-server

# --- Runtime
FROM ${RUNTIME_IMAGE}
LABEL org.opencontainers.image.title="Bookeeper server" \
      org.opencontainers.image.source="https://github.com/Bardugo624/Bookeeper-Neo" \
      org.opencontainers.image.licenses="MIT"
COPY --from=build /out/bookeeper-server /usr/local/bin/bookeeper-server
COPY --from=build /out/data /data
ENV BOOKEEPER_DATA=/data BOOKEEPER_MDNS=off
VOLUME /data
EXPOSE 7842 443
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/usr/local/bin/bookeeper-server", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/bookeeper-server"]
