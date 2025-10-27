const grpc = require('@grpc/grpc-js');
const fs = require('fs');
const yaml = require('js-yaml');
const bs58 = require('bs58');
const { loadPackageDefination } = require('bitquery-corecast-proto'); 
const {executeTrade} = require('./trade.js');
const secrets = require('./secrets.json');

// Performance optimization: Cache for base58 conversions
const base58Cache = new Map();
const MAX_CACHE_SIZE = 10000;

// Performance optimization: Batch console output
let logBuffer = [];
let logFlushInterval = null;
const LOG_FLUSH_INTERVAL_MS = 100;
const MAX_LOG_BUFFER_SIZE = 1000;

// Performance optimization: Message processing stats
let messageCount = 0;
let totalMessageSize = 0;
let transactionCount = 0;
let tradeCount = 0;
let transferCount = 0;
let orderCount = 0;
let poolEventCount = 0;
let balanceUpdateCount = 0;
let lastStatsTime = Date.now();
const STATS_INTERVAL_MS = 30000;
let statsInterval = null;

// Load configuration
const config = yaml.load(fs.readFileSync('./config.yaml', 'utf8'));

// --- Helpers ---
function toBase58(bytes) {
  if (!bytes || bytes.length === 0) return "undefined";

  const cacheKey = Buffer.from(bytes).toString("hex");

  if (base58Cache.has(cacheKey)) {
    return base58Cache.get(cacheKey);
  }

  try {
    const result = bs58.encode(bytes);

    if (base58Cache.size >= MAX_CACHE_SIZE) {
      const firstKey = base58Cache.keys().next().value;
      base58Cache.delete(firstKey);
    }
    base58Cache.set(cacheKey, result);

    return result;
  } catch (error) {
    return "invalid_address";
  }
}

function bufferedLog(message) {
  logBuffer.push(message);
  if (logBuffer.length >= MAX_LOG_BUFFER_SIZE) flushLogs();
  if (!logFlushInterval) {
    logFlushInterval = setInterval(() => {
      if (logBuffer.length > 0) {
        console.log(logBuffer.join('\n'));
        logBuffer = [];
      }
    }, LOG_FLUSH_INTERVAL_MS);
  }
}

function flushLogs() {
  if (logBuffer.length > 0) {
    console.log(logBuffer.join('\n'));
    logBuffer = [];
  }
}

