// runs as root inside mongo container
db = db.getSiblingDB('oculus-trading');

db.createCollection('signals');
db.createCollection('projects');
db.createCollection('milestones');
db.createCollection('providers');

// Seed: one test signal
db.signals.insertOne({
  symbol: 'BTC/USDT',
  direction: 'long',
  status: 'active',
  source: 'manual',
  sourceProvider: 'seed',
  exchange: 'binance',
  assetClass: 'crypto',
  entryPrice: 65000,
  stopLoss: 62000,
  takeProfits: [
    { level: 1, price: 68000, hit: false },
    { level: 2, price: 72000, hit: false },
  ],
  timeframe: '4h',
  indicators: {},
  sourceRaw: null,
  tags: ['seed'],
  createdAt: new Date(),
  updatedAt: new Date(),
});

print('Oculus Trading DB initialized successfully');
