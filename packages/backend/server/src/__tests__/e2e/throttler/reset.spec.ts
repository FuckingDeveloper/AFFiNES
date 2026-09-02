import { ConfigModule } from '../../../base/config';
import { createApp, e2e, Mockers } from '../test';

const STRICT_TTL = 500;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

e2e('rate limit reset is race-safe and deterministic', async t => {
  const app = await createApp({
    imports: [
      ConfigModule.override({
        throttle: {
          throttlers: {
            strict: { ttl: STRICT_TTL, limit: 3 },
          },
        },
      }),
    ],
  });
  t.teardown(() => app.close());

  const user = await app.create(Mockers.User);
  const attempt = () =>
    app
      .POST('/api/auth/sign-in')
      .send({ email: user.email, password: 'wrong-password' });

  const statuses = async (count: number) => {
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push((await attempt()).status);
    }
    return results;
  };

  const assertAllowed = async (count: number) => {
    const results = await statuses(count);
    t.deepEqual(
      results.map(status => (status === 429 ? 'blocked' : 'allowed')),
      Array.from({ length: count }, () => 'allowed')
    );
  };

  await assertAllowed(3);
  t.is((await attempt()).status, 429);

  app.resetRateLimit();
  await assertAllowed(1);

  // Wait out the ttl window plus margin so the post-reset timer fires while
  // the process keeps serving: this is the window in which the previous
  // implementation crashed after storage.clear() left its timers orphaned.
  await sleep(STRICT_TTL + 500);

  await assertAllowed(1);
  await assertAllowed(2);
  t.is((await attempt()).status, 429);
});
