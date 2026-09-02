CREATE TABLE IF NOT EXISTS `{{PROJECT_ID}}.{{DATASET_ID}}.custody_transfers` (
  id STRING NOT NULL,
  transfer_date DATE NOT NULL,
  ticker STRING NOT NULL,
  owner STRING,
  from_broker STRING NOT NULL,
  to_broker STRING NOT NULL,
  quantity NUMERIC NOT NULL,
  description STRING,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY transfer_date
CLUSTER BY ticker, owner;
