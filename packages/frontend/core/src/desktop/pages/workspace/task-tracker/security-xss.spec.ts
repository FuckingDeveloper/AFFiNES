import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('TrackWork XSS surface', () => {
  const dir = __dirname;
  const files = globSync('**/*.{ts,tsx}', { cwd: dir }).filter(
    file => !file.endsWith('security-xss.spec.ts')
  );

  it('renders user-authored content without raw HTML sinks', () => {
    const sinks = files.filter(file => {
      const src = readFileSync(path.join(dir, file), 'utf8');
      return (
        src.includes('dangerouslySetInnerHTML') ||
        /\.innerHTML\s*=/.test(src) ||
        /insertAdjacentHTML\(/.test(src) ||
        /document\.write\(/.test(src)
      );
    });
    expect(sinks).toEqual([]);
  });

  it('does not build href/src from task data into raw strings', () => {
    const hrefSinks = files.filter(file => {
      const src = readFileSync(path.join(dir, file), 'utf8');
      return /href=\{?["'`]?javascript:/i.test(src);
    });
    expect(hrefSinks).toEqual([]);
  });

  it('keeps helpers free of raw HTML sink usage', () => {
    const configSrc = readFileSync(path.join(dir, 'config.ts'), 'utf8');
    expect(configSrc.includes('dangerouslySetInnerHTML')).toBe(false);
    expect(configSrc).not.toMatch(/\.innerHTML\s*=/);
  });
});