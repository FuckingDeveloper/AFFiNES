import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.TRACKWORK_PREBUILT_NATIVE === '1') {
  if (!existsSync(new URL('../server-native.node', import.meta.url))) {
    throw new Error(
      'TRACKWORK_PREBUILT_NATIVE is set but server-native.node is missing'
    );
  }
  console.log('Using prebuilt TrackWork server native module');
} else {
  const executable = process.platform === 'win32' ? 'napi.cmd' : 'napi';
  execFileSync(
    executable,
    ['build', '--release', '--strip', '--no-const-enum'],
    { stdio: 'inherit' }
  );
}
