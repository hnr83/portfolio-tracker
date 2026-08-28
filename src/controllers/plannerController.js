const crypto = require("crypto");
const bigquery = require("../config/bigQuery");
const { runQuery } = require("../services/bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const datasetId = process.env.BIGQUERY_DATASET_ID;

function toDateString(value) {
  const raw = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function unwrapDate(value) {
  return value?.value || value || null;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function buildMonthlyProjection({ scenarioDate, initialCapital, initialContributions, monthlyContribution, years, annualReturn }) {
  const points = [];
  const start = new Date(`${scenarioDate}T00:00:00Z`);
  const monthlyRate = Math.pow(1 + Number(annualReturn || 0) / 100, 1 / 12) - 1;
  let value = Number(initialCapital || 0);
  let contributions = Number(initialContributions ?? initialCapital ?? 0);
  let performanceFactor = 1;
  const months = Math.max(1, Math.round(Number(years || 0) * 12));

  for (let i = 0; i <= months; i += 1) {
    const pointDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    if (i === 0) pointDate.setUTCDate(start.getUTCDate());

    points.push({
      point_date: i === 0 ? scenarioDate : monthKey(pointDate),
      month_index: i,
      projected_value_usd: value,
      projected_contributions_usd: contributions,
      projected_performance_pct: (performanceFactor - 1) * 100,
    });

    value = value * (1 + monthlyRate) + Number(monthlyContribution || 0);
    contributions += Number(monthlyContribution || 0);
    performanceFactor *= 1 + monthlyRate;
  }

  return points;
}

async function ensurePlannerTables() {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS ${table("planner_scenarios")} (
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
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS ${table("planner_scenario_points")} (
      scenario_id STRING NOT NULL,
      point_date DATE NOT NULL,
      month_index INT64 NOT NULL,
      projected_value_usd FLOAT64 NOT NULL,
      projected_contributions_usd FLOAT64 NOT NULL,
      projected_performance_pct FLOAT64 NOT NULL
    )
  `);
}

async function getBaseline(scenarioDate) {
  const rows = await runQuery(`
    SELECT
      snapshot_date,
      CAST(investments_usd AS FLOAT64) AS real_value_usd,
      CAST(investments_cost_usd AS FLOAT64) AS real_contributions_usd
    FROM ${table("portfolio_snapshots")}
    WHERE snapshot_date <= @scenarioDate
    ORDER BY snapshot_date DESC
    LIMIT 1
  `, { scenarioDate });

  const row = rows[0];
  if (!row) return null;
  return {
    snapshotDate: unwrapDate(row.snapshot_date),
    realValueUsd: Number(row.real_value_usd || 0),
    realContributionsUsd: Number(row.real_contributions_usd || 0),
  };
}

async function listScenarios(req, res) {
  try {
    await ensurePlannerTables();
    const rows = await runQuery(`
      SELECT * FROM ${table("planner_scenarios")}
      ORDER BY scenario_date DESC, created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error listing planner scenarios:", error);
    res.status(500).json({ error: "Error fetching planner scenarios" });
  }
}

async function getScenario(req, res) {
  try {
    await ensurePlannerTables();
    const scenarios = await runQuery(`SELECT * FROM ${table("planner_scenarios")} WHERE id = @id LIMIT 1`, { id: req.params.id });
    if (!scenarios.length) return res.status(404).json({ error: "Scenario not found" });

    const points = await runQuery(`
      SELECT * FROM ${table("planner_scenario_points")}
      WHERE scenario_id = @id
      ORDER BY month_index ASC
    `, { id: req.params.id });

    res.json({ ...scenarios[0], points });
  } catch (error) {
    console.error("Error fetching planner scenario:", error);
    res.status(500).json({ error: "Error fetching planner scenario" });
  }
}

async function getScenarioComparison(req, res) {
  try {
    await ensurePlannerTables();

    const scenarios = await runQuery(`
      SELECT *
      FROM ${table("planner_scenarios")}
      WHERE id = @id
      LIMIT 1
    `, { id: req.params.id });

    if (!scenarios.length) {
      return res.status(404).json({ error: "Scenario not found" });
    }

    const scenario = scenarios[0];
    const scenarioDate = unwrapDate(scenario.scenario_date);
    const initialContributions = Number(scenario.initial_contributions_usd || 0);

    const [planPoints, realSnapshots, monthlyPerformance] = await Promise.all([
      runQuery(`
        SELECT
          point_date,
          month_index,
          CAST(projected_value_usd AS FLOAT64) AS projected_value_usd,
          CAST(projected_contributions_usd AS FLOAT64) AS projected_contributions_usd,
          CAST(projected_performance_pct AS FLOAT64) AS projected_performance_pct
        FROM ${table("planner_scenario_points")}
        WHERE scenario_id = @id
        ORDER BY month_index ASC
      `, { id: req.params.id }),
      runQuery(`
        SELECT
          snapshot_date,
          CAST(investments_usd AS FLOAT64) AS real_value_usd
        FROM ${table("portfolio_snapshots")}
        WHERE snapshot_date >= @scenarioDate
        ORDER BY snapshot_date ASC
      `, { scenarioDate }),
      runQuery(`
        SELECT
          month_date,
          start_date,
          end_date,
          CAST(net_asset_flow_usd AS FLOAT64) AS net_asset_flow_usd,
          CAST(adjusted_performance_pct AS FLOAT64) AS adjusted_performance_pct
        FROM ${table("vw_portfolio_calendar_month_performance_adjusted")}
        WHERE end_date >= @scenarioDate
        ORDER BY month_date ASC
      `, { scenarioDate }),
    ]);

    const snapshots = realSnapshots.map((row) => ({
      date: unwrapDate(row.snapshot_date),
      value: Number(row.real_value_usd || 0),
    }));

    const completePerformancePeriods = monthlyPerformance
      .map((row) => ({
        monthDate: unwrapDate(row.month_date),
        startDate: unwrapDate(row.start_date),
        endDate: unwrapDate(row.end_date),
        netFlow: Number(row.net_asset_flow_usd || 0),
        performancePct: Number(row.adjusted_performance_pct || 0),
      }))
      .filter((row) => row.startDate && row.startDate >= scenarioDate);

    function latestSnapshotOnOrBefore(date) {
      let match = null;
      for (const row of snapshots) {
        if (row.date <= date) match = row;
        else break;
      }
      return match;
    }

    function actualsThrough(date) {
      let contributions = 0;
      let twrFactor = 1;
      let hasCompletePeriod = false;

      for (const row of completePerformancePeriods) {
        if (row.endDate && row.endDate <= date) {
          contributions += row.netFlow;
          twrFactor *= 1 + row.performancePct / 100;
          hasCompletePeriod = true;
        }
      }

      return {
        real_contributions_usd: contributions,
        real_performance_pct: hasCompletePeriod ? (twrFactor - 1) * 100 : 0,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const series = planPoints.map((point) => {
      const date = unwrapDate(point.point_date);
      const snapshot = date <= today ? latestSnapshotOnOrBefore(date) : null;
      const actual = date <= today ? actualsThrough(date) : null;

      return {
        date,
        month_index: Number(point.month_index || 0),
        plan_value_usd: Number(point.projected_value_usd || 0),
        real_value_usd: snapshot?.value ?? null,
        plan_performance_pct: Number(point.projected_performance_pct || 0),
        real_performance_pct: actual?.real_performance_pct ?? null,
        plan_contributions_usd: Number(point.projected_contributions_usd || 0) - initialContributions,
        real_contributions_usd: actual?.real_contributions_usd ?? null,
      };
    });

    if (series.length) {
      series[0] = {
        ...series[0],
        real_value_usd: Number(scenario.baseline_real_value_usd ?? series[0].real_value_usd ?? 0),
        real_performance_pct: 0,
        real_contributions_usd: 0,
      };
    }

    const comparableRows = series.filter((row) => row.real_value_usd != null);
    const latest = comparableRows[comparableRows.length - 1] || series[0] || null;

    const summary = latest
      ? {
          as_of: latest.date,
          plan_value_usd: latest.plan_value_usd,
          real_value_usd: latest.real_value_usd,
          value_delta_usd:
            latest.real_value_usd == null ? null : latest.real_value_usd - latest.plan_value_usd,
          value_delta_pct:
            latest.real_value_usd == null || !latest.plan_value_usd
              ? null
              : ((latest.real_value_usd - latest.plan_value_usd) / latest.plan_value_usd) * 100,
          plan_performance_pct: latest.plan_performance_pct,
          real_performance_pct: latest.real_performance_pct,
          performance_delta_pp:
            latest.real_performance_pct == null
              ? null
              : latest.real_performance_pct - latest.plan_performance_pct,
          plan_contributions_usd: latest.plan_contributions_usd,
          real_contributions_usd: latest.real_contributions_usd,
          contributions_delta_usd:
            latest.real_contributions_usd == null
              ? null
              : latest.real_contributions_usd - latest.plan_contributions_usd,
          contributions_fulfillment_pct:
            latest.real_contributions_usd == null || !latest.plan_contributions_usd
              ? null
              : (latest.real_contributions_usd / latest.plan_contributions_usd) * 100,
        }
      : null;

    res.json({
      scenario: {
        id: scenario.id,
        name: scenario.name,
        scenario_date: scenarioDate,
        baseline_snapshot_date: unwrapDate(scenario.baseline_snapshot_date),
      },
      methodology: {
        portfolio_value: "portfolio_snapshots.investments_usd",
        performance: "Compounded adjusted monthly performance (TWR-style), rebased to 0% at scenario date",
        contributions: "Accumulated net_asset_flow_usd from complete adjusted monthly periods after scenario date",
        partial_first_month_included: false,
      },
      summary,
      series,
    });
  } catch (error) {
    console.error("Error comparing planner scenario:", error);
    res.status(500).json({ error: "Error comparing planner scenario" });
  }
}

async function createScenario(req, res) {
  try {
    await ensurePlannerTables();
    const {
      name,
      scenarioDate,
      description = "",
      initialCapital,
      initialContributions,
      monthlyContribution,
      years,
      fireGoal,
      annualReturn,
      assets = [],
    } = req.body || {};

    const validDate = toDateString(scenarioDate);
    if (!String(name || "").trim() || !validDate) {
      return res.status(400).json({ error: "Name and scenarioDate are required" });
    }

    const numericFields = [initialCapital, initialContributions, monthlyContribution, years, annualReturn];
    if (numericFields.some((value) => !Number.isFinite(Number(value)))) {
      return res.status(400).json({ error: "Invalid scenario numeric values" });
    }

    const id = crypto.randomUUID();
    const baseline = await getBaseline(validDate);
    const points = buildMonthlyProjection({
      scenarioDate: validDate,
      initialCapital: Number(initialCapital),
      initialContributions: Number(initialContributions),
      monthlyContribution: Number(monthlyContribution),
      years: Number(years),
      annualReturn: Number(annualReturn),
    });

    const scenarioRow = {
      id,
      name: String(name).trim(),
      scenario_date: validDate,
      description: String(description || "").trim(),
      created_at: new Date().toISOString(),
      initial_capital_usd: Number(initialCapital),
      initial_contributions_usd: Number(initialContributions),
      monthly_contribution_usd: Number(monthlyContribution),
      years: Math.round(Number(years)),
      fire_goal_usd: Number.isFinite(Number(fireGoal)) ? Number(fireGoal) : null,
      annual_return_pct: Number(annualReturn),
      assets_json: JSON.stringify(assets),
      baseline_snapshot_date: baseline?.snapshotDate || null,
      baseline_real_value_usd: baseline?.realValueUsd ?? null,
      baseline_real_contributions_usd: baseline?.realContributionsUsd ?? null,
    };

    await bigquery.dataset(datasetId).table("planner_scenarios").insert([scenarioRow]);
    await bigquery.dataset(datasetId).table("planner_scenario_points").insert(
      points.map((point) => ({ scenario_id: id, ...point }))
    );

    res.status(201).json({ ...scenarioRow, points });
  } catch (error) {
    console.error("Error creating planner scenario:", error);
    res.status(500).json({ error: "Error saving planner scenario" });
  }
}

async function deleteScenario(req, res) {
  try {
    await ensurePlannerTables();
    await runQuery(`DELETE FROM ${table("planner_scenario_points")} WHERE scenario_id = @id`, { id: req.params.id });
    await runQuery(`DELETE FROM ${table("planner_scenarios")} WHERE id = @id`, { id: req.params.id });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting planner scenario:", error);
    res.status(500).json({ error: "Error deleting planner scenario" });
  }
}

module.exports = {
  listScenarios,
  getScenario,
  getScenarioComparison,
  createScenario,
  deleteScenario,
};
