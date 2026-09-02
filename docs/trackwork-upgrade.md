# TrackWork self-hosted upgrade compatibility

This document defines the supported upgrade path for self-hosted TrackWork
deployments and the compatibility policy that release verification is held
to.

## Current release status

TrackWork has **no formally supported previous release yet**. The repository
has no release tags, and no self-hosted TrackWork release has shipped under a
versioned upgrade policy (see `git tag`; server version is the package
version exposed by `GET /info` as `env.version`).

The first release governed by this policy becomes the **baseline release**.
All releases after it must upgrade from the immediately previous supported
release.

Existing pre-policy TrackWork data (workspace Task Tracker configurations,
task registry rows, task/document links, and development integration
associations) is still covered by migration compatibility tests in CI; the
absence of a formal previous release does not exempt existing data from the
upgrade guarantees below.

## Supported upgrade path

- Upgrades are supported **only from the immediately previous supported
  release** to the current release.
- **Skipping releases is not supported** unless a future policy explicitly
  changes that.
- Before the first policy-governed baseline release exists, CI runs the
  pre-policy compatibility rehearsal: the current production image is
  started against a database seeded with the documented pre-policy fixture,
  and the production migration/startup path plus data integrity are
  verified. This rehearsal does not constitute a release-to-release
  upgrade (see "Future N-1 -> N verification").
- Once a baseline release exists, CI verifies exactly one supported
  transition: previous supported release -> current release.
- Upgrades are one-directional. Rollback is not automatic and never
  supported through migrations (see rollback below).

## Versioning and image identity

- The application version is the repository package version (for example
  `0.26.3`), exposed by the server at `GET /info` (`version` and `message`
  fields).
- Self-hosted images follow the repository Docker conventions
  (`.github/deployment/node/Dockerfile`, image tag per release).
- The upgrade smoke test in CI always verifies the **current** production
  image against a database containing representative persisted data from the
  previous supported baseline (or, before the first baseline release, the
  documented pre-policy compatibility fixture in
  `scripts/docker-smoke/fixture-upgrade.sql`).

## Runtime dependency expectations

The supported runtime stack is defined by the self-hosted compose file
`.docker/selfhost/compose.yml`:

- PostgreSQL: `pgvector/pgvector:pg16`
- Redis: `redis:7.4`

Upgrades assume the database was created by the previously supported release
with the same PostgreSQL major version. Backing up and restoring across
PostgreSQL major versions is out of scope for this policy.

## Migration behavior

Migrations run **before** the application starts, through the dedicated
`affine_migration` service in the self-hosted compose stack
(`scripts/self-host-predeploy.js`):

1. `prisma migrate deploy` applies schema migrations.
2. A pgvector repair step runs for embedding tables.
3. `node ./dist/main.js run` runs registered data migrations.

The application container starts only after the migration service has
completed successfully (`depends_on: affine_migration:
condition: service_completed_successfully`).

TrackWork schema migrations are additive at the table level and do not
rewrite existing rows. Data migrations, where present, run in the same
startup path. Task registry rows, task/document links, and development
integration associations are preserved as-is across migrations.

## Backup requirement

A database backup is **required before every upgrade**. TrackWork does not
provide automated backup; operators must back up the PostgreSQL database
(and the persistent storage/upload volume) before starting an upgrade.

## Rollback limitations

Migrations are forward-only. If an upgrade fails, the supported recovery
procedure is:

1. Stop the stack.
2. Restore the pre-upgrade database backup.
3. Start the previously supported release image against the restored
   database.

Downgrading the schema by running a newer image against an older database is
not supported.

## Failure behavior

- If `prisma migrate deploy` or a data migration fails, the migration
  service exits non-zero, the application never starts, and readiness never
  reports healthy.
- Operators must restore the pre-upgrade backup and report the failed
  migration (the migration service logs identify the failing migration).
- The migration service retries on transient failures
  (`restart: on-failure:3`); persistent failures are not masked.

## What "previous supported version" means

The immediately preceding release that:

- shipped under this upgrade policy,
- passed the production image clean-install smoke test, and
- passed the production image upgrade smoke test from the release before it.

Before the first baseline release exists, the upgrade smoke test uses the
documented pre-policy compatibility fixture instead of an actual previous
image.

## Future N-1 -> N verification

Once the first policy-governed baseline release exists, the upgrade smoke
for each following release must exercise a real release-to-release
transition instead of the pre-policy fixture:

1. retain a previous supported release artifact: the previous release's
   production image and/or a reproducible persisted database snapshot
   produced by that release;
2. start/restore the previous release against an empty supported database;
3. let it create representative TrackWork persisted data through its normal
   operations;
4. stop the previous release, preserving the PostgreSQL/storage volumes;
5. start the current release image against the same persisted data;
6. run the normal `affine_migration` production path;
7. wait for readiness;
8. run the existing integrity assertions for keys/numbers/links/
   associations and GraphQL reads.

The pre-policy rehearsal is kept until a baseline release exists; it is not
a substitute for this verification.
