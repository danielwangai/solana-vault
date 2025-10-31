/**
 * Quick script to get SOL balance and request airdrop on devnet
 *
 * Usage:
 *   ts-node scripts/get-sol.ts [amount]
 *
 * Default amount: 2 SOL
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_WALLET_PATH = "~/.config/solana/id.json";

function loadWallet(walletPath: string): Keypair {
  const keypairPath = path.resolve(
    walletPath.replace("~", process.env.HOME || process.env.USERPROFILE || "~")
  );

  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Wallet file not found: ${keypairPath}`);
  }

  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(keypairData));
}

async function main() {
  const airdropAmount = process.argv[2] ? parseFloat(process.argv[2]) : 2;
  const wallet = loadWallet(DEFAULT_WALLET_PATH);
  const connection = new Connection(DEVNET_RPC_URL, "confirmed");

  console.log(`💰 Wallet: ${wallet.publicKey.toString()}`);

  // Check current balance
  const balance = await connection.getBalance(wallet.publicKey);
  const balanceSOL = balance / anchor.web3.LAMPORTS_PER_SOL;
  console.log(`   Current balance: ${balanceSOL.toFixed(6)} SOL\n`);

  if (balanceSOL >= 1) {
    console.log("✅ You already have enough SOL!");
    return;
  }

  console.log(`📥 Requesting ${airdropAmount} SOL airdrop on devnet...`);

  try {
    const signature = await connection.requestAirdrop(
      wallet.publicKey,
      airdropAmount * anchor.web3.LAMPORTS_PER_SOL
    );

    console.log(`   Transaction: ${signature}`);
    console.log(`   Waiting for confirmation...`);

    await connection.confirmTransaction(signature, "confirmed");

    // Check new balance
    const newBalance = await connection.getBalance(wallet.publicKey);
    const newBalanceSOL = newBalance / anchor.web3.LAMPORTS_PER_SOL;

    console.log(`\n✅ Airdrop successful!`);
    console.log(`   New balance: ${newBalanceSOL.toFixed(6)} SOL`);
    console.log(
      `   View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`
    );
  } catch (error: any) {
    console.error(`\n❌ Airdrop failed: ${error.message}`);

    if (error.message.includes("rate limit")) {
      console.error(`\n⚠️  Rate limit reached. Try:`);
      console.error(`   1. Wait a few minutes and try again`);
      console.error(`   2. Use a different devnet RPC endpoint:`);
      console.error(`      https://api.devnet.solana.com (default)`);
      console.error(`      https://devnet.helius-rpc.com`);
      console.error(`   3. Use SolFaucet: https://solfaucet.com/`);
    }

    process.exit(1);
  }
}

main().catch(console.error);
