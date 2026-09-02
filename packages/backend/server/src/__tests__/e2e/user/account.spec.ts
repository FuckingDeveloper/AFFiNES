import {
  deleteAccountMutation,
  disableUserMutation,
  updateUserProfileMutation,
} from '@affine/graphql';

import { app, e2e, Mockers } from '../test';

const admin = await app.create(Mockers.User, {
  feature: 'administrator',
});

e2e('should not allow a user to delete their own account', async t => {
  await app.signup();
  await t.throwsAsync(
    app.gql({
      query: deleteAccountMutation,
    }),
    {
      message: 'You do not have permission to perform this action.',
    }
  );
});

e2e('should not allow a user to change their own display name', async t => {
  await app.signup();
  await t.throwsAsync(
    app.gql({
      query: updateUserProfileMutation,
      variables: { input: { name: 'Changed by user' } },
    }),
    {
      message: 'You do not have permission to perform this action.',
    }
  );
});

e2e('should ban account', async t => {
  const user = await app.create(Mockers.User);

  await app.login(admin);

  const { banUser } = await app.gql({
    query: disableUserMutation,
    variables: {
      id: user.id,
    },
  });

  t.is(banUser.disabled, true);
});

e2e('should not login banned account', async t => {
  const user = await app.create(Mockers.User);

  await app.login(admin);

  await app.gql({
    query: disableUserMutation,
    variables: {
      id: user.id,
    },
  });
  await app.logout();

  const res = await app.login(user);
  t.is(res.status, 400);
  t.like(res.body, {
    message: `Wrong user email or password: ${user.email}`,
  });
});

e2e('should not signup banned account', async t => {
  const user = await app.create(Mockers.User);

  await app.login(admin);

  await app.gql({
    query: disableUserMutation,
    variables: {
      id: user.id,
    },
  });

  const res = await app.POST('/api/auth/sign-in').send({
    email: user.email,
  });

  t.is(res.status, 400);
  t.like(res.body, {
    message: `Wrong user email or password: ${user.email}`,
  });
});
