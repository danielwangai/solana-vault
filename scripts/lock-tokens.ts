import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection, Commitment } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getAccount } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Import the program types
import { Vault2 } from "../target/types/vault2";

// Get program ID from Anchor.toml or use the declared one
const PROGRAM_ID = new PublicKey(
  "6Xf5BppD241vj5Pw5nYTpU78MEyvkQ5N77cCxdyB1rjH"
);

// Devnet connection
const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const commitment: Commitment = "confirmed";

// Helper function to get PDA addresses
function getStatePDA(user: PublicKey, programID: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("state"), user.toBuffer()],
    programID
  )[0];
}

// get vault PDA
function getVaultPDA(state: PublicKey, programID: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), state.toBytes()],
    programID
  )[0];
}

// Load wallet keypair from file
function loadWalletKeypair(walletPath: string): Keypair {
  const keypairPath = path.resolve(
    walletPath.replace("~", process.env.HOME || process.env.USERPROFILE || "~")
  );

  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Wallet file not found: ${keypairPath}`);
  }

  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(keypairData));
}

// Parse command line arguments or use environment variables
function parseArgs() {
  const args: { [key: string]: string } = {};

  // Parse command line arguments
  process.argv.slice(2).forEach((arg, index, arr) => {
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = arr[index + 1];
      if (value && !value.startsWith("--")) {
        args[key] = value;
      }
    }
  });

  return {
    walletPath:
      args.wallet || process.env.WALLET_PATH || "~/.config/solana/id.json", // wallet path
    tokenMint: args.tokenMint || process.env.TOKEN_MINT, // token mint address
    lockDuration: args.duration || process.env.LOCK_DURATION, // duration of the lock in seconds
    targetAmount: args.target || process.env.TARGET_AMOUNT, // savings goal
    depositAmount: args.deposit || process.env.DEPOSIT_AMOUNT || "0", // amount to deposit
  };
}

async function main() {
  console.log("Vault Token Locking Script\n");

  // Parse arguments
  const config = parseArgs();

  if (!config.tokenMint) {
    console.error("Error: TOKEN_MINT is required");
    console.error("\nUsage:");
    console.error(
      "--tokenMint <TOKEN_MINT_ADDRESS> (or set TOKEN_MINT env var)"
    );
    console.error(
      "--duration <LOCK_DURATION_SECONDS> (or set LOCK_DURATION env var)"
    );
    console.error(
      "--wallet <WALLET_PATH> (optional, defaults to ~/.config/solana/id.json)"
    );
    console.error("--target <TARGET_AMOUNT> (optional)");
    console.error("--deposit <DEPOSIT_AMOUNT> (optional, defaults to 0)");
    console.error("\nExample:");
    console.error(
      `yarn lock-tokens --tokenMint 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU --duration 3600`
    );
    process.exit(1);
  }

  if (!config.lockDuration) {
    console.error("Error: LOCK_DURATION is required");
    console.error("\nUsage:");
    console.error(
      "--duration <LOCK_DURATION_SECONDS> (or set LOCK_DURATION env var)"
    );
    console.error(
      "Examples: 3600 (1 hour), 86400 (24 hours), 2592000 (30 days)"
    );
    process.exit(1);
  }

  // Load wallet
  console.log(`Loading wallet from: ${config.walletPath}`);
  const wallet = loadWalletKeypair(config.walletPath);
  console.log(`Wallet loaded: ${wallet.publicKey.toString()}\n`);

  // Parse addresses and amounts first
  let tokenMint: PublicKey;
  try {
    tokenMint = new PublicKey(config.tokenMint);
  } catch (error) {
    console.error(
      `Error: Invalid token mint address: ${config.tokenMint}. Double check your token mint address.`
    );
    process.exit(1);
  }

  let lockDurationSeconds: number;
  try {
    lockDurationSeconds = parseInt(config.lockDuration);
    if (isNaN(lockDurationSeconds) || lockDurationSeconds <= 0) {
      throw new Error("Invalid duration");
    }
  } catch (error) {
    console.error(`Error: Invalid lock duration: ${config.lockDuration}`);
    console.error(
      `Duration must be a positive number in seconds e.g. 10(10 seconds), 3600 (1 hour)`
    );
    process.exit(1);
  }

  // get target amount
  const targetAmount = config.targetAmount
    ? new BN(parseInt(config.targetAmount))
    : null;

  // get deposit amount
  const depositAmount = new BN(parseInt(config.depositAmount));

  // Connect to devnet
  console.log("Connecting to devnet...");
  const connection = new Connection(DEVNET_RPC_URL, commitment);

  console.log(`Check if token mint exists on-chain...`);
  try {
    const mintInfo = await connection.getAccountInfo(tokenMint);
    if (!mintInfo) {
      console.error(
        `Error: Token mint account not found: ${tokenMint.toString()}`
      );
      console.error(`This token mint address does not exist on devnet.`);
      console.error(
        `Please verify you're using the correct token mint address.`
      );
      process.exit(1);
    }
    console.log(`Token mint validated: ${tokenMint.toString()}\n`);
  } catch (error: any) {
    console.error(
      `Error checking token mint: ${tokenMint.toString()}.\nError: ${
        error.message
      }`
    );
    process.exit(1);
  }

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  const balanceSOL = balance / anchor.web3.LAMPORTS_PER_SOL;
  console.log(`Wallet balance: ${balanceSOL} SOL`);

  // Estimate minimum balance needed for vault initialization (state account + vault token account)
  const minBalanceNeeded = 0.002; // Approximate rent for accounts
  if (balanceSOL < minBalanceNeeded) {
    console.error(
      `Error: Insufficient SOL balance. Need at least ${minBalanceNeeded} SOL.`
    );
    console.error(`Current balance: ${balanceSOL} SOL`);
    console.error(
      `Request airdrop: solana airdrop 2 ${wallet.publicKey.toString()} --url devnet`
    );
    process.exit(1);
  } else if (balanceSOL < 0.1) {
    console.warn("Warning: Low SOL balance. Consider requesting an airdrop.");
    console.warn(
      `Run: solana airdrop 2 ${wallet.publicKey.toString()} --url devnet`
    );
  }
  console.log();

  // Setup Anchor provider
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment }
  );
  anchor.setProvider(provider);

  // Load program
  console.log("Loading program...");
  const idlPath = path.join(process.cwd(), "target/idl/vault2.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error(
      `IDL file not found: ${idlPath}\nPlease run 'anchor build' first.`
    );
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  // Program ID is already in the IDL, so we just need to pass idl and provider
  const program = new anchor.Program(
    idl as anchor.Idl,
    provider
  ) as Program<Vault2>;
  console.log(`Program loaded: ${program.programId.toString()}\n`);

  // Verify program is deployed
  try {
    const programInfo = await connection.getAccountInfo(program.programId);
    if (!programInfo) {
      console.error(
        `Error: Program not deployed on devnet: ${program.programId.toString()}`
      );
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`Error checking program deployment: ${error.message}`);
    process.exit(1);
  }

  console.log("Configuration:");
  console.log(`Token Mint: ${tokenMint.toString()}`);
  console.log(
    `Lock Duration: ${lockDurationSeconds} seconds (${
      lockDurationSeconds / 3600
    } hours)`
  );
  if (targetAmount) {
    console.log(`Target Amount: ${targetAmount.toString()}`);
  }
  if (depositAmount.gt(new BN(0))) {
    console.log(`Deposit Amount: ${depositAmount.toString()}`);
  }

  // Calculate PDAs
  const statePDA = getStatePDA(wallet.publicKey, PROGRAM_ID);
  const vaultPDA = getVaultPDA(statePDA, PROGRAM_ID);

  // Get vault token account balance
  let vaultTokenBalance2 = "0";
  try {
    const vaultTokenAccountInfo = await getAccount(connection, vaultPDA);
    vaultTokenBalance2 = vaultTokenAccountInfo.amount.toString();
  } catch (error) {
    // Token account might not exist yet or has zero balance
    vaultTokenBalance2 = "0";
  }
  console.log(`Vault Token Balance: ${vaultTokenBalance2}\n`);

  // Lock tokens
  console.log(`Locking tokens for ${lockDurationSeconds} seconds`);
  
  const lockTx = await program.methods
    .lockTokens(new BN(lockDurationSeconds))
    .accounts({
      user: wallet.publicKey,
    })
    .signers([wallet])
    .rpc();

  console.log(`\nTokens locked successfully!`);
  console.log(`Transaction hash: ${lockTx}`);
  console.log(`View on Solscan: https://solscan.io/tx/${lockTx}?cluster=devnet`);
}

// Run the script
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
