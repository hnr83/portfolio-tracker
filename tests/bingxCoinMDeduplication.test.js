const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const oldId = 'BINGX-COINM|BTC-USD|LONG|1787443248000|1787625356000';
const newId = 'BINGX-COINM|BTC-USD|LONG|1787663518000|1788464602000';
const fixture = (id, date) => ({
  trade_id: id, instrument: 'BTC', contract_type: 'M_MONEDA', direction: 'LONG',
  settlement_asset: 'BTC', closed_at: date, capital_usd: 4000,
  pnl_qty: 0.01051501, exit_price: 81545.1795, sync_valid: true,
});

function loadController(name, dependencies, extra = '') {
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers', name), 'utf8');
  const context = { module: { exports: {} }, console, setTimeout,
    require: (id) => {
      if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  };
  vm.runInNewContext(source + extra, context, { filename: name });
  return context.module.exports;
}

function setup(existing) {
  const writes = [];
  const db = { runQuery: async (sql, params) => {
    if (sql.includes('INSERT INTO')) { writes.push(params.rows); return []; }
    assert.match(sql, /trade_id/);
    assert.match(sql, /FORMAT_DATE/);
    return existing;
  } };
  const shared = {
    '../services/bigQueryService': db,
    '../utils/bigqueryHelper': { table: (name) => '`test.' + name + '`' },
  };
  const combined = loadController('bingxCombinedSyncController.js', {
    ...shared, '../services/providers/bingxService': {},
    './tradingController': { getBingxSyncPreview: async (req, res) => res.json({ rowsToInsert: [], alreadyExistsRows: [] }) },
  }, `
    fetchCoinMData = async () => ({ orders: [], fillsByOrder: new Map() });
    getCoinMLeverageMap = async () => new Map();
    buildCoinMTrades = () => ${JSON.stringify([fixture(oldId, ''), fixture(newId, '')])}.map(row => ({
      ...row, closed_at: toDateString(Number(row.trade_id.split('|')[4]))
    }));
  `);
  const final = loadController('bingxFinalSyncController.js', {
    ...shared, './bingxCombinedSyncController': combined,
  });
  return { final, writes };
}

async function invoke(handler, body = {}) {
  let result;
  await handler({ query: {}, body }, {
    json: (value) => { result = JSON.parse(JSON.stringify(value)); },
    status: (code) => ({ json: (value) => { throw new Error(`${code}: ${JSON.stringify(value)}`); } }),
  });
  return result;
}

test('actual final preview: August trade exists, September trade is new', async () => {
  const { final } = setup([fixture(oldId, '2026-08-24')]);
  const result = await invoke(final.getBingxFinalSyncPreview);
  assert.equal(result.alreadyExists, 1);
  assert.equal(result.newTrades, 1);
  assert.equal(result.coinM.alreadyExists, 1);
  assert.equal(result.rowsToInsert[0].trade_id, newId);
  assert.equal(result.alreadyExistsRows[0].closed_at, '2026-08-24');
});

test('stable ID recognizes historical rows even when saved date differs', async () => {
  const { final } = setup([fixture(oldId, '2026-08-25')]);
  const result = await invoke(final.getBingxFinalSyncPreview);
  assert.equal(result.newTrades, 1);
  assert.equal(result.alreadyExists, 1);
});

test('legacy row without ID matches Argentina date before deduplication', async () => {
  const { final } = setup([fixture(null, '2026-08-24')]);
  const result = await invoke(final.getBingxFinalSyncPreview);
  assert.equal(result.alreadyExists, 1);
  assert.equal(result.rowsToInsert[0].trade_id, newId);
});

test('confirmation requires funding only for new trade and inserts only that trade', async () => {
  const { final, writes } = setup([fixture(oldId, '2026-08-24')]);
  const result = await invoke(final.syncBingxFinalTradesConfirm, { fundingOverrides: { [newId]: -0.0002 } });
  assert.equal(result.inserted, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].length, 1);
  assert.equal(writes[0][0].trade_id, newId);
});
