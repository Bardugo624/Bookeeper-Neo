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

## R2

Updates are also published to R2 (bucket `bookeeper-update`), served at
`https://updates.neokeeper.dev/v2`:

```
v2/stable/latest.json, v2/beta/latest.json   channel manifests (no-cache)
v2/files/<version>/<file>, <file>.sig        update artifacts, plus manifest.json of that version
v2/downloads/<version>/<file>                installers
v2/downloads/stable.json, beta.json          download indexes (no-cache)
```

`release.yml` publishes there when the R2 variables and secrets are set, and keeps writing
to the VPS unless `UPDATES_REDIRECT` is `on`. The `updates.yml` workflow (manual, `main` only)
copies the VPS tree into R2 (`seed`) or withdraws a version (`withdraw`).

### Switching to R2

1. Run `updates.yml` with `action=seed` (try `dry_run` first).
2. Check that R2 is ready: `node scripts/updates-r2.mjs ready --base https://updates.neokeeper.dev/v2 --vps https://app.neokeeper.dev/updates`.
3. Set the repository variable `UPDATES_REDIRECT=on`.
4. Run `vps-deploy.yml` with `target=caddy`. It installs `bookeeper-r2.caddy`, which redirects
   `/updates/*` to R2, and runs `ready` first: if R2 is incomplete the VPS is not touched.

### Going back

Set `UPDATES_REDIRECT=off`, then run `vps-deploy.yml` with `target=caddy`. That reinstalls
`bookeeper.caddy`, which serves the files on the VPS again. Releases made while the redirect
was on were not copied to the VPS, so run `seed` in reverse by hand if you need them there.

`vps-deploy.yml` and `vps-ops.yml` run only by hand, from `main`.
