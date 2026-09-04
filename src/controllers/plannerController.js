const crypto = require("crypto");
const bigquery = require("../config/bigQuery");
const { runQuery } = require("../services/bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const datasetId = process.env.BIGQUERY_DATASET_ID;

function toDateString(value) { const raw = String(value || ""); return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null; }
function unwrapDate(value) { return value?.value || value || null; }
function monthKey(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function buenosAiresDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function utcDate(value) { return new Date(`${value}T00:00:00Z`); }
function addUtcDays(date, days) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
function dateDiffDays(from, to) { return Math.round((utcDate(to) - utcDate(from)) / 86400000); }
function isMonthlyAnniversary(date, scenarioDate) {
  const start = utcDate(scenarioDate); const current = utcDate(date);
  if (current <= start) return false;
  const targetDay = start.getUTCDate();
  const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
  return current.getUTCDate() === Math.min(targetDay, lastDay);
}

function buildMonthlyProjection({ scenarioDate, initialCapital, initialContributions, monthlyContribution, years, annualReturn }) {
  const points = []; const start = new Date(`${scenarioDate}T00:00:00Z`);
  const monthlyRate = Math.pow(1 + Number(annualReturn || 0) / 100, 1 / 12) - 1;
  let value = Number(initialCapital || 0); let contributions = Number(initialContributions ?? initialCapital ?? 0); let performanceFactor = 1;
  const months = Math.max(1, Math.round(Number(years || 0) * 12));
  for (let i = 0; i <= months; i += 1) {
    const pointDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)); if (i === 0) pointDate.setUTCDate(start.getUTCDate());
    points.push({ point_date: i === 0 ? scenarioDate : monthKey(pointDate), month_index: i, projected_value_usd: value, projected_contributions_usd: contributions, projected_performance_pct: (performanceFactor - 1) * 100 });
    value = value * (1 + monthlyRate) + Number(monthlyContribution || 0); contributions += Number(monthlyContribution || 0); performanceFactor *= 1 + monthlyRate;
  }
  return points;
}

async function ensurePlannerTables() {
  await runQuery(`CREATE TABLE IF NOT EXISTS ${table("planner_scenarios")} (id STRING NOT NULL,name STRING NOT NULL,scenario_date DATE NOT NULL,description STRING,created_at TIMESTAMP NOT NULL,initial_capital_usd FLOAT64 NOT NULL,initial_contributions_usd FLOAT64 NOT NULL,monthly_contribution_usd FLOAT64 NOT NULL,years INT64 NOT NULL,fire_goal_usd FLOAT64,annual_return_pct FLOAT64 NOT NULL,assets_json STRING NOT NULL,baseline_snapshot_date DATE,baseline_real_value_usd FLOAT64,baseline_real_contributions_usd FLOAT64)`);
  await runQuery(`CREATE TABLE IF NOT EXISTS ${table("planner_scenario_points")} (scenario_id STRING NOT NULL,point_date DATE NOT NULL,month_index INT64 NOT NULL,projected_value_usd FLOAT64 NOT NULL,projected_contributions_usd FLOAT64 NOT NULL,projected_performance_pct FLOAT64 NOT NULL)`);
}

async function getBaseline(scenarioDate) {
  const rows = await runQuery(`SELECT snapshot_date,CAST(investments_usd AS FLOAT64) AS real_value_usd,CAST(investments_cost_usd AS FLOAT64) AS real_contributions_usd FROM ${table("portfolio_snapshots")} WHERE snapshot_date <= @scenarioDate ORDER BY snapshot_date DESC LIMIT 1`, { scenarioDate });
  const row = rows[0]; if (!row) return null;
  return { snapshotDate: unwrapDate(row.snapshot_date), realValueUsd: Number(row.real_value_usd || 0), realContributionsUsd: Number(row.real_contributions_usd || 0) };
}

async function listScenarios(req, res) { try { await ensurePlannerTables(); const rows = await runQuery(`SELECT * FROM ${table("planner_scenarios")} ORDER BY scenario_date DESC, created_at DESC`); res.json(rows); } catch (error) { console.error("Error listing planner scenarios:", error); res.status(500).json({ error: "Error fetching planner scenarios" }); } }

async function getScenario(req, res) { try { await ensurePlannerTables(); const scenarios = await runQuery(`SELECT * FROM ${table("planner_scenarios")} WHERE id = @id LIMIT 1`, { id: req.params.id }); if (!scenarios.length) return res.status(404).json({ error: "Scenario not found" }); const points = await runQuery(`SELECT * FROM ${table("planner_scenario_points")} WHERE scenario_id = @id ORDER BY month_index ASC`, { id: req.params.id }); res.json({ ...scenarios[0], points }); } catch (error) { console.error("Error fetching planner scenario:", error); res.status(500).json({ error: "Error fetching planner scenario" }); } }

