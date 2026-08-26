/**
 * TrackWork stable task keys.
 *
 * A task key looks like `TW-142` (or `TASK-3`, any `PREFIX-N` shape):
 * - the prefix is the workspace task key (configurable per workspace);
 * - the number is a workspace-scoped sequential number that is immutable
 *   after creation;
 * - keys are matched case-insensitively everywhere outside the UI.
 */

const TRACKWORK_TASK_KEY_RE =
  /(?<![A-Z0-9])([A-Z][A-Z0-9]{1,15}-\d+)(?![A-Z0-9])/gi;

export const TRACKWORK_TASK_KEY_PATTERN = TRACKWORK_TASK_KEY_RE.source;

/**
 * Extract normalized task keys referenced in arbitrary text (commit
 * messages, branch names, MR titles, pipeline metadata, ...).
 *
 * Returns unique, uppercased keys, e.g. `['TW-142', 'TW-151']`.
 */
export const extractTrackWorkKeys = (input: string): string[] => {
  if (!input) {
    return [];
  }

  const result = new Set<string>();

  for (const match of input.matchAll(TRACKWORK_TASK_KEY_RE)) {
    const key = match[1];
    if (key) {
      result.add(key.toUpperCase());
    }
  }

  return [...result];
};

export const normalizeTaskKey = (key: string): string =>
  key.trim().toUpperCase();

/**
 * `TW-142` from `('TW', 142)`.
 */
export const formatTaskKey = (prefix: string, number: number): string =>
  `${prefix}-${number}`;

/**
 * Parse the numeric part of a stored task number.
 *
 * Accepts both the legacy persisted form (`TASK-3`) and the normalized
 * numeric form (`3`). Returns `0` for missing/unparseable values.
 */
export const parseTaskNumber = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }

  const trimmed = value.trim();
  const dash = trimmed.lastIndexOf('-');
  const candidate =
    dash >= 0 && dash < trimmed.length - 1 ? trimmed.slice(dash + 1) : trimmed;
  const parsed = Number(candidate);

  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Split a normalized task key into its prefix and number parts.
 * Returns `null` when the input is not a valid task key.
 */
export const parseTaskKey = (
  key: string
): { prefix: string; number: number } | null => {
  const match = new RegExp(TRACKWORK_TASK_KEY_PATTERN, 'i').exec(
    normalizeTaskKey(key)
  );

  if (!match) {
    return null;
  }

  const full = match[1];
  if (!full) {
    return null;
  }
  const dash = full.lastIndexOf('-');

  return {
    prefix: full.slice(0, dash),
    number: Number(full.slice(dash + 1)),
  };
};

/**
 * Compute the next free task number for a workspace given the currently
 * known stored task numbers.
 *
 * The task store is document-based (no database sequence is available), so
 * callers must pair this with a deterministic duplicate-repair pass to stay
 * consistent under concurrent creation.
 */
export const nextTaskNumber = (numbers: Array<string | undefined>): number =>
  Math.max(0, ...numbers.map(parseTaskNumber)) + 1;
