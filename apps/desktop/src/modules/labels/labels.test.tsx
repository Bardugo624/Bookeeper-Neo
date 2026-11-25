import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RawResponse } from '@bookeeper/api';
import { AppProviders } from '../../app/AppProviders';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { useSession } from '../../session';
import { ME, ok } from '../../session/fixtures';
import { LabelsDialog } from './index';
import { MAX_BOOKS, labelsFileName } from './labelsModel';

const PDF = new Uint8Array([37, 80, 68, 70]);
let platform: FakePlatform;
let raws: Array<{ method: string; path: string; body?: Uint8Array }>;

function setup(ids: string[], answer: () => RawResponse = () => ({ status: 200, bytes: PDF, contentType: 'application/pdf', headers: {} })) {
  raws = [];
  platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => (r.path.endsWith('/me') ? ok(ME) : { status: 404, body: { error_code: 'not_found', message: 'x' } }),
  });
  const base = platform.transport.bind(platform);
  platform.transport = (id) => ({
    ...base(id),
    async requestRaw(req) {
      raws.push({ method: req.method, path: req.path, body: req.body });
      return answer();
    },
  });
  useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
  let closed = 0;
  render(
    <AppProviders platform={platform} locale="it">
      <LabelsDialog bookIds={ids} open onClose={() => closed++} />
    </AppProviders>,
  );
  return { closed: () => closed };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `b${i}`);
beforeEach(() => localStorage.clear());

describe('LabelsDialog', () => {
  it('sends the ids, saves the PDF and closes', async () => {
    const h = setup(ids(3));
    expect(await screen.findByText('3 libri')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crea il PDF' }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    expect(JSON.parse(new TextDecoder().decode(raws[0]!.body))).toEqual({ book_ids: ['b0', 'b1', 'b2'] });
    expect(raws[0]!.path).toBe('/api/v1/labels/pdf');
    expect(platform.saved[0]).toMatchObject({ suggestedName: labelsFileName(new Date()), mime: 'application/pdf' });
    expect(platform.saved[0]!.suggestedName).toMatch(/^etichette-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(Array.from(platform.saved[0]!.bytes)).toEqual(Array.from(PDF));
    await waitFor(() => expect(h.closed()).toBe(1));
  });

  it('tells how many books were skipped', async () => {
    setup(ids(3), () => ({ status: 200, bytes: PDF, contentType: 'application/pdf', headers: { 'x-labels-skipped': '2' } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Crea il PDF' }));
    expect(await screen.findByText(/2 libri saltati/)).toBeInTheDocument();
  });

  it('sends nothing over the limit', async () => {
    setup(ids(MAX_BOOKS + 1));
    expect(await screen.findByText(/Troppi libri/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crea il PDF' })).toBeDisabled();
    expect(raws).toHaveLength(0);
  });

  it('keeps the dialog open when the save window is cancelled', async () => {
    const h = setup(ids(1));
    platform.setSaveResult({ saved: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Crea il PDF' }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    expect(h.closed()).toBe(0);
  });
});

describe('sheet preview', () => {
  it('highlights as many boxes as books, from the first box', async () => {
    setup(ids(5));
    const sheet = await screen.findByRole('img', { name: /5 caselle su 44/ });
    const boxes = within(sheet).getAllByTestId('label-box');
    expect(boxes).toHaveLength(44);
    expect(boxes.map((b) => b.dataset.used)).toEqual(boxes.map((_, i) => (i < 5 ? 'true' : 'false')));
  });

  it('fills the whole first sheet when there are more books than boxes', async () => {
    setup(ids(50));
    const sheet = await screen.findByRole('img', { name: /44 caselle su 44/ });
    expect(within(sheet).getAllByTestId('label-box').filter((b) => b.dataset.used === 'true')).toHaveLength(44);
    expect(screen.getByText('2 fogli')).toBeInTheDocument();
  });
});