async function getScenarioComparison(req, res) {
  try {
    await ensurePlannerTables();
    const scenarios = await runQuery(`SELECT * FROM ${table("planner_scenarios")} WHERE id = @id LIMIT 1`, { id: req.params.id });
    if (!scenarios.length) return res.status(404).json({ error: "Scenario not found" });

    const scenario = scenarios[0];
    const scenarioDate = unwrapDate(scenario.scenario_date);
    const createdAt = scenario.created_at?.value || scenario.created_at;
    const createdLocalDate = createdAt ? buenosAiresDate(new Date(createdAt)) : null;
    const isCapturedLive = createdLocalDate === scenarioDate;
    const frozenBaseline = isCapturedLive ? Number(scenario.initial_capital_usd || 0) : Number(scenario.baseline_real_value_usd ?? scenario.initial_capital_usd ?? 0);
    const annualReturn = Number(scenario.annual_return_pct || 0);
    const monthlyContribution = Number(scenario.monthly_contribution_usd || 0);
    const dailyRate = Math.pow(1 + annualReturn / 100, 1 / 365) - 1;

    const [realSnapshots, dailyFlows] = await Promise.all([
      runQuery(`SELECT snapshot_date,CAST(investments_usd AS FLOAT64) AS real_value_usd FROM ${table("portfolio_snapshots")} WHERE snapshot_date >= @scenarioDate ORDER BY snapshot_date ASC`, { scenarioDate }),
      runQuery(`SELECT fecha AS flow_date, SUM(CASE WHEN movement_type = 'BUY_ASSET' THEN ABS(SAFE_CAST(net_amount AS FLOAT64)) ELSE -ABS(SAFE_CAST(net_amount AS FLOAT64)) END) AS net_flow_usd FROM ${table("movements")} WHERE fecha > @scenarioDate AND category = 'PORTFOLIO' AND movement_type IN ('BUY_ASSET', 'SELL_ASSET') GROUP BY fecha ORDER BY fecha`, { scenarioDate }),
    ]);

    const snapshots = realSnapshots
      .map((r) => ({ date: unwrapDate(r.snapshot_date), value: Number(r.real_value_usd || 0) }))
      .filter((r) => r.date && r.date >= scenarioDate);

    const flows = dailyFlows.map((r) => ({ date: unwrapDate(r.flow_date), value: Number(r.net_flow_usd || 0) }));

    const today = buenosAiresDate();
    const snapshotByDate = new Map(snapshots.map((row) => [row.date, row.value]));
    const actualDates = snapshots.map((row) => row.date).filter((date) => date > scenarioDate && date <= today);
    const endDate = actualDates[actualDates.length - 1] || scenarioDate;
    const planByDate = new Map([[scenarioDate, frozenBaseline]]);
    const plannedContributionsByDate = new Map([[scenarioDate, 0]]);
    let plannedContributions = 0;
    let planValue = frozenBaseline;
    let cursor = utcDate(scenarioDate);
    const totalDays = Math.max(0, dateDiffDays(scenarioDate, endDate));

    for (let i = 1; i <= totalDays; i += 1) {
      cursor = addUtcDays(cursor, 1);
      const date = cursor.toISOString().slice(0, 10);
      planValue *= 1 + dailyRate;
      if (isMonthlyAnniversary(date, scenarioDate)) { planValue += monthlyContribution; plannedContributions += monthlyContribution; }
      planByDate.set(date, planValue);
      plannedContributionsByDate.set(date, plannedContributions);
    }

    const series = [{
      date: scenarioDate,
      month_index: 0,
      plan_value_usd: frozenBaseline,
      real_value_usd: frozenBaseline,
      plan_performance_pct: 0,
      real_performance_pct: 0,
      plan_contributions_usd: 0,
      real_contributions_usd: 0,
    }];

    let previousDate = scenarioDate;
    let previousValue = frozenBaseline;
    let realContributions = 0;
    let realFactor = 1;
    let validPerformance = frozenBaseline > 0;
    for (const date of actualDates) {
      const netFlow = flows.filter((r) => r.date > previousDate && r.date <= date).reduce((sum, r) => sum + r.value, 0);
      const currentValue = snapshotByDate.get(date);
      realContributions += netFlow;
      if (previousValue > 0 && Number.isFinite(currentValue) && Number.isFinite(netFlow)) {
        realFactor *= (currentValue - netFlow) / previousValue;
      } else validPerformance = false;
      series.push({
        date,
        month_index: (utcDate(date).getUTCFullYear() - utcDate(scenarioDate).getUTCFullYear()) * 12 + utcDate(date).getUTCMonth() - utcDate(scenarioDate).getUTCMonth(),
        plan_value_usd: planByDate.get(date) ?? frozenBaseline,
        real_value_usd: snapshotByDate.get(date) ?? null,
        plan_performance_pct: (Math.pow(1 + dailyRate, dateDiffDays(scenarioDate, date)) - 1) * 100,
        real_performance_pct: validPerformance ? (realFactor - 1) * 100 : null,
        plan_contributions_usd: plannedContributionsByDate.get(date),
        real_contributions_usd: realContributions,
      });
      previousDate = date;
      previousValue = currentValue;
    }

    const latest = series[series.length - 1] || null;
    const summary = latest ? {
      as_of: latest.date,
      plan_value_usd: latest.plan_value_usd,
      real_value_usd: latest.real_value_usd,
      value_delta_usd: latest.real_value_usd == null ? null : latest.real_value_usd - latest.plan_value_usd,
      value_delta_pct: latest.real_value_usd == null || !latest.plan_value_usd ? null : ((latest.real_value_usd - latest.plan_value_usd) / latest.plan_value_usd) * 100,
      plan_performance_pct: latest.plan_performance_pct,
      real_performance_pct: latest.real_performance_pct,
      performance_delta_pp: latest.real_performance_pct == null ? null : latest.real_performance_pct - latest.plan_performance_pct,
      plan_contributions_usd: latest.plan_contributions_usd,
      real_contributions_usd: latest.real_contributions_usd,
      contributions_delta_usd: latest.real_contributions_usd == null ? null : latest.real_contributions_usd - latest.plan_contributions_usd,
      contributions_fulfillment_pct: latest.real_contributions_usd == null || !latest.plan_contributions_usd ? null : (latest.real_contributions_usd / latest.plan_contributions_usd) * 100,
    } : null;

    res.json({
      scenario: {
        id: scenario.id,
        name: scenario.name,
        scenario_date: scenarioDate,
        created_at: createdAt,
        baseline_snapshot_date: unwrapDate(scenario.baseline_snapshot_date),
        baseline_value_usd: frozenBaseline,
        baseline_source: isCapturedLive ? "captured_at_save" : "historical_snapshot",
      },
      methodology: {
        portfolio_value: "Daily portfolio_snapshots.investments_usd compared with a daily plan grown from the frozen baseline using the saved annual return; monthly contributions are applied on each scenario-date anniversary",
        performance: "Compounded snapshot-interval returns: (end value - net asset flow) / start value; end-of-interval flow assumption, not exact intraday TWR",
        contributions: "Net PORTFOLIO purchases minus sales after the baseline date; plan contributions on monthly anniversaries",
        portfolio_frequency: "daily",
        performance_frequency: "snapshot_intervals",
        contributions_frequency: "snapshot_intervals",
        partial_first_month_included: true,
        baseline_day_flows_included: false,
      },
      summary,
      series,
    });
  } catch (error) { console.error("Error comparing planner scenario:", error); res.status(500).json({ error: "Error comparing planner scenario" }); }
}

