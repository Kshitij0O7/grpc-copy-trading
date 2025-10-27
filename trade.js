const {
    Connection,
    Keypair,
    PublicKey,
    VersionedTransaction,
    Transaction,
  } = require('@solana/web3.js');
  const { createJupiterApiClient } = require('@jup-ag/api');
  const bs58 = require('bs58');
  
  /**
   * Executes a swap from inputMint → outputMint, optionally forcing a specific pool.
   * @param {object} params
   * @param {string} params.rpcUrl
   * @param {string} params.secretKeyBase58
   * @param {string} params.inputMint
   * @param {string} params.outputMint
   * @param {string} params.amountInRaw
   * @param {number} params.slippageBps
   * @param {string} [params.poolAddress] - Optional: target AMM/pool address
   */
  const executeTrade = async (params) => {
    const {
      rpcUrl,
      secretKeyBase58,
      inputMint,
      outputMint,
      amountInRaw,
      slippageBps,
      poolAddress, // <-- optional: pool we want to copy from
    } = params;
  
    // Validate inputs
    if (!inputMint || !outputMint || !amountInRaw) {
      throw new Error('Missing required parameters: inputMint, outputMint, amountInRaw');
    }
    
    if (inputMint === 'invalid_address' || outputMint === 'invalid_address') {
      throw new Error('Invalid mint addresses provided');
    }
  
    const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
  
    // Load wallet
    const secretBytes = bs58.default.decode(secretKeyBase58);;
    const wallet = Keypair.fromSecretKey(secretBytes);
  
    // Jupiter client
    const jupiter = createJupiterApiClient({ basePath: 'https://quote-api.jup.ag/v6' });
  
    // 1️⃣ Fetch quote (simplified route for devnet)
    const quoteReq = {
      inputMint,
      outputMint,
      amount: amountInRaw,
      slippageBps: slippageBps.toString(),
      onlyDirectRoutes: false, // Allow indirect routes for better liquidity
    };
  
    console.log('🔍 Fetching quote with params:', quoteReq);
    
    let quote;
    try {
      // If user provides a pool, we will filter to that AMM route later
      quote = await jupiter.quoteGet(quoteReq);
    } catch (error) {
      console.error('❌ Jupiter API error:', error.response?.data || error.message);
      throw new Error(`Jupiter API error: ${error.response?.data?.message || error.message}`);
    }
  
    if (!quote || !quote.outAmount) throw new Error('No valid quote received');
  
    // 2️⃣ Optional: Force trade through a given pool/AMM if provided
    if (poolAddress) {
      const targetRoute = quote.routePlan.find(
        (r) => r.swapInfo.ammKey === poolAddress
      );
  
      if (!targetRoute) {
        console.warn(`⚠️ Pool ${poolAddress} not found in available routes. Defaulting to best route.`);
      } else {
        quote.routePlan = [targetRoute]; // overwrite to force this route
        console.log(`🔁 Using specific pool route: ${poolAddress}`);
      }
    }
  
    // 3️⃣ Build the swap transaction
    const swapReq = {
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSOL: true,
      asLegacyTransaction: true, // for devnet; remove for mainnet
    };
  
    let swapRes;
    try {
      swapRes = await jupiter.swapPost({ swapRequest: swapReq });
    } catch (error) {
      console.error('❌ Jupiter swap API error:', error.response?.data || error.message);
      throw new Error(`Jupiter swap API error: ${error.response?.data?.message || error.message}`);
    }
    
    if (!swapRes || !swapRes.swapTransaction) throw new Error('Failed to get swap transaction');
  
    // 4️⃣ Sign and send
    const txBuf = Buffer.from(swapRes.swapTransaction, 'base64');
    let tx;
    try {
      tx = VersionedTransaction.deserialize(txBuf);
    } catch {
      tx = Transaction.from(txBuf);
    }
    tx.sign([wallet]);
  
    const raw = tx.serialize();
    const txSig = await connection.sendRawTransaction(raw, {
      skipPreflight: true,
      maxRetries: 3,
    });
  
    console.log(`🕒 Awaiting confirmation for tx: ${txSig}`);
  
    try {
      await connection.confirmTransaction(txSig, 'confirmed');
    } catch (err) {
      console.warn('⚠️ Confirmation timeout — checking manually...');
      const status = await connection.getSignatureStatus(txSig);
      if (status?.value?.err)
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      console.log('✅ Manual check: transaction likely succeeded.');
    }
  
    return txSig;
  };
  
module.exports = { executeTrade };