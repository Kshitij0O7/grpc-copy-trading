const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs');
const yaml = require('js-yaml');
const bs58 = require('bs58');
const { loadPackageDefination } = require('bitquery-corecast-proto'); 
const {executeTrade} = require('./trade.js');
const secrets = require('./secrets.json');

// Global state
let config = null;
let client = null;
let metadata = null;
let currentStream = null;
let isReloading = false;

// Helper function to convert bytes to base58
function toBase58(bytes) {
  if (!bytes || bytes.length === 0) return 'undefined';
  try {
    return bs58.encode(bytes);
  } catch (error) {
    return 'invalid_address';
  }
}

// Load proto files
const packageDefinition = loadPackageDefination();
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const solanaCorecast = protoDescriptor.solana_corecast;

// Load configuration from file
function loadConfig() {
  try {
    const newConfig = yaml.load(fs.readFileSync('./config.yaml', 'utf8'));
    console.log('✓ Configuration loaded successfully');
    return newConfig;
  } catch (error) {
    console.error('✗ Failed to load configuration:', error.message);
    return null;
  }
}

// Initialize gRPC client and metadata
function initializeClient() {
  if (!config) {
    throw new Error('Configuration not loaded');
  }
  
  client = new solanaCorecast.CoreCast(
    config.server.address,
    grpc.credentials.createSsl()
  );
  
  metadata = new grpc.Metadata();
  metadata.add('authorization', config.server.authorization);
  
  console.log('gRPC client initialized');
}

// Create request based on configuration
function createRequest() {
  const request = {};
  
  if (config.filters.programs && config.filters.programs.length > 0) {
    request.program = {
      addresses: config.filters.programs
    };
  }
  
  if (config.filters.pool && config.filters.pool.length > 0) {
    request.pool = {
      addresses: config.filters.pool
    };
  }
  
  if (config.filters.traders && config.filters.traders.length > 0) {
    request.trader = {
      addresses: config.filters.traders
    };
  }
  
  if (config.filters.signers && config.filters.signers.length > 0) {
    request.signer = {
      addresses: config.filters.signers
    };
  }
  
  return request;
}

// Stop current stream
function stopStream() {
  if (currentStream) {
    try {
      currentStream.cancel();
      console.log('✓ Stream stopped');
    } catch (error) {
      console.error('Error stopping stream:', error.message);
    }
    currentStream = null;
  }
}

// Stream listener function
function startStream() {
  if (!client || !config) {
    throw new Error('Client not initialized');
  }
  
  console.log('\nConnecting to CoreCast stream...');
  console.log('   Server:', config.server.address);
  console.log('   Stream type:', config.stream.type);
  console.log('   Filters:', JSON.stringify(config.filters, null, 2));
  
  const request = createRequest();
  
  // Create stream based on type
  let stream;
  switch (config.stream.type) {
    case 'dex_trades':
      stream = client.DexTrades(request, metadata);
      break;
    case 'dex_orders':
      stream = client.DexOrders(request, metadata);
      break;
    case 'dex_pools':
      stream = client.DexPools(request, metadata);
      break;
    case 'transactions':
      stream = client.Transactions(request, metadata);
      break;
    case 'transfers':
      stream = client.Transfers(request, metadata);
      break;
    case 'balances':
      stream = client.Balances(request, metadata);
      break;
    default:
      throw new Error(`Unsupported stream type: ${config.stream.type}`);
  }
  
  currentStream = stream;
  
  // Handle stream events
  stream.on('data', async(message) => {
    console.log('\n=== New Message ===');
    console.log('Block Slot:', message.Block?.Slot);
    console.log('Transaction Index:', message.Transaction?.Index);
    console.log('Transaction Signature:', toBase58(message.Transaction?.Signature));
    console.log('Transaction Status:', message.Transaction?.Status);
    
    // Handle different message types
    if (message.Trade) {
      const marketAddress = toBase58(message.Trade.Market?.MarketAddress);
      const inputMint = toBase58(message.Trade.Buy?.Currency?.MintAddress);
      const outputMint = toBase58(message.Trade.Sell?.Currency?.MintAddress);
      const buyAmount = message.Trade.Buy?.Amount;

      // Only execute trade if we have valid addresses
      if (marketAddress !== 'invalid_address' && 
          inputMint !== 'invalid_address' && 
          outputMint !== 'invalid_address') {
        try {
          if(approveTrade(buyAmount)){
            await executeTrades({inputMint, outputMint, marketAddress, buyAmount});
          } else {
            console.log('Trade does not fit strategy');
          }
        } catch (error) {
          logLines.push(`  ❌ Trade execution failed: ${error.message}`);
        }
      } else {
        logLines.push(`  ⚠️ Skipping trade - invalid addresses detected`);
      }
    }
  });
  
  stream.on('error', (error) => {
    if (!isReloading) {
      console.error('Stream error:', error);
      console.error('Error details:', error.details);
      console.error('Error code:', error.code);
    }
  });
  
  stream.on('end', () => {
    if (!isReloading) {
      console.log('Stream ended');
    }
  });
  
  stream.on('status', (status) => {
    if (!isReloading && status.code !== 0) {
      console.log('Stream status:', status);
    }
  });
  
  console.log('✓ Stream connected and listening for data...\n');
}