function printStats() {
  const now = Date.now();
  const messagesPerSecond = messageCount > 0 ? (messageCount * 1000) / (now - lastStatsTime) : 0;
  const avgMessageSize = messageCount > 0 ? (totalMessageSize / messageCount).toFixed(2) : 0;
  const dataRateMBps = messageCount > 0 ? (totalMessageSize / (1024 * 1024)) / ((now - lastStatsTime) / 1000) : 0;

  const statsMessage = [
    '\n=== Performance Stats ===',
    `Messages processed: ${messageCount}`,
    `Rate: ${messagesPerSecond.toFixed(2)} msg/sec`,
    `Total data: ${(totalMessageSize / 1024).toFixed(2)} KB`,
    `Data rate: ${dataRateMBps.toFixed(2)} MB/sec`,
    `Avg message size: ${avgMessageSize} bytes`,
    '',
    'Message Types:',
    `  Transactions: ${transactionCount}`,
    `  Trades: ${tradeCount}`,
    `  Orders: ${orderCount}`,
    `  Pool Events: ${poolEventCount}`,
    `  Transfers: ${transferCount}`,
    `  Balance Updates: ${balanceUpdateCount}`,
    '',
    'System:',
    `  Cache size: ${base58Cache.size}`,
    `  Log buffer size: ${logBuffer.length}`,
    `  Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    `  Stream status: ${messageCount === 0 ? 'No messages received' : 'Active'}`
  ].join('\n');

  bufferedLog(statsMessage);

  // Reset counters
  messageCount = 0;
  totalMessageSize = 0;
  transactionCount = 0;
  tradeCount = 0;
  transferCount = 0;
  orderCount = 0;
  poolEventCount = 0;
  balanceUpdateCount = 0;
  lastStatsTime = now;
}

// --- gRPC setup using your package ---
const packageDefinition = loadPackageDefination();
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const solanaCorecast = protoDescriptor.solana_corecast;

// build client
const address = config.server.address + (config.server.insecure ? ':80' : ':443');

const credentials = config.server.insecure
  ? grpc.credentials.createInsecure()
  : grpc.credentials.createSsl();
console.log(credentials);
const client = new solanaCorecast.CoreCast(
  address, credentials,
  {
    'grpc.keepalive_time_ms': 30000,
    'grpc.keepalive_timeout_ms': 5000,
    'grpc.keepalive_permit_without_calls': true,
    'grpc.http2.max_pings_without_data': 0,
    'grpc.http2.min_time_between_pings_ms': 10000,
    'grpc.http2.min_ping_interval_without_data_ms': 300000,
    'grpc.max_receive_message_length': 4 * 1024 * 1024,
    'grpc.max_send_message_length': 4 * 1024 * 1024,
    'grpc.enable_retries': 1,
    'grpc.max_connection_idle_ms': 30000,
    'grpc.max_connection_age_ms': 300000,
    'grpc.max_connection_age_grace_ms': 5000
  }
);

// metadata
const metadata = new grpc.Metadata();
metadata.add('authorization', config.server.authorization);

// request builder
function createRequest() {
  const request = {};
  if (config.filters.programs?.length) request.program = { addresses: config.filters.programs };
  if (config.filters.pool?.length) request.pool = { addresses: config.filters.pool };
  if (config.filters.traders?.length) request.trader = { addresses: config.filters.traders };
  if (config.filters.signers?.length) request.signer = { addresses: config.filters.signers };
  return request;
}

async function executeTrades(params) {
    const {inputMint, outputMint, marketAddress} = params;
    const txSig = await executeTrade({
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        secretKeyBase58: secrets.key,
        inputMint: inputMint,
        outputMint: outputMint,
        amountInRaw: (0.05 * 1_000_000_000).toString(),
        slippageBps: 100,
        poolAddress: marketAddress,
      });
    
    console.log('✅ Copy trade executed! Tx:', txSig);
}
// --- Stream listener ---
function listenToStream() {
  console.log('Connecting to CoreCast stream...');
  console.log('Server:', config.server.address);
  console.log('Stream type:', config.stream.type);
  console.log('Filters:', JSON.stringify(config.filters, null, 2));

  statsInterval = setInterval(printStats, STATS_INTERVAL_MS);
  const request = createRequest();

  let stream;
  switch (config.stream.type) {
    case 'dex_trades': stream = client.DexTrades(request, metadata); break;
    case 'dex_orders': stream = client.DexOrders(request, metadata); break;
    case 'dex_pools': stream = client.DexPools(request, metadata); break;
    case 'transactions': stream = client.Transactions(request, metadata); break;
    case 'transfers': stream = client.Transfers(request, metadata); break;
    case 'balances': stream = client.Balances(request, metadata); break;
    default: throw new Error(`Unsupported stream type: ${config.stream.type}`);
  }

  stream.on('data', async (message) => {
    const receivedTimestamp = Date.now();
    messageCount++;
    totalMessageSize += Buffer.byteLength(JSON.stringify(message), 'utf8');

    const logLines = [
      '\n=== New Message ===',
      `Block Slot: ${message.Block?.Slot}`,
      `Received Timestamp: ${new Date(receivedTimestamp).toISOString()}`
    ];

    if (message.Trade) {
      tradeCount++;
      const marketAddress = toBase58(message.Trade.Market?.MarketAddress);
      const inputMint = toBase58(message.Trade.Buy?.Currency?.MintAddress);
      const outputMint = toBase58(message.Trade.Sell?.Currency?.MintAddress);
      
      logLines.push(
        'Trade Event:',
        `  Instruction Index: ${message.Trade.InstructionIndex}`,
        `  DEX Program: ${toBase58(message.Trade.Dex?.ProgramAddress)}`,
        `  Protocol: ${message.Trade.Dex?.ProtocolName}`,
        `  Market: ${marketAddress}`,
        `  Buy Currency: ${inputMint}`,
        `  Sell Currency: ${outputMint}`,
        `  Fee: ${message.Trade.Fee}`,
        `  Royalty: ${message.Trade.Royalty}`
      );
      
      // Only execute trade if we have valid addresses
      if (marketAddress !== 'invalid_address' && 
          inputMint !== 'invalid_address' && 
          outputMint !== 'invalid_address') {
        try {
          await executeTrades({inputMint, outputMint, marketAddress});
        } catch (error) {
          logLines.push(`  ❌ Trade execution failed: ${error.message}`);
        }
      } else {
        logLines.push(`  ⚠️ Skipping trade - invalid addresses detected`);
      }
    }

    if (message.Order) {
      orderCount++;
      logLines.push(
        'Order Event:',
        `  Order ID: ${toBase58(message.Order.Order?.OrderId)}`,
        `  Buy Side: ${message.Order.Order?.BuySide}`,
        `  Limit Price: ${message.Order.Order?.LimitPrice}`,
        `  Limit Amount: ${message.Order.Order?.LimitAmount}`
      );
    }

    if (message.PoolEvent) {
      poolEventCount++;
      logLines.push(
        'Pool Event:',
        `  Market: ${toBase58(message.PoolEvent.Market?.MarketAddress)}`,
        `  Base Currency Change: ${message.PoolEvent.BaseCurrency?.ChangeAmount}`,
        `  Quote Currency Change: ${message.PoolEvent.QuoteCurrency?.ChangeAmount}`
      );
    }

    if (message.Transfer) {
      transferCount++;
      logLines.push(
        'Transfer Event:',
        `  Amount: ${message.Transfer.Amount}`,
        `  From: ${toBase58(message.Transfer.From)}`,
        `  To: ${toBase58(message.Transfer.To)}`
      );
    }

    if (message.BalanceUpdate) {
      balanceUpdateCount++;
      logLines.push(
        'Balance Update:',
        `  Address: ${toBase58(message.BalanceUpdate.Address)}`,
        `  Change: ${message.BalanceUpdate.Change}`,
        `  New Balance: ${message.BalanceUpdate.NewBalance}`
      );
    }

    if (message.Transaction) {
      transactionCount++;
      logLines.push(
        'Parsed Transaction:',
        `  Signature: ${toBase58(message.Transaction.Signature)}`,
        `  Status: ${message.Transaction.Status}`
      );

      const instructions = message.Transaction.ParsedIdlInstructions || [];
      logLines.push(`  ParsedIdlInstructions count: ${instructions.length}`);
      logLines.push(...instructions.map(ix => {
        const programAddr = ix.Program ? toBase58(ix.Program.Address) : 'unknown';
        return `    #${ix.Index} program=${programAddr} name=${ix.Program?.Name || ''} method=${ix.Program?.Method || ''} accounts=${(ix.Accounts || []).length}`;
      }));
    }

    bufferedLog(logLines.join('\n'));
  });

  stream.on('error', (error) => {
    flushLogs();
    console.error('Stream error:', error);
    console.error('Error details:', error.details);
    console.error('Error code:', error.code);
    console.error('Request sent:', JSON.stringify(request, null, 2));
  });

  stream.on('end', () => {
    flushLogs();
    console.log('Stream ended');
  });

  stream.on('status', (status) => {
    bufferedLog(`Stream status: ${JSON.stringify(status)}`);
  });
}

// --- Process termination handlers ---
process.on('SIGINT', () => {
  flushLogs();
  if (logFlushInterval) clearInterval(logFlushInterval);
  if (statsInterval) clearInterval(statsInterval);
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  flushLogs();
  if (logFlushInterval) clearInterval(logFlushInterval);
  if (statsInterval) clearInterval(statsInterval);
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

// Start listening
try {
  listenToStream();
} catch (error) {
  console.error('Failed to start stream:', error);
  process.exit(1);
}