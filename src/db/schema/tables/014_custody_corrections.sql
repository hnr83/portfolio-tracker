CREATE TABLE IF NOT EXISTS `{{PROJECT_ID}}.{{DATASET_ID}}.custody_broker_aliases` (
  id STRING NOT NULL,
  raw_broker STRING NOT NULL,
  canonical_broker STRING NOT NULL,
  created_at TIMESTAMP NOT NULL
)
CLUSTER BY raw_broker;

CREATE TABLE IF NOT EXISTS `{{PROJECT_ID}}.{{DATASET_ID}}.custody_owner_assignments` (
  id STRING NOT NULL,
  ticker STRING NOT NULL,
  platform STRING NOT NULL,
  owner STRING NOT NULL,
  created_at TIMESTAMP NOT NULL
)
CLUSTER BY ticker, platform;
