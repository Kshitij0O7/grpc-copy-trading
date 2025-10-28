# Solana Copy Trading Bot with gRPC Streams

A high-performance **Solana trading bot** that implements real-time **copy trading** using **gRPC streams** via [Bitquery](https://bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading) CoreCast. Automatically monitor and replicate trades from successful Solana traders with instant execution through Jupiter Swap.

![Solana](https://img.shields.io/badge/Blockchain-Solana-purple) ![gRPC](https://img.shields.io/badge/gRPC-Streams-green) ![Jupiter](https://img.shields.io/badge/DEX-Jupiter-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

## 🚀 Features

- **Real-time gRPC Streaming**: Monitor Solana DEX trades with sub-second latency using Bitquery's CoreCast API
- **Automated Copy Trading**: Instantly replicate trades from successful traders on Solana blockchain
- **Jupiter Integration**: Execute swaps through Jupiter's aggregation protocol for optimal pricing
- **Configurable Filters**: Target specific traders, pools, programs, or signers
- **Hot Reload**: Update configuration without restarting the bot
- **Trade Strategy Framework**: Implement custom trading logic and risk management
- **Production Ready**: Built with error handling, logging, and graceful shutdown

## 🎯 Use Cases

- **Copy Trading**: Automatically mirror trades from profitable Solana traders
- **Arbitrage Detection**: Monitor cross-DEX price differences
- **MEV Protection**: React to large trades instantly
- **Market Research**: Track trading patterns and strategies
- **Portfolio Automation**: Execute trades based on real-time market data

## 📋 Prerequisites

- **Node.js** 18+ and npm
- **Bitquery API Key** - [Sign up for free](https://account.bitquery.io/auth/signup/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_signup)
- **Solana Wallet** with funded SOL (for trading)
- **Basic understanding** of Solana DEX and gRPC concepts

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/grpc-copy-trading.git
cd grpc-copy-trading
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Your Setup

#### Get Your Bitquery API Key

- Get your [Access Token here](https://account.bitquery.io/user/api_v2/access_tokens/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_signup)
- Check the [Token Generation documentation](https://docs.bitquery.io/docs/authorisation/how-to-generate/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_docs)

#### Create `secrets.json`

```bash
cp secrets.example.json secrets.json
```

Edit `secrets.json` with your credentials:

```json
{
  "walletKey": "your_solana_wallet_secret_key_base58"
}
```

**⚠️ Security Note**: Never commit `secrets.json` to version control. It's already in `.gitignore`.

#### Configure `config.yaml`

Edit the configuration file to set up your trading parameters:

```yaml
server:
  address: "corecast.bitquery.io"
  authorization: "" 
  insecure: false

stream:
  type: "dex_trades"  # Options: dex_trades, dex_orders, dex_pools, transactions, transfers, balances

# Trading filters
filters:
  # Copy trades from specific Solana addresses
  traders:
    - "HV1KXxWFaSeriyFvXyx48FqG9BoFbfinB8njCJonqP7K"  # Example trader address
  
  # Optional: Filter by specific DEX programs
  # programs:
  #   - promises program addresses here
```

## 🚦 Getting Started

### Start the Bot

```bash
node index.js
```

The bot will:
1. Connect to Bitquery's CoreCast gRPC stream
2. Monitor trades from your configured filters
3. Execute copy trades automatically
4. Handle configuration changes without restart

### Monitor Configuration

The bot automatically reloads when you modify `config.yaml`. Edit your filters, stream type, or other settings in real-time!

## 📖 Configuration Options

### Stream Types

Supported [Bitquery Solana CoreCast stream types](https://docs.bitquery.io/docs/grpc/solana/introduction/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_docs):

- **`dex_trades`**: Real-time DEX trades (recommended for copy trading)
- **`dex_orders`**: Order book updates
- **`dex_pools`**: Liquidity pool changes
- **`transactions`**: All Solana transactions
- **`transfers`**: Token transfers
- **`balances`**: Wallet balance updates

### Filters

```yaml
filters:
  # Target specific traders (Trade.Buy.Account / Trade.Sell.Account)
  traders:
    - "solana_wallet_address_here"
  
  # Filter by DEX program
  programs:
    - "program_address_here"
  
  # Filter by specific liquidity pools
  pool:
    - "pool_address_here"
  
  # Filter by transaction signers
  signers:
    - "signer_address_here"
```

## 🤖 Customizing Trading Strategy

Edit the `approveTrade()` function in `index.js` to implement your trading logic:

```javascript
function approveTrade(buyAmount) {
  // Example: Only approve trades above 100 tokens
  if (buyAmount > 100 * 1000000000) {  // Convert to raw amount
    console.log('Approving large trade:', qty);
    return true;
  }
  return false;
}
```

### Advanced Strategy Ideas

- **Volume-based filtering**: Only copy trades above certain thresholds
- **Token filtering**: Whitelist/blacklist specific tokens
- **Risk management**: Maximum position sizes, cooldown periods
- **Pattern recognition**: Identify and follow specific trading patterns
- **Multi-signal confirmation**: Combine multiple data sources

## 🔍 How It Works

### Architecture

```
Solana Blockchain
       ↓
   Bitquery CoreCast (gRPC Streams)
       ↓
   Your Trading Bot
       ↓
   Jupiter Swap API
       ↓
   Executed Trades
```

### Data Flow

1. **Bitquery CoreCast** streams real-time Solana DEX trades via gRPC
2. **Bot filters** trades based on your configuration
3. **Strategy function** determines if trade should be executed
4. **Jupiter API** generates optimal swap quote
5. **Transaction** is signed and broadcast to Solana

## 📚 Resources

### Documentation

- [Bitquery CoreCast Documentation](https://docs.bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_docs) - Complete API reference
- [gRPC Streams Guide](https://docs.bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_streams) - Learn about gRPC streaming
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/) - Solana JavaScript SDK
- [Jupiter Swap API](https://station.jup.ag/docs/apis/swap-api) - Jupiter aggregation protocol

### Getting Started with Bitquery

- [Sign up for free](https://graphql.bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_signup) - Create your Bitquery account
- [API Dashboard](https://graphql.bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_dashboard) - Manage your API keys
- [Explore Examples](https://ide.bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_examples) - Check out query examples

## 🛡️ Security Best Practices

1. **Never commit secrets**: Keep `secrets.json` in `.gitignore`
2. **Use separate wallets**: Never use your main wallet for automated trading
3. **Set reasonable limits**: Configure maximum trade sizes
4. **Monitor actively**: Review logs regularly for unusual activity
5. **Test thoroughly**: Start with small amounts on devnet
6. **Secure your API keys**: Rotate keys periodically

## ⚠️ Risk Disclaimer

This software is for educational and research purposes. Trading cryptocurrencies involves significant risk:

- **Financial Risk**: You can lose all funds in your trading wallet
- **Smart Contract Risk**: Bugs in smart contracts can result in loss
- **Market Risk**: Crypto markets are highly volatile
- **Technical Risk**: Network issues or bugs can affect execution

**Use at your own risk. The authors are not responsible for any financial losses.**

## 🐛 Troubleshooting

### Connection Issues

```bash
# Check your API key
curl -H "Authorization: YOUR_KEY" https://corecast.bitquery.io/

# Verify gRPC connection
node index.js
```

### Common Errors

**"Invalid address"**: Check that wallet addresses are valid base58 Solana addresses

**"Jupiter API error"**: Verify the token mint addresses are correct and supported

**"Trade execution failed"**: Ensure your wallet has sufficient SOL for fees and trades

### Debug Mode

Enable verbose logging by modifying console.log statements in the code.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Bitquery](https://bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading) - For the amazing CoreCast gRPC streaming API
- [Jupiter](https://jup.ag/) - For the powerful DEX aggregation protocol
- [Solana Labs](https://solana.com/) - For the high-performance blockchain infrastructure

## 📞 Support

- **Documentation**: [Bitquery Docs](https://docs.bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_docs)
- **Community**: [Discord](https://discord.gg/bitquery)
- **Issues**: [GitHub Issues](https://github.com/yourusername/grpc-copy-trading/issues)

---

**Start your Solana copy trading journey today!** [Get your free Bitquery API key](https://graphql.bitquery.io/?utm_source=github&utm_medium=readme&utm_campaign=grpc_copytrading_signup) 🚀

