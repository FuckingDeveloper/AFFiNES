/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { I18nProvider } from '../../i18n';
import { ConfigRow } from './config-input-row';

describe('ConfigRow', () => {
  afterEach(() => {
    cleanup();
  });

  beforeAll(() => {
    if (!Element.prototype.hasPointerCapture) {
      Object.defineProperty(Element.prototype, 'hasPointerCapture', {
        value: () => false,
      });
    }
    if (!Element.prototype.setPointerCapture) {
      Object.defineProperty(Element.prototype, 'setPointerCapture', {
        value: () => {},
      });
    }
    if (!Element.prototype.releasePointerCapture) {
      Object.defineProperty(Element.prototype, 'releasePointerCapture', {
        value: () => {},
      });
    }
  });

  test('triggers onChange when enum option changes', () => {
    const handleChange = vi.fn();

    render(
      <I18nProvider>
        <ConfigRow
          field="storages/blob.storage/provider"
          desc="Storage provider"
          type="Enum"
          options={['fs', 'aws-s3', 'cloudflare-r2']}
          defaultValue="fs"
          onChange={handleChange}
        />
      </I18nProvider>
    );

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'aws-s3' }));

    expect(handleChange).toHaveBeenCalledWith(
      'storages/blob.storage/provider',
      'aws-s3'
    );
  });

  test('triggers onChange when json text becomes invalid', () => {
    const handleChange = vi.fn();

    render(
      <I18nProvider>
        <ConfigRow
          field="server/hosts"
          desc="Server hosts"
          type="JSON"
          defaultValue={[]}
          onChange={handleChange}
        />
      </I18nProvider>
    );

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '[]asdasdasd' },
    });

    expect(handleChange).toHaveBeenCalledWith('server/hosts', '[]asdasdasd');
  });

  test('shows json validation error and clears after input is fixed', () => {
    const handleChange = vi.fn();

    render(
      <I18nProvider>
        <ConfigRow
          field="server/hosts"
          desc="Server hosts"
          type="JSON"
          defaultValue={[]}
          onChange={handleChange}
        />
      </I18nProvider>
    );

    const textarea = screen.getByRole('textbox');

    fireEvent.change(textarea, {
      target: { value: '[]asdasdasd' },
    });

    expect(screen.queryByText('Неверный формат JSON')).not.toBeNull();
    expect(textarea.className).toContain('border-destructive');

    fireEvent.change(textarea, {
      target: { value: '["localhost"]' },
    });

    expect(screen.queryByText('Неверный формат JSON')).toBeNull();
    expect(textarea.className).not.toContain('border-destructive');
    expect(handleChange).toHaveBeenLastCalledWith('server/hosts', [
      'localhost',
    ]);
  });
});
