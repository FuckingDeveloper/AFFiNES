import { describe, expect, it } from 'vitest';

import {
  extractTrackWorkKeys,
  formatTaskKey,
  nextTaskNumber,
  normalizeTaskKey,
  parseTaskKey,
  parseTaskNumber,
} from './task-key';

describe('extractTrackWorkKeys', () => {
  it('extracts a normal task key', () => {
    expect(extractTrackWorkKeys('fix(auth): TW-142 refresh token')).toEqual([
      'TW-142',
    ]);
  });

  it('extracts keys wrapped in brackets and parens', () => {
    expect(extractTrackWorkKeys('[TW-142] (TW-151)')).toEqual([
      'TW-142',
      'TW-151',
    ]);
  });

  it('extracts keys from branch names', () => {
    expect(extractTrackWorkKeys('feature/TW-142-refresh-token')).toEqual([
      'TW-142',
    ]);
  });

  it('extracts keys from MR titles', () => {
    expect(extractTrackWorkKeys('!318 Fix refresh token [TW-142]')).toEqual([
      'TW-142',
    ]);
  });

  it('normalizes case', () => {
    expect(extractTrackWorkKeys('feature/tw-142-refresh')).toEqual(['TW-142']);
    expect(extractTrackWorkKeys('fix: Tw-142 refresh')).toEqual(['TW-142']);
  });

  it('extracts multiple keys', () => {
    expect(extractTrackWorkKeys('TW-142 relates to TW-151')).toEqual([
      'TW-142',
      'TW-151',
    ]);
  });

  it('deduplicates keys', () => {
    expect(extractTrackWorkKeys('TW-142 [TW-142]')).toEqual(['TW-142']);
  });

  it('ignores invalid references', () => {
    expect(extractTrackWorkKeys('just a commit message')).toEqual([]);
    expect(extractTrackWorkKeys('TW-')).toEqual([]);
    expect(extractTrackWorkKeys('142')).toEqual([]);
    expect(extractTrackWorkKeys('')).toEqual([]);
    expect(extractTrackWorkKeys('TW142')).toEqual([]);
    expect(extractTrackWorkKeys('ABC-1X')).toEqual([]);
  });

  it('does not match inside longer alphanumeric tokens', () => {
    expect(extractTrackWorkKeys('XTW-142Y')).toEqual([]);
    expect(extractTrackWorkKeys('A_TW-142')).toEqual(['TW-142']);
  });
});

describe('formatTaskKey', () => {
  it('formats prefix and number', () => {
    expect(formatTaskKey('TW', 142)).toBe('TW-142');
    expect(formatTaskKey('TASK', 1)).toBe('TASK-1');
  });
});

describe('parseTaskNumber', () => {
  it('parses the numeric part of a stored legacy key', () => {
    expect(parseTaskNumber('TASK-3')).toBe(3);
    expect(parseTaskNumber('TW-142')).toBe(142);
  });

  it('parses normalized numeric storage', () => {
    expect(parseTaskNumber('3')).toBe(3);
    expect(parseTaskNumber('142')).toBe(142);
  });

  it('returns 0 for missing or unparseable values', () => {
    expect(parseTaskNumber(undefined)).toBe(0);
    expect(parseTaskNumber('')).toBe(0);
    expect(parseTaskNumber('abc')).toBe(0);
    expect(parseTaskNumber('TW-')).toBe(0);
  });
});

describe('parseTaskKey', () => {
  it('splits a normalized key', () => {
    expect(parseTaskKey('TW-142')).toEqual({ prefix: 'TW', number: 142 });
    expect(parseTaskKey('tw-142')).toEqual({ prefix: 'TW', number: 142 });
  });

  it('returns null for invalid keys', () => {
    expect(parseTaskKey('nope')).toBeNull();
    expect(parseTaskKey('TW-')).toBeNull();
  });
});

describe('normalizeTaskKey', () => {
  it('trims and uppercases', () => {
    expect(normalizeTaskKey('  tw-142 ')).toBe('TW-142');
  });
});

describe('nextTaskNumber', () => {
  it('returns 1 for an empty workspace', () => {
    expect(nextTaskNumber([])).toBe(1);
    expect(nextTaskNumber([undefined])).toBe(1);
  });

  it('increments past the maximum stored number', () => {
    expect(nextTaskNumber(['TASK-1', 'TASK-3', 'TW-142'])).toBe(143);
  });

  it('handles normalized numeric storage', () => {
    expect(nextTaskNumber(['1', '2', '3'])).toBe(4);
  });

  it('ignores unparseable values', () => {
    expect(nextTaskNumber(['abc', 'TASK-5', undefined])).toBe(6);
  });
});