async function createScenario(req, res) {
  try {
    await ensurePlannerTables(); const { name, scenarioDate, description = "", initialCapital, initialContributions, monthlyContribution, years, fireGoal, annualReturn, assets = [] } = req.body || {};
    const validDate = toDateString(scenarioDate); if (!String(name || "").trim() || !validDate) return res.status(400).json({ error: "Name and scenarioDate are required" });
    const numericFields = [initialCapital, initialContributions, monthlyContribution, years, annualReturn]; if (numericFields.some((value) => !Number.isFinite(Number(value)))) return res.status(400).json({ error: "Invalid scenario numeric values" });
    const id = crypto.randomUUID(); const now = new Date(); const isCurrentDate = validDate === buenosAiresDate(now); const historicalBaseline = isCurrentDate ? null : await getBaseline(validDate);
    const points = buildMonthlyProjection({ scenarioDate: validDate, initialCapital: Number(initialCapital), initialContributions: Number(initialContributions), monthlyContribution: Number(monthlyContribution), years: Number(years), annualReturn: Number(annualReturn) });
    const scenarioRow = { id, name: String(name).trim(), scenario_date: validDate, description: String(description || "").trim(), created_at: now.toISOString(), initial_capital_usd: Number(initialCapital), initial_contributions_usd: Number(initialContributions), monthly_contribution_usd: Number(monthlyContribution), years: Math.round(Number(years)), fire_goal_usd: Number.isFinite(Number(fireGoal)) ? Number(fireGoal) : null, annual_return_pct: Number(annualReturn), assets_json: JSON.stringify(assets), baseline_snapshot_date: isCurrentDate ? validDate : historicalBaseline?.snapshotDate || null, baseline_real_value_usd: isCurrentDate ? Number(initialCapital) : historicalBaseline?.realValueUsd ?? null, baseline_real_contributions_usd: isCurrentDate ? Number(initialContributions) : historicalBaseline?.realContributionsUsd ?? null };
    await bigquery.dataset(datasetId).table("planner_scenarios").insert([scenarioRow]); await bigquery.dataset(datasetId).table("planner_scenario_points").insert(points.map((point) => ({ scenario_id: id, ...point })));
    res.status(201).json({ ...scenarioRow, points });
  } catch (error) { console.error("Error creating planner scenario:", error); res.status(500).json({ error: "Error saving planner scenario" }); }
}

async function deleteScenario(req, res) { try { await ensurePlannerTables(); await runQuery(`DELETE FROM ${table("planner_scenario_points")} WHERE scenario_id = @id`, { id: req.params.id }); await runQuery(`DELETE FROM ${table("planner_scenarios")} WHERE id = @id`, { id: req.params.id }); res.status(204).send(); } catch (error) { console.error("Error deleting planner scenario:", error); res.status(500).json({ error: "Error deleting planner scenario" }); } }

module.exports = { listScenarios, getScenario, getScenarioComparison, createScenario, deleteScenario };
