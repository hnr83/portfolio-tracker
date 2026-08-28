CREATE TABLE IF NOT EXISTS `{{PROJECT_ID}}.{{DATASET_ID}}.planner_scenarios` (
  id STRING NOT NULL,
  name STRING NOT NULL,
  scenario_date DATE NOT NULL,
  description STRING,
  created_at TIMESTAMP NOT NULL,
  initial_capital_usd FLOAT64 NOT NULL,
  initial_contributions_usd FLOAT64 NOT NULL,
  monthly_contribution_usd FLOAT64 NOT NULL,
  years INT64 NOT NULL,
  fire_goal_usd FLOAT64,
  annual_return_pct FLOAT64 NOT NULL,
  assets_json STRING NOT NULL,
  baseline_snapshot_date DATE,
  baseline_real_value_usd FLOAT64,
  baseline_real_contributions_usd FLOAT64
);
