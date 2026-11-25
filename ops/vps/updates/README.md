# Desktop updates on the VPS

`bookeeper.caddy` is the full site definition for `app.neokeeper.dev` and
`mobile.neokeeper.dev`: the one in `ops/vps/deploy/` plus a `/updates/*` block. It is
**not** applied by any workflow (a push under `ops/vps/deploy/` starts a deploy). The owner
decides when to replace `/etc/caddy/bookeeper.caddy` with it (or copy it over
`ops/vps/deploy/bookeeper.caddy`), validate and reload Caddy.

## Layout of `/opt/bookeeper/updates/`

```
stable/latest.json        manifest read by stable builds
beta/latest.json          manifest read by beta builds (a stable release updates it too)
files/<version>/<file>    update artifacts and their .sig (last 3 versions are kept)
```

Served at `https://app.neokeeper.dev/updates/…`. `latest.json` is sent with
`Cache-Control: no-cache`, `files/` with a long, immutable cache.

The `publish-updates` job of `.github/workflows/release.yml` fills this tree: it copies the
files first and writes each `latest.json` last, atomically (temporary file and `mv`).
