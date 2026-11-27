// Public readiness check: can the VPS safely redirect updates to R2?
import { compare } from "../semver.mjs";
import { trimBase } from "./plan.mjs";

const CHANNELS = ["stable", "beta"];

async function readJson(url, fetchFn) {
  try {
    const res = await fetchFn(url);
    if (res.status !== 200) return { status: res.status };
    return { status: 200, json: JSON.parse(await res.text()) };
  } catch (e) {
    return { error: e.message };
  }
}

export async function checkReady({ base, vps, fetch: fetchFn = globalThis.fetch }) {
  const problems = [];
  const urls = new Set();
  for (const channel of CHANNELS) {
    const url = `${trimBase(base)}/${channel}/latest.json`;
    const r = await readJson(url, fetchFn);
    if (r.status !== 200 || typeof r.json?.version !== "string") {
      problems.push(`${channel}: ${url} is not readable (${r.status ?? r.error ?? "invalid JSON"})`);
      continue;
    }
    const mine = r.json;
    const theirs = (await readJson(`${trimBase(vps)}/${channel}/latest.json`, fetchFn)).json;
    try {
      if (typeof theirs?.version === "string" && compare(mine.version, theirs.version) < 0) {
        problems.push(`${channel}: R2 has ${mine.version}, older than ${theirs.version} on the VPS`);
      }
    } catch (e) {
      problems.push(`${channel}: ${e.message}`);
    }
    for (const p of Object.values(mine.platforms ?? {})) if (p?.url) urls.add(p.url);
  }
  for (const url of urls) {
    try {
      const res = await fetchFn(url, { method: "HEAD" });
      if (res.status !== 200) problems.push(`${url} answers ${res.status}`);
    } catch (e) {
      problems.push(`${url} is not reachable (${e.message})`);
    }
  }
  return { ok: problems.length === 0, problems };
}
