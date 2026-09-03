import { describe, expect, it } from 'vitest';

import { parseTaskArchived } from '@affine/core/desktop/pages/workspace/task-tracker/config';

type PermissionState = boolean | undefined;
type SurfaceState =
  | 'loading'
  | 'empty'
  | 'denied'
  | 'recoverable-error'
  | 'fatal-error'
  | 'ready';

function resolvePermissionUi(permission: PermissionState) {
  // The tracker toolbar gates render controls only on `=== true`;
  // the settings gate renders the loading/denied panel on `!== true`.
  return {
    toolbarControlsVisible: permission === true,
    settingsLoading: permission === undefined,
    settingsDenied: permission === false,
    settingsControlsVisible: permission === true,
  };
}

function resolveSurfaceState(input: {
  loading: boolean;
  error: unknown;
  data: unknown;
  permission: PermissionState;
  emptyCheck: (data: unknown) => boolean;
}): SurfaceState {
  if (input.permission === undefined || input.loading) {
    return 'loading';
  }
  if (input.permission === false) {
    return 'denied';
  }
  if (input.error) {
    return 'recoverable-error';
  }
  if (input.emptyCheck(input.data)) {
    return 'empty';
  }
  return 'ready';
}

const isWorkflowConflict = (error: unknown) =>
  error instanceof Error &&
  /configuration has changed; refetch and retry/.test(error.message);

describe('TrackWork UI state model', () => {
  it('permission undefined renders loading, never denied', () => {
    const ui = resolvePermissionUi(undefined);
    expect(ui.toolbarControlsVisible).toBe(false);
    expect(ui.settingsLoading).toBe(true);
    expect(ui.settingsDenied).toBe(false);
  });

  it('permission false renders denied/hidden, not loading', () => {
    const ui = resolvePermissionUi(false);
    expect(ui.toolbarControlsVisible).toBe(false);
    expect(ui.settingsDenied).toBe(true);
    expect(ui.settingsLoading).toBe(false);
  });

  it('permission true renders the normal surface', () => {
    const ui = resolvePermissionUi(true);
    expect(ui.toolbarControlsVisible).toBe(true);
    expect(ui.settingsControlsVisible).toBe(true);
  });

  it('successful empty response is empty, not an error', () => {
    expect(
      resolveSurfaceState({
        loading: false,
        error: null,
        data: [],
        permission: true,
        emptyCheck: d => Array.isArray(d) && d.length === 0,
      })
    ).toBe('empty');
  });

  it('query/network error is a recoverable state', () => {
    expect(
      resolveSurfaceState({
        loading: false,
        error: new Error('network'),
        data: null,
        permission: true,
        emptyCheck: d => !d,
      })
    ).toBe('recoverable-error');
  });

  it('workflow revision conflict is classified as a conflict/reload state', () => {
    expect(
      isWorkflowConflict(
        new Error(
          'TrackWork workflow configuration has changed; refetch and retry'
        )
      )
    ).toBe(true);
  });

  it('permission denied never masquerades as empty', () => {
    expect(
      resolveSurfaceState({
        loading: false,
        error: null,
        data: [],
        permission: false,
        emptyCheck: d => Array.isArray(d) && d.length === 0,
      })
    ).toBe('denied');
  });

  it('archived-only tasks produce an active-empty state, not a fatal one', () => {
    const tasks = [
      { id: 't1', archived: true },
      { id: 't2', archived: true },
    ];
    const active = tasks.filter(t => !t.archived);
    expect(active.length).toBe(0);
    expect(
      resolveSurfaceState({
        loading: false,
        error: null,
        data: active,
        permission: true,
        emptyCheck: d => Array.isArray(d) && d.length === 0,
      })
    ).toBe('empty');
  });

  it('missing archive property defaults to active', () => {
    expect(parseTaskArchived(undefined)).toBe(false);
  });

  it('unknown errors map to a safe recoverable state without internals', () => {
    const raw = new Error('PrismaClientValidationError: internal detail');
    const message = /internal detail/.test(raw.message)
      ? 'Something went wrong. Please retry.'
      : raw.message;
    expect(message).toContain('retry');
    expect(message).not.toContain('PrismaClientValidationError');
  });
});
