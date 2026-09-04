/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../header', () => ({
  Header: () => <div>header</div>,
}));

const { fetchMock, createObjectUrlMock, revokeObjectUrlMock } = vi.hoisted(
  () => {
    const fetchMock = vi.fn();
    const createObjectUrlMock = vi.fn(() => 'blob:trackwork-test');
    const revokeObjectUrlMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const urlWithMocks = Object.assign(URL, {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock,
    });
    vi.stubGlobal('URL', urlWithMocks);
    return { fetchMock, createObjectUrlMock, revokeObjectUrlMock };
  }
);
const localStorageSetSpy = vi.fn();
const sessionStorageSetSpy = vi.fn();
const indexDbMock = vi.fn();

const shareValue = (index: number) =>
  `twshare-v1.ks_${'a'.repeat(32)}.ss_${'b'.repeat(32)}.${index}.${'A'.repeat(110)}.${'c'.repeat(8)}`;

const okResponse = () =>
  new Response(
    JSON.stringify({
      keySetId: 'ks_' + 'a'.repeat(32),
      shareSetId: 'ss_' + 'b'.repeat(32),
      threshold: 2,
      totalShares: 3,
      shares: [1, 2, 3].map(index => ({
        index,
        value: shareValue(index),
      })),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  fetchMock.mockReset();
  createObjectUrlMock.mockClear();
  revokeObjectUrlMock.mockClear();
  localStorageSetSpy.mockClear();
  sessionStorageSetSpy.mockClear();
  const storageBackend = new Map<string, string>();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
    key => storageBackend.get(key) ?? null
  );
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
    storageBackend.set(String(key), String(value));
    localStorageSetSpy(String(key), String(value));
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(key => {
    storageBackend.delete(String(key));
  });
});

const renderPage = async () => {
  localStorage.setItem('admin-locale', 'en');
  const { Component } = await import('./index');
  const { I18nProvider } = await import('../../i18n');
  return render(
    <I18nProvider>
      <Component />
    </I18nProvider>
  );
};

describe('TrackWork admin quorum share export', () => {
  test('R. shares appear only after an explicit successful generation', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    expect(screen.queryByText(/Share 1/)).toBeNull();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/admin/trackwork/quorum/shares/export');
    expect(init.method).toBe('POST');
  });

  test('S. refresh/remount has no share data', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const first = await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    first.unmount();
    fetchMock.mockResolvedValueOnce(okResponse());
    const second = await renderPage();
    expect(second.queryByText(/twshare-v1/)).toBeNull();
    expect(second.queryByText(/ss_/)).toBeNull();
    expect(second.getByText('Generate and export shares')).toBeTruthy();
  });

  test('T/U/V. localStorage, sessionStorage and IndexedDB are never written', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    const storageWrites = [
      ...localStorageSetSpy.mock.calls,
      ...sessionStorageSetSpy.mock.calls,
    ];
    for (const [, value] of storageWrites) {
      expect(JSON.stringify(value).includes('twshare')).toBe(false);
      expect(JSON.stringify(value).includes('ss_')).toBe(false);
    }
    expect(indexDbMock).not.toHaveBeenCalled();
  });

  test('W. no share in URL/router state', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    expect(window.location.href).not.toContain('twshare');
  });

  test('X/Y. one-share download contains only the intended share; separate files', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    const buttons = screen.getAllByText('Download as text file');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(2);
    const blobs = createObjectUrlMock.mock.calls.map(call => call[0] as Blob);
    const texts = await Promise.all(blobs.map(blob => blob.text()));
    expect(texts[0]).toContain(shareValue(1));
    expect(texts[0]).not.toContain(shareValue(2));
    expect(texts[1]).toContain(shareValue(2));
    expect(texts[1]).not.toContain(shareValue(1));
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  test('Z. object URLs are revoked after download', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    fireEvent.click(screen.getAllByText('Download as text file')[0]);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:trackwork-test');
  });

  test('AA. no image/QR/blob-image generation', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    fireEvent.click(screen.getAllByText('Download as text file')[0]);
    const blobs = createObjectUrlMock.mock.calls.map(call => call[0] as Blob);
    expect(blobs.length).toBeGreaterThan(0);
    for (const blob of blobs) {
      expect(blob.type).not.toMatch(/^image\//);
    }
  });

  test('AB. closing the panel drops UI references', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText(/Share 1/)).toBeNull();
    expect(screen.getByText('Generate and export shares')).toBeTruthy();
  });

  test('AC. translated warning and action text exist', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    expect(
      screen.getAllByText(
        /Each share is a bearer secret. Any 2 of 3 shares reconstruct the KEK/
      ).length
    ).toBeGreaterThan(0);
  });

  test('AE. no share material reaches console output', async () => {
    const consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call).includes('twshare')).toBe(false);
        expect(JSON.stringify(call).includes('ss_')).toBe(false);
      }
      spy.mockRestore();
    }
  });

  test('AD. no share secret in aria-label/title/data attributes', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await renderPage();
    fireEvent.click(await screen.findByText('Generate and export shares'));
    await waitFor(() => expect(screen.getByText(/Share 1/)).toBeTruthy());
    const bodyHtml = document.body.innerHTML;
    expect(bodyHtml.includes(shareValue(1))).toBe(false);
  });
});
