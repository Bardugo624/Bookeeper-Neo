// Draws the example house (plan) and a bookcase front (elevation) as SVG strings.
// Shared by the build (static first paint) and the browser (interaction).

import { rooms, doors, furniture, fittings, windows, books, ENTRY, ORDINALS } from './house.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pts = (list) => list.map(([x, y]) => `${x},${y}`).join(' ');

export function findBook(id) {
  return books.find((b) => b.id === id) || books[0];
}

export function answer(book, lang, t) {
  const f = furniture.find((x) => x.id === book.furniture);
  const room = rooms.find((r) => r.id === f.room);
  const ord = ORDINALS[lang][book.shelf - 1];
  return {
    title: book[lang].title,
    author: book[lang].author,
    room: room[lang],
    furniture: f[lang],
    shelf: `${ord} ${t.planShelf}`,
    sentence: `${room[lang]}, ${f[lang].charAt(0).toLowerCase()}${f[lang].slice(1)}, ${ord} ${t.planShelf}.`,
    furnitureId: f.id,
    front: f.front,
    tag: f.tag,
    shelfNo: book.shelf,
    route: [ENTRY, ...f.route],
  };
}

export function renderPlan(lang, t, selected) {
  const a = answer(selected, lang, t);
  const out = [];
  out.push(`<svg class="plan" viewBox="0 0 1000 790" role="img" aria-labelledby="plan-title">`);
  out.push(`<title id="plan-title">${esc(t.planExample)}</title>`);
  out.push(`<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="7" class="hatch-line"/></pattern></defs>`);

  // Dimension line along the top: the house is 9.20 m wide.
  out.push(`<g class="dim" aria-hidden="true"><line x1="40" y1="16" x2="960" y2="16"/><line x1="40" y1="8" x2="40" y2="24"/><line x1="960" y1="8" x2="960" y2="24"/><line x1="520" y1="10" x2="520" y2="22"/><text x="280" y="10">4,80</text><text x="740" y="10">4,40</text></g>`);

  out.push(`<g class="floor">`);
  const foundRoom = furniture.find((f) => f.id === a.furnitureId).room;
  for (const r of rooms) out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="room${r.id === foundRoom ? ' is-found' : ''}" data-room="${r.id}"/>`);
  out.push(`</g>`);

  out.push(`<g class="fittings" aria-hidden="true">`);
  for (const f of fittings) {
    out.push(f.kind === 'rect'
      ? `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="${f.r}"/>`
      : `<circle cx="${f.cx}" cy="${f.cy}" r="${f.r}"/>`);
  }
  out.push(`</g>`);

  // Walls: outer 14, inner 8, cut with poché hatching; gaps erase door and window openings.
  out.push(`<g class="walls" aria-hidden="true">`);
  for (const layer of ['wall-edge', 'wall-fill']) {
    out.push(`<path class="${layer} inner" d="M520 40V720M40 400H520M520 300H960M700 300V720"/>`);
    out.push(`<rect x="40" y="40" width="920" height="680" class="${layer} outer"/>`);
  }
  for (const d of doors) out.push(`<line class="gap" x1="${d.gap[0]}" y1="${d.gap[1]}" x2="${d.gap[2]}" y2="${d.gap[3]}"/>`);
  for (const w of windows) out.push(`<line class="gap" x1="${w[0]}" y1="${w[1]}" x2="${w[2]}" y2="${w[3]}"/><line class="window" x1="${w[0]}" y1="${w[1]}" x2="${w[2]}" y2="${w[3]}"/>`);
  for (const d of doors) {
    const [hx, hy] = d.hinge;
    const [lx, ly] = d.leaf;
    const [gx1, gy1, gx2, gy2] = d.gap;
    const end = gx1 === hx && gy1 === hy ? [gx2, gy2] : [gx1, gy1];
    out.push(`<line class="leaf" x1="${hx}" y1="${hy}" x2="${lx}" y2="${ly}"/><path class="swing" d="M${lx} ${ly}A50 50 0 0 ${d.sweep} ${end[0]} ${end[1]}"/>`);
  }
  out.push(`</g>`);

  out.push(`<g class="cases">`);
  for (const f of furniture) {
    const on = f.id === a.furnitureId ? ' is-found' : '';
    out.push(`<g class="case${on}" data-furniture="${f.id}"><rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}"/></g>`);
  }
  out.push(`</g>`);
  out.push(`<g class="labels" aria-hidden="true">`);
  for (const r of rooms) {
    const [x, y] = r.label;
    out.push(`<text x="${x}" y="${y}" class="room-label${r.vertical ? ' is-vertical' : ''}"${r.vertical ? ` transform="rotate(-90 ${x} ${y})"` : ''}>${esc(r[lang])}</text>`);
  }
  out.push(`</g>`);

  out.push(`<polyline class="route" points="${pts(a.route)}"/>`);
  const f = furniture.find((x) => x.id === a.furnitureId);
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  out.push(`<line class="leader" x1="${cx}" y1="${cy}" x2="${a.tag[0]}" y2="${a.tag[1]}"/>`);
  out.push(`<circle class="spot" cx="${a.front[0]}" cy="${a.front[1]}" r="9"/>`);
  // Section mark: the elevation below is "view A" of the found bookcase.
  const [mx, my] = f.mark;
  out.push(`<g class="mark" aria-hidden="true"><circle cx="${mx}" cy="${my}" r="17"/><text x="${mx}" y="${my + 6}">A</text></g>`);
  out.push(`<g class="entry" aria-hidden="true"><path d="M610 782l-10-14h20z"/><text x="632" y="780">${esc(t.planDoor)}</text></g>`);
  out.push(`</svg>`);
  return out.join('');
}

