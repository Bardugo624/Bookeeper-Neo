import { Engine } from '@bookeeper/reader/engine';
import type { FrameLayout, Relocation } from '@bookeeper/reader/engine';

/** What `run.mjs` drives from the page: the engine of the real iframe, a layout, and book loading. */
const iframe = document.getElementById('frame') as HTMLIFrameElement;
const engine = new Engine(iframe);

function layout(fontSize: number): FrameLayout {
  return {
    colors: {
      page: '#fbfaf8',
      ink: '#27241f',
      link: '#3b6953',
      veils: { amber: '#e4cba4', sage: '#c9d2bf', terracotta: '#dcb8a7', night: '#bfc5d1' },
    },
    font: 'publisher',
    fontSize,
    lineHeight: 1.6,
    margins: 'medium',
    justify: true,
    hyphenate: true,
    publisherStyles: true,
    flow: 'paginated',
    twoPages: true,
    animated: false,
    pdfFit: 'width',
  };
}

async function load(name: string): Promise<File> {
  const res = await fetch(`/books/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return new File([await res.blob()], name, { type: 'application/epub+zip' });
}

/** The latest place the engine reported, and when. */
const state: { last: Relocation | null; lastAt: number } = { last: null, lastAt: 0 };
engine.on('relocate', (m) => {
  state.last = m.at;
  state.lastAt = performance.now();
});

(window as unknown as { bk: unknown }).bk = { engine, layout, load, state };
