import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import test from 'ava';

import { DocRendererController } from '../../core/doc-renderer/controller';
import { Namespace, NodeEnv } from '../../env';

test.serial('production server does not require mobile assets', t => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'trackwork-renderer-'));
  const staticRoot = join(fixtureRoot, 'static');
  const previousProjectRoot = env.projectRoot;
  const previousNodeEnv = env.NODE_ENV;
  const previousNamespace = env.NAMESPACE;

  try {
    mkdirSync(staticRoot, { recursive: true });
    writeFileSync(
      join(staticRoot, 'assets-manifest.json'),
      JSON.stringify({
        js: ['main.js'],
        css: [],
        publicPath: 'https://app.affine.pro/',
        gitHash: '',
        description: '',
      })
    );

    // @ts-expect-error test override
    env.projectRoot = fixtureRoot;
    // @ts-expect-error test override
    env.NODE_ENV = NodeEnv.Production;
    // @ts-expect-error test override
    env.NAMESPACE = Namespace.Production;

    const controller = new DocRendererController(
      {} as any,
      {} as any,
      { server: { path: '' } } as any,
      {} as any
    );

    const webAssets = (controller as any).webAssets;
    const mobileAssets = (controller as any).mobileAssets;
    t.is(mobileAssets, webAssets);
    t.deepEqual(webAssets.js, ['https://app.affine.pro/main.js']);
  } finally {
    // @ts-expect-error test override
    env.projectRoot = previousProjectRoot;
    // @ts-expect-error test override
    env.NODE_ENV = previousNodeEnv;
    // @ts-expect-error test override
    env.NAMESPACE = previousNamespace;
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
