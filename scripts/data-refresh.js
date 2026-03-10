// scripts/data-refresh.js
// Runs INSIDE the Docker container. Periodically queries MongoDB and writes workspace data files.
// Usage: node /workspace/.data-refresh.js (run from /workspace/.deps so require() finds mongodb)

const { MongoClient } = require('mongodb');
const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const REFRESH_INTERVAL = (parseInt(process.env.REFRESH_INTERVAL || '10', 10)) * 1000;
const WORKSPACE = '/workspace';

if (!MONGODB_URI) {
  console.error('[data-refresh] MONGODB_URI not set');
  process.exit(1);
}

function dedup(docs) {
  const seen = new Map();
  for (const d of docs) {
    const sym = d.symbol || '';
    if (sym && !seen.has(sym)) seen.set(sym, d);
  }
  return Array.from(seen.values());
}

async function refreshData(client) {
  const db = client.db();

  const [verdicts, classifications, discoveries, signals, trackedAssets, projects, signalCrawl, globalDiscovery] = await Promise.all([
    db.collection('intelligenceverdicts').find({}).sort({ createdAt: -1 }).toArray().catch(() => []),
    db.collection('classificationjobs').find({ status: 'completed', result: { $ne: null } }).sort({ completedAt: -1 }).toArray().catch(() => []),
    db.collection('discoveryjobs').find({ status: 'completed', result: { $ne: null } }).sort({ completedAt: -1 }).toArray().catch(() => []),
    db.collection('signals').find({}).sort({ createdAt: -1 }).limit(100).toArray().catch(() => []),
    db.collection('trackedassets').find({}).toArray().catch(() => []),
    db.collection('cryptoprojects').find({}).toArray().catch(() => []),
    db.collection('signalcrawljobs').findOne({ status: 'completed' }, { sort: { startedAt: -1 } }).catch(() => null),
    db.collection('globaldiscoveryreports').findOne({}, { sort: { createdAt: -1 } }).catch(() => null),
  ]);

  const latestVerdicts = dedup(verdicts);
  const latestClassifications = dedup(classifications);
  const latestDiscoveries = dedup(discoveries);

  // Build maps
  const verdictMap = new Map(latestVerdicts.map(v => [v.symbol, v]));
  const classMap = new Map(latestClassifications.map(c => [c.symbol, c]));
  const discoveryMap = new Map(latestDiscoveries.map(d => [d.symbol, d]));
  const projectMap = new Map(projects.map(p => [p.symbol, p]));
  const signalsBySymbol = new Map();
  for (const s of signals) {
    const sym = s.symbol || '';
    if (!signalsBySymbol.has(sym)) signalsBySymbol.set(sym, []);
    signalsBySymbol.get(sym).push(s);
  }

  const allSymbols = new Set([
    ...trackedAssets.map(a => a.symbol || '').filter(Boolean),
    ...verdictMap.keys(),
    ...classMap.keys(),
    ...discoveryMap.keys(),
    ...signalsBySymbol.keys(),
    ...projectMap.keys(),
  ]);

  // Build index
  const assets = Array.from(allSymbols).filter(Boolean).sort().map(symbol => {
    const verdict = verdictMap.get(symbol);
    const entry = {
      symbol,
      hasVerdict: !!verdict,
      hasClassification: classMap.has(symbol),
      hasDiscovery: discoveryMap.has(symbol),
      hasSignals: (signalsBySymbol.get(symbol)?.length || 0) > 0,
      hasProject: projectMap.has(symbol),
    };
    if (verdict) {
      entry.verdictSummary = {
        direction: verdict.direction || 'unknown',
        confidence: verdict.confidence || 0,
        updatedAt: verdict.createdAt?.toISOString?.() || '',
      };
    }
    if (signalsBySymbol.has(symbol)) entry.signalCount = signalsBySymbol.get(symbol).length;
    const proj = projectMap.get(symbol);
    if (proj) entry.projectCategory = proj.category || undefined;
    return entry;
  });

  const index = {
    trackedAssets: trackedAssets.map(a => a.symbol || '').filter(Boolean),
    assets,
    globalData: {
      hasGlobalDiscovery: !!globalDiscovery,
      hasSignalCrawl: !!signalCrawl,
      trackedAssetCount: trackedAssets.length,
    },
    lastUpdated: new Date().toISOString(),
  };

  // Write index
  writeFileSync(join(WORKSPACE, 'index.json'), JSON.stringify(index, null, 2));

  // Write per-asset data
  const assetsDir = join(WORKSPACE, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  for (const symbol of allSymbols) {
    if (!symbol) continue;
    const dir = join(assetsDir, symbol);
    mkdirSync(dir, { recursive: true });
    const v = verdictMap.get(symbol);
    if (v) writeFileSync(join(dir, 'verdict.json'), JSON.stringify(v, null, 2));
    const c = classMap.get(symbol);
    if (c) writeFileSync(join(dir, 'classification.json'), JSON.stringify(c, null, 2));
    const d = discoveryMap.get(symbol);
    if (d) writeFileSync(join(dir, 'discovery.json'), JSON.stringify(d, null, 2));
    const sigs = signalsBySymbol.get(symbol);
    if (sigs?.length) writeFileSync(join(dir, 'signals.json'), JSON.stringify(sigs, null, 2));
    const p = projectMap.get(symbol);
    if (p) writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));
  }

  // Write global data
  const globalDir = join(WORKSPACE, 'global');
  mkdirSync(globalDir, { recursive: true });
  if (trackedAssets.length) writeFileSync(join(globalDir, 'tracked-assets.json'), JSON.stringify(trackedAssets, null, 2));
  if (signalCrawl) writeFileSync(join(globalDir, 'signal-crawl.json'), JSON.stringify(signalCrawl, null, 2));
  if (globalDiscovery) writeFileSync(join(globalDir, 'global-discovery.json'), JSON.stringify(globalDiscovery, null, 2));

  return allSymbols.size;
}

// ── Main loop ──
async function main() {
  console.log(`[data-refresh] Starting (interval: ${REFRESH_INTERVAL / 1000}s, db: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')})`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('[data-refresh] Connected to MongoDB');

  // Do initial refresh immediately
  try {
    const count = await refreshData(client);
    console.log(`[data-refresh] Initial refresh: ${count} assets`);
  } catch (err) {
    console.error('[data-refresh] Initial refresh failed:', err.message);
  }

  // Loop
  while (true) {
    await new Promise(r => setTimeout(r, REFRESH_INTERVAL));
    try {
      const count = await refreshData(client);
      console.log(`[data-refresh] Refreshed ${count} assets at ${new Date().toISOString()}`);
    } catch (err) {
      console.error('[data-refresh] Error:', err.message);
    }
  }
}

main().catch(err => {
  console.error('[data-refresh] Fatal:', err);
  process.exit(1);
});
