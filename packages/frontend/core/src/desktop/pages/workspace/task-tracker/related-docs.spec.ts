import { describe, expect, it } from 'vitest';

import { parseRelatedDocs, stringifyRelatedDocs } from './config';

describe('related docs storage', () => {
  it('round-trips document ids', () => {
    const ids = ['doc-1', 'doc-2'];
    expect(parseRelatedDocs(stringifyRelatedDocs(ids))).toEqual(ids);
  });

  it('deduplicates ids', () => {
    expect(parseRelatedDocs(stringifyRelatedDocs(['doc-1', 'doc-1']))).toEqual([
      'doc-1',
    ]);
  });

  it('returns an empty array for missing values', () => {
    expect(parseRelatedDocs(undefined)).toEqual([]);
    expect(parseRelatedDocs('')).toEqual([]);
  });

  it('ignores malformed values', () => {
    expect(parseRelatedDocs('not-json')).toEqual([]);
    expect(parseRelatedDocs('{"a":1}')).toEqual([]);
    expect(parseRelatedDocs('[1, "doc-1"]')).toEqual(['doc-1']);
  });
});