// Deterministic spine widths, so a bookcase looks the same on every visit.
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const CLOTH = ['#3e6252', '#9c5a3c', '#3a4a6b', '#6b3a5f', '#7d5a2a', '#4a4a4a', '#5a6b3a', '#8a4452', '#2f5d63', '#6e5a48'];

export function renderDetail(book, lang, t) {
  const a = answer(book, lang, t);
  const f = furniture.find((x) => x.id === book.furniture);
  const rand = rng(f.id);
  const W = 460;
  const shelfH = 58;
  const left = 34;
  const H = f.shelves * shelfH + 16;
  const out = [];
  out.push(`<svg class="elevation" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${a.furniture}: ${a.title}, ${a.shelf}`)}">`);
  out.push(`<rect x="${left}" y="2" width="${W - left - 2}" height="${H - 4}" class="carcass" style="--wood:${f.color}"/>`);
  for (let s = 1; s <= f.shelves; s++) {
    const base = 8 + s * shelfH;
    let x = left + 12;
    let slot = 0;
    out.push(`<text x="${left - 12}" y="${base - 18}" class="shelf-no${s === book.shelf ? ' is-target' : ''}">${s}</text>`);
    while (x < W - 40) {
      slot += 1;
      const w = 14 + Math.floor(rand() * 12);
      const h = 34 + Math.floor(rand() * 16);
      const lean = slot % 11 === 0;
      const isTarget = s === book.shelf && slot === book.slot;
      const color = isTarget ? '' : CLOTH[Math.floor(rand() * CLOTH.length)];
      if (lean) {
        out.push(`<rect x="${x}" y="${base - h}" width="${w}" height="${h}" transform="rotate(-9 ${x + w} ${base})" class="spine" style="--cloth:${color}"/>`);
        x += w + 8;
        continue;
      }
      out.push(`<rect x="${x}" y="${base - h}" width="${isTarget ? 22 : w}" height="${h}" class="spine${isTarget ? ' is-target' : ''}"${isTarget ? '' : ` style="--cloth:${color}"`}/>`);
      if (isTarget) out.push(`<path class="pointer" d="M${x + 11} ${base - h - 18}v12"/>`);
      x += (isTarget ? 22 : w) + 2;
      if (rand() < 0.05) x += 22;
    }
    out.push(`<line x1="${left + 4}" y1="${base}" x2="${W - 6}" y2="${base}" class="board"/>`);
  }
  out.push(`</svg>`);
  return out.join('');
}
