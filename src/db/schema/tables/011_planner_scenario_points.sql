CREATE TABLE IF NOT EXISTS `{{PROJECT_ID}}.{{DATASET_ID}}.planner_scenario_points` (
  scenario_id STRING NOT NULL,
  point_date DATE NOT NULL,
  month_index INT64 NOT NULL,
  projected_value_usd FLOAT64 NOT NULL,
  projected_contributions_usd FLOAT64 NOT NULL,
  projected_performance_pct FLOAT64 NOT NULL
);