// Check if server configuration changed
function hasServerConfigChanged(oldConfig, newConfig) {
  return oldConfig.server.address !== newConfig.server.address ||
         oldConfig.server.authorization !== newConfig.server.authorization ||
         oldConfig.server.insecure !== newConfig.server.insecure;
}

// Reload configuration and restart stream
function reloadAndRestart() {
  if (isReloading) {
    return; // Prevent concurrent reloads
  }
  
  isReloading = true;
  console.log('\n:arrows_counterclockwise: Configuration changed, reloading...');
  
  // Load new configuration
  const newConfig = loadConfig();
  if (!newConfig) {
    console.error('✗ Failed to reload configuration, keeping current settings');
    isReloading = false;
    return;
  }
  
  // Check if we need to reinitialize the client
  const needsNewClient = hasServerConfigChanged(config, newConfig);
  
  // Stop current stream
  stopStream();
  
  // Update configuration
  config = newConfig;
  
  // Reinitialize client if server settings changed
  if (needsNewClient) {
    console.log('Server configuration changed, reinitializing client...');
    try {
      initializeClient();
    } catch (error) {
      console.error('✗ Failed to initialize client:', error.message);
      isReloading = false;
      return;
    }
  }
  
  // Start new stream
  try {
    startStream();
    isReloading = false;
  } catch (error) {
    console.error('✗ Failed to start stream:', error.message);
    isReloading = false;
  }
}

function toBase58(bytes) {
  if (!bytes || bytes.length === 0) return 'undefined';
  try {
    return bs58.default.encode(bytes);
  } catch (error) {
    return 'invalid_address';
  }
}

// "Trade Strategy"
// This is a function that determines if a trade should be approved or not.
// If looking to build a profitable bot then create a more complex strategy here.
function approveTrade(buyAmount) {
 console.log('Approving trade for buying', buyAmount/100, "tokens");
  return true;
}

async function executeTrades(params) {
  const {inputMint, outputMint, marketAddress, buyAmount} = params;
  try {
    const txSig = await executeTrade({
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      secretKeyBase58: secrets.key,
      inputMint: inputMint,
      outputMint: outputMint,
      amountInRaw: (buyAmount/100).toString(),
      slippageBps: 100,
      poolAddress: marketAddress,
    });
  
    console.log('✅ Copy trade executed! Tx:', txSig);
  } catch (error) {
    console.error('❌ Trade execution failed:', error);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  stopStream();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  stopStream();
  process.exit(0);
});

// Watch config file for changes
let watchTimeout = null;
fs.watch('./config.yaml', (eventType, filename) => {
  if (eventType === 'change') {
    // Debounce multiple rapid file changes
    if (watchTimeout) {
      clearTimeout(watchTimeout);
    }
    watchTimeout = setTimeout(() => {
      reloadAndRestart();
      watchTimeout = null;
    }, 300); // Wait 300ms after last change
  }
});

console.log(':eyes: Watching config.yaml for changes...');

// Initial startup
try {
  config = loadConfig();
  if (!config) {
    console.error('Failed to load configuration');
    process.exit(1);
  }
  
  initializeClient();
  startStream();
} catch (error) {
  console.error('Failed to start stream:', error);
  process.exit(1);
}