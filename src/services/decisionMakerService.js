const investmentThesis = require("../config/investmentThesis");

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function daysBetween(start, end) {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.ceil((end - start) / msPerDay));
}

function weeksBetween(start, end) {
    return Math.max(1, Math.ceil(daysBetween(start, end) / 7));
}

function getField(obj, fields, fallback = undefined) {
    for (const field of fields) {
        if (obj && obj[field] !== undefined && obj[field] !== null) {
            return obj[field];
        }
    }
    return fallback;
}

function getAssetKeys(row) {
    return [
        row?.asset,
        row?.ticker,
        row?.symbol,
        row?.normalized,
        row?.normalized_ticker,
        row?.normalizedTicker,
        row?.display_ticker,
        row?.displayTicker,
        row?.underlying_ticker,
        row?.underlyingTicker,
    ]
        .filter(Boolean)
        .map((v) => String(v).toUpperCase());
}

function matchesAsset(row, asset) {
    const target = String(asset).toUpperCase();
    const keys = getAssetKeys(row);

    return keys.some((key) => {
        return (
            key === target ||
            key === `CURRENCY:${target}ARS` ||
            key.includes(`:${target}ARS`) ||
            key.endsWith(`:${target}`) ||
            key.endsWith(target)
        );
    });
}

function getHoldingByAsset(holdings, asset) {
    return holdings.find((h) => matchesAsset(h, asset));
}

function getMarketByAsset(marketData, asset) {
    return marketData.find((m) => matchesAsset(m, asset));
}

function getPriceFactor(currentPrice, basePrice) {
    if (!currentPrice || !basePrice) return 1;

    const changePct = (currentPrice / basePrice - 1) * 100;

    if (changePct >= 30) return 0.5;
    if (changePct >= 20) return 0.7;
    if (changePct >= 10) return 0.85;

    if (changePct <= -30) return 2;
    if (changePct <= -20) return 1.5;
    if (changePct <= -10) return 1.25;

    return 1;
}

function getTimeFactor({ investedUsd, targetUsd, startDate, endDate, today }) {
    if (!targetUsd || targetUsd <= 0) return 1;

    const totalDays = daysBetween(startDate, endDate);
    const elapsedDays = daysBetween(startDate, today);

    if (!totalDays) return 1;

    const timeProgress = clamp(elapsedDays / totalDays, 0, 1);
    const capitalProgress = clamp(investedUsd / targetUsd, 0, 1);

    const diff = capitalProgress - timeProgress;

    if (diff >= 0.3) return 0.8;
    if (diff >= 0.15) return 0.9;
    if (diff <= -0.3) return 1.5;
    if (diff <= -0.15) return 1.2;

    return 1;
}

function buildAssetDecision({
    asset,
    targetUsd,
    investedUsd,
    currentPrice,
    basePrice,
    weeksRemaining,
    thesis,
    startDate,
    endDate,
    today,
}) {
    const remainingUsd = Math.max(0, targetUsd - investedUsd);
    const baseWeeklyUsd = remainingUsd / weeksRemaining;

    const priceFactor = getPriceFactor(currentPrice, basePrice);

    const timeFactor = getTimeFactor({
        investedUsd,
        targetUsd,
        startDate,
        endDate,
        today,
    });

    const finalFactor = clamp(
        priceFactor * thesis.weights.price + timeFactor * thesis.weights.time,
        thesis.factors.min,
        thesis.factors.max
    );

    const recommendedUsd = Math.min(remainingUsd, baseWeeklyUsd * finalFactor);

    return {
        asset,
        targetUsd,
        investedUsd,
        remainingUsd,
        currentPrice,
        basePrice,
        priceChangePct:
            currentPrice && basePrice ? (currentPrice / basePrice - 1) * 100 : 0,
        baseWeeklyUsd,
        priceFactor,
        timeFactor,
        finalFactor,
        recommendedUsd,
    };
}

