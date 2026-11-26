# Desktop updates on the VPS

The `/updates/*` route is part of the site definition `ops/vps/deploy/bookeeper.caddy`,
which every VPS deploy installs as `/etc/caddy/bookeeper.caddy`.

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
