# Lock Tokens Script

This script allows you to lock SPL tokens in the vault on devnet.

## Prerequisites

1. Deploy the vault program to devnet first:
   ```bash
   anchor build
   anchor deploy --provider.cluster devnet
   ```

2. Make sure your wallet has SOL for transaction fees

3. Make sure your wallet has the tokens you want to lock

## Installation

Install dependencies:
```bash
npm install
# or
yarn install
```

## Usage

### Method 1: Command Line Arguments

```bash
# Lock tokens for 1 hour (3600 seconds)
yarn lock-tokens \
  --tokenMint <TOKEN_MINT_ADDRESS> \
  --duration 3600 \
  --wallet ~/.config/solana/id.json \
  --target 1000000000 \
  --deposit 500000000
```

### Method 2: Environment Variables

```bash
export TOKEN_MINT="<YOUR_TOKEN_MINT_ADDRESS>"
export LOCK_DURATION="3600"
export WALLET_PATH="~/.config/solana/id.json"
export TARGET_AMOUNT="500000000"
export DEPOSIT_AMOUNT="250000000"

yarn lock-tokens
```

### Method 3: For Existing Vault

If your vault is already initialized and has tokens, you can just lock:

```bash
yarn lock-tokens \
  --tokenMint <YOUR_TOKEN_MINT_ADDRESS> \
  --duration 3600
```

## Parameters

- `--tokenMint` or `TOKEN_MINT`: **Required**. Your SPL token mint address
- `--duration` or `LOCK_DURATION`: **Required**. Lock duration in seconds (e.g., 3600 = 1 hour)
- `--wallet` or `WALLET_PATH`: Optional. Path to wallet keypair (default: `~/.config/solana/id.json`)
- `--target` or `TARGET_AMOUNT`: Required only for new vaults. Target amount in smallest token unit
- `--deposit` or `DEPOSIT_AMOUNT`: Optional. Amount to deposit (default: 0)

## Examples

### Lock tokens for 24 hours
```bash
yarn lock-tokens \
  --tokenMint 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU \
  --duration 86400
```

### Initialize vault and lock tokens
```bash
yarn lock-tokens \
  --tokenMint 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU \
  --duration 3600 \
  --target 1000000000 \
  --deposit 500000000
```

## Notes

- The script will automatically:
  - Check if your vault exists, and initialize if needed
  - Get or create your associated token account
  - Deposit tokens if deposit amount > 0
  - Lock the tokens for the specified duration

- Lock duration is in seconds. Common values:
  - 3600 = 1 hour
  - 86400 = 24 hours
  - 604800 = 1 week
  - 2592000 = 30 days

- Once locked, tokens cannot be withdrawn until the lock expires

- The script shows you the unlock timestamp when locking is complete