async function buildDecisionMaker({
    holdings = [],
    marketData = [],
    tradingUsd = 0,
} = {}) {
    const thesis = investmentThesis.crypto2026;

    const today = new Date();
    const startDate = new Date(thesis.startDate);
    const endDate = new Date(thesis.endDate);
    const weeksRemaining = weeksBetween(today, endDate);

    const btcHolding = getHoldingByAsset(holdings, "BTC");
    const ethHolding = getHoldingByAsset(holdings, "ETH");
    const usdtHolding = getHoldingByAsset(holdings, "USDT");

    const btcMarket = getMarketByAsset(marketData, "BTC");
    const ethMarket = getMarketByAsset(marketData, "ETH");

    const btcInvestedUsd = toNumber(
        getField(btcHolding, [
            "cost_value_usd",
            "costValueUsd",
            "cost_usd",
            "costUsd",
            "cost",
        ])
    );

    const ethInvestedUsd = toNumber(
        getField(ethHolding, [
            "cost_value_usd",
            "costValueUsd",
            "cost_usd",
            "costUsd",
            "cost",
        ])
    );

    const usdtUsd = toNumber(
        getField(usdtHolding, [
            "market_value_usd",
            "marketValueUsd",
            "value_usd",
            "valueUsd",
            "quantity",
        ])
    );

    const tradingAvailableUsd = toNumber(tradingUsd);

    const btcCurrentPrice = toNumber(
        getField(
            btcMarket,
            [
                "market_price",
                "marketPrice",
                "price_usd",
                "priceUsd",
                "price",
                "last_price_usd",
                "lastPriceUsd",
            ],
            getField(
                btcHolding,
                [
                    "market_price",
                    "marketPrice",
                    "price_usd",
                    "priceUsd",
                    "price",
                    "last_price_usd",
                    "lastPriceUsd",
                ],
                thesis.basePrices.BTC
            )
        ),
        thesis.basePrices.BTC
    );

    const ethCurrentPrice = toNumber(
        getField(
            ethMarket,
            [
                "market_price",
                "marketPrice",
                "price_usd",
                "priceUsd",
                "price",
                "last_price_usd",
                "lastPriceUsd",
            ],
            getField(
                ethHolding,
                [
                    "market_price",
                    "marketPrice",
                    "price_usd",
                    "priceUsd",
                    "price",
                    "last_price_usd",
                    "lastPriceUsd",
                ],
                thesis.basePrices.ETH
            )
        ),
        thesis.basePrices.ETH
    );

    const totalThesisCapitalUsd =
        btcInvestedUsd + ethInvestedUsd + usdtUsd + tradingAvailableUsd;

    const btcTargetUsd =
        totalThesisCapitalUsd * thesis.allocation.BTC;

    let ethTargetUsd =
        totalThesisCapitalUsd * thesis.allocation.ETH;

    const ethRecoveryTarget =
        thesis.recovery?.ETH?.enabled
            ? toNumber(thesis.recovery.ETH.targetInvestedUsd)
            : 0;

    ethTargetUsd = Math.max(
        ethTargetUsd,
        ethRecoveryTarget
    );

    const btc = buildAssetDecision({
        asset: "BTC",
        targetUsd: btcTargetUsd,
        investedUsd: btcInvestedUsd,
        currentPrice: btcCurrentPrice,
        basePrice: thesis.basePrices.BTC,
        weeksRemaining,
        thesis,
        startDate,
        endDate,
        today,
    });

    const eth = buildAssetDecision({
        asset: "ETH",
        targetUsd: ethTargetUsd,
        investedUsd: ethInvestedUsd,
        currentPrice: ethCurrentPrice,
        basePrice: thesis.basePrices.ETH,
        weeksRemaining,
        thesis,
        startDate,
        endDate,
        today,
    });

    return {
        strategy: thesis.name || "Crypto Cycle 2026",
        phase: "ACCUMULATION",
        today: today.toISOString().slice(0, 10),
        startDate: thesis.startDate,
        endDate: thesis.endDate,
        weeksRemaining,

        totalThesisCapitalUsd,
        deployedUsd: btcInvestedUsd + ethInvestedUsd,
        liquidityUsd: usdtUsd,
        tradingUsd: tradingAvailableUsd,

        allocation: {
            BTC: thesis.allocation.BTC,
            ETH: thesis.allocation.ETH,
        },

        weeklyRecommendation: {
            BTC: btc.recommendedUsd,
            ETH: eth.recommendedUsd,
            totalUsd: btc.recommendedUsd + eth.recommendedUsd,
        },

        assets: {
            BTC: btc,
            ETH: eth,
        },

        debug: {
            matchedHoldings: {
                BTC: btcHolding?.ticker || btcHolding?.normalized_ticker || null,
                ETH: ethHolding?.ticker || ethHolding?.normalized_ticker || null,
                USDT: usdtHolding?.ticker || usdtHolding?.normalized_ticker || null,
            },
            matchedMarket: {
                BTC: btcMarket?.ticker || btcMarket?.normalized_ticker || null,
                ETH: ethMarket?.ticker || ethMarket?.normalized_ticker || null,
            },
        },

        reasons: [
            "La tesis está en fase de acumulación.",
            "La recomendación semanal combina precio actual vs precio base congelado y avance temporal hasta la fecha límite.",
            "Cada activo se calcula de forma independiente según su presupuesto objetivo.",
        ],
    };
}

module.exports = {
    buildDecisionMaker,
};