import { fileURLToPath } from 'node:url';

const newE2E = process.env.TEST_MODE === 'e2e';
const newE2ETests = './src/__tests__/e2e/**/*.spec.ts';

const fromConfig = path => fileURLToPath(new URL(path, import.meta.url));
const preludes = [fromConfig('./src/prelude.ts')];
const tsRuntimeRegister = fromConfig('../../../tools/cli/register.js');

if (newE2E) {
  preludes.push(fromConfig('./src/__tests__/e2e/prelude.ts'));
}

export default {
  timeout: '1m',
  extensions: {
    ts: 'module',
  },
  nodeArguments: [`--import=${tsRuntimeRegister}`],
  watchMode: {
    ignoreChanges: ['**/*.gen.*'],
  },
  files: newE2E
    ? [newE2ETests]
    : ['**/*.spec.ts', '**/*.e2e.ts', '!' + newE2ETests],
  require: preludes,
  environmentVariables: {
    NODE_ENV: 'test',
    DEPLOYMENT_TYPE: 'affine',
    MAILER_HOST: '0.0.0.0',
    MAILER_PORT: '1025',
    MAILER_USER: 'noreply@toeverything.info',
    MAILER_PASSWORD: 'affine',
    MAILER_SENDER: 'noreply@toeverything.info',
  },
};
