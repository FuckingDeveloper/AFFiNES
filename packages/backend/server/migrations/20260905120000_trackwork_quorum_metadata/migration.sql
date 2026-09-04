-- OpenSpec 3.8: installation-global safe quorum metadata singleton.
-- PK(id) + CHECK(id='current') make the singleton DB-enforced.
-- Fixed policy/version CHECKs: current product contract is exactly 2-of-3,
-- metadataVersion 1; revision >= 1. No seed row; no secret material.

CREATE TABLE "trackwork_quorum_metadata" (
  "id" VARCHAR NOT NULL,
  "key_set_id" VARCHAR NOT NULL,
  "share_set_id" VARCHAR NOT NULL,
  "threshold" INTEGER NOT NULL,
  "total_shares" INTEGER NOT NULL,
  "key_check" TEXT NOT NULL,
  "metadata_version" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "trackwork_quorum_metadata_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trackwork_quorum_metadata_id_check" CHECK ("id" = 'current'),
  CONSTRAINT "trackwork_quorum_metadata_threshold_check" CHECK ("threshold" = 2),
  CONSTRAINT "trackwork_quorum_metadata_total_shares_check" CHECK ("total_shares" = 3),
  CONSTRAINT "trackwork_quorum_metadata_metadata_version_check" CHECK ("metadata_version" = 1),
  CONSTRAINT "trackwork_quorum_metadata_revision_check" CHECK ("revision" >= 1)
);
