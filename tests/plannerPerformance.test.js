const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function compare(values, flows = []) {
  const scenario = { scenario_date: '2026-08-28', initial_capital_usd: 1000, baseline_real_value_usd: 1000, annual_return_pct: 12, monthly_contribution_usd: 100 };
  const runQuery = async (sql) => {
    if (sql.startsWith('CREATE')) return [];
    if (sql.includes('planner_scenarios')) return [scenario];
    if (sql.includes('portfolio_snapshots')) return values.map(([date, value]) => ({ snapshot_date: date, real_value_usd: value }));
    if (sql.includes('movements')) return flows.map(([date, value]) => ({ flow_date: date, net_flow_usd: value }));
    throw new Error(sql);
  };
  const context = { module: { exports: {} }, process, console, Date, Intl, require: (name) => {
    if (name === 'crypto') return require('node:crypto');
    if (name.includes('bigqueryHelper')) return { table: (name) => name };
    if (name.includes('bigQueryService')) return { runQuery };
    if (name.includes('config/bigQuery')) return {};
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/plannerController.js'), 'utf8'), context);
  let result;
  await context.module.exports.getScenarioComparison({ params: { id: 'test' } }, { json: (data) => { result = data; }, status: (code) => { throw new Error(String(code)); } });
  return result;
}

test('partial August included, returns have correct percentage scale', async () => {
  const result = await compare([['2026-08-29', 1100], ['2026-09-01', 1210]]);
  assert.ok(Math.abs(result.summary.real_performance_pct - 21) < 1e-9);
  assert.equal(result.summary.plan_contributions_usd, 0);
  assert.ok(Math.abs(result.summary.plan_performance_pct - (Math.pow(1.12, 4 / 365) - 1) * 100) < 1e-9);
});

test('purchases and sales are neutralized across missing snapshot dates', async () => {
  const result = await compare([['2026-08-30', 1200], ['2026-09-01', 1100]], [['2026-08-29', 200], ['2026-08-31', -100]]);
  assert.equal(result.summary.real_performance_pct, 0);
  assert.equal(result.summary.real_contributions_usd, 100);
});

test('no snapshots retains baseline without inventing performance', async () => {
  const result = await compare([]);
  assert.equal(result.series.length, 1);
  assert.equal(result.summary.real_performance_pct, 0);
});
