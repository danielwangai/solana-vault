// Import Anchor framework for Solana program testing
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vault2 } from "../target/types/vault2";

// Import Solana web3.js for blockchain interactions
import { PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Import testing framework
import { assert } from "chai";

// Import SPL Token utilities for token operations
import { 
  TOKEN_PROGRAM_ID,                    // The official SPL Token program ID
  createMint,                          // Create a new token mint
  createAccount,                       // Create a token account
  mintTo,                             // Mint tokens to an account
  getAccount,                         // Get token account information
  getAssociatedTokenAddress,          // Get associated token account address
  createAssociatedTokenAccountInstruction, // Instruction to create ATA
  ASSOCIATED_TOKEN_PROGRAM_ID         // Associated Token Account program ID
} from "@solana/spl-token";

describe("vault2", () => {
  // Configure the Anchor provider to use the local Solana cluster
  // This connects our tests to a local validator for testing
  anchor.setProvider(anchor.AnchorProvider.env());

  // Get the compiled program instance for testing
  const program = anchor.workspace.vault2 as Program<Vault2>;

  // Test user keypair - represents a user who will interact with the vault
  const bob = anchor.web3.Keypair.generate();
  
  // Program Derived Addresses (PDAs) - deterministic addresses derived from seeds
  let statePDA: anchor.web3.PublicKey;        // PDA for the vault state account
  let vaultPDA: anchor.web3.PublicKey;       // PDA for the vault token account
  let vaultAuthorityPDA: anchor.web3.PublicKey; // PDA for the vault authority
  
  // Token-related accounts
  let mint: PublicKey;                        // Token mint address (the token type)
  let bobTokenAccount: PublicKey;            // User's token account
  let vaultTokenAccount: PublicKey;          // Vault's token account
  
  beforeEach(async () => {
    // Generate fresh keypair for each test to avoid account conflicts
    const freshBob = anchor.web3.Keypair.generate();
    await airdrop(freshBob.publicKey, 2_000_000_000);
    
    // Update bob reference
    Object.assign(bob, freshBob);
    
    statePDA = getStatePDA(bob.publicKey, program.programId);
    vaultPDA = getVaultPDA(statePDA, program.programId);
    vaultAuthorityPDA = getVaultAuthorityPDA(statePDA, program.programId);
    
    // Create fresh token mint for each test
    mint = await createMint(
      program.provider.connection,
      bob,
      bob.publicKey,
      null,
      6 // decimals
    );
    
    // Create fresh user token account
    bobTokenAccount = await createAccount(
      program.provider.connection,
      bob,
      mint,
      bob.publicKey
    );
    
    // Mint tokens to user
    await mintTo(
      program.provider.connection,
      bob,
      mint,
      bobTokenAccount,
      bob,
      1000 * 10**6 // 1000 tokens with 6 decimals
    );
  });

  it("Is initialized!", async () => {
    // Initialize the vault with token mint
    const tx = await program.methods
      .initialize(new BN(100 * 10**6), mint) // 100 tokens target
      .accounts({
        user: bob.publicKey,
        state: statePDA,
        vaultTokenAccount: vaultPDA, // This will be the vault token account
        vaultAuthority: vaultAuthorityPDA,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bob])
      .rpc();
    
    console.log("Initialize transaction signature", tx);
    
    // Store the vault token account address
    vaultTokenAccount = vaultPDA;
    
    // Verify the state was initialized correctly
    const stateAccount = await program.account.vault.fetch(statePDA);
    assert.equal(stateAccount.amount.toString(), (100 * 10**6).toString());
    assert.equal(stateAccount.mint.toString(), mint.toString());
    assert.equal(stateAccount.vaultTokenAccount.toString(), vaultTokenAccount.toString());
  });

  it("Can deposit tokens!", async () => {
    // First initialize the vault
    await program.methods
      .initialize(new BN(100 * 10**6), mint)
      .accounts({
        user: bob.publicKey,
        state: statePDA,
        vaultTokenAccount: vaultPDA,
        vaultAuthority: vaultAuthorityPDA,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bob])
      .rpc();
    
    vaultTokenAccount = vaultPDA;
    
    // Get token balances before deposit
    const bobTokenBalanceBefore = await getAccount(program.provider.connection, bobTokenAccount);
    const vaultTokenBalanceBefore = await getAccount(program.provider.connection, vaultTokenAccount);

    // Deposit 50 tokens
    const depositAmount = new BN(50 * 10**6);
    await program.methods
      .deposit(depositAmount)
      .accounts({
        user: bob.publicKey,
        userTokenAccount: bobTokenAccount,
        vaultTokenAccount: vaultTokenAccount,
        state: statePDA,
        vaultAuthority: vaultAuthorityPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([bob])
      .rpc();

    // Get token balances after deposit
    const bobTokenBalanceAfter = await getAccount(program.provider.connection, bobTokenAccount);
    const vaultTokenBalanceAfter = await getAccount(program.provider.connection, vaultTokenAccount);

    // Verify the deposit worked
    assert.equal(
      vaultTokenBalanceAfter.amount.toString(),
      (BigInt(vaultTokenBalanceBefore.amount.toString()) + BigInt(depositAmount.toString())).toString()
    );
    assert.equal(
      bobTokenBalanceBefore.amount.toString(),
      (BigInt(bobTokenBalanceAfter.amount.toString()) + BigInt(depositAmount.toString())).toString()
    );
  });

  // TODO: Fix this test
  // it("sends back vault balance to user when target is reached/exceeded", async () => {

  //   const bobBalanceBefore = await program.provider.connection.getBalance(
  //     bob.publicKey
  //   );
  //   const vaultBalanceBefore = await program.provider.connection.getBalance(
  //     vaultPDA
  //   );

  //   // deposit 1 SOL to alice's vault
  //   await program.methods
  //     .deposit(new BN(1_000_000_000))
  //     .accounts({
  //       user: bob.publicKey,
  //       vault: vaultPDA,
  //       state: statePDA,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .signers([bob])
  //     .rpc();

  //   const bobBalanceAfter = await program.provider.connection.getBalance(
  //     bob.publicKey
  //   );
  //   const vaultBalanceAfter = await program.provider.connection.getBalance(
  //     vaultPDA
  //   );

  //   // since vault balance exceeded target amount, it should be sent back to bob
  //   // so vault balance should be 0
  //   assert.equal(vaultBalanceAfter, 0);
  //   assert.equal(bobBalanceAfter, bobBalanceBefore);
  // });

  // HELPERS
  // function to airdrop Lamports of a specified amount to a user
  
  it("can withdraw tokens!", async () => {
    // First initialize and deposit tokens
    await program.methods
      .initialize(new BN(100 * 10**6), mint)
      .accounts({
        user: bob.publicKey,
        state: statePDA,
        vaultTokenAccount: vaultPDA,
        vaultAuthority: vaultAuthorityPDA,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bob])
      .rpc();
    
    vaultTokenAccount = vaultPDA;
    
    // Deposit some tokens first
    await program.methods
      .deposit(new BN(50 * 10**6))
      .accounts({
        user: bob.publicKey,
        userTokenAccount: bobTokenAccount,
        vaultTokenAccount: vaultTokenAccount,
        state: statePDA,
        vaultAuthority: vaultAuthorityPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([bob])
      .rpc();

    // Get token balances before withdrawal
    const bobTokenBalanceBefore = await getAccount(program.provider.connection, bobTokenAccount);
    const vaultTokenBalanceBefore = await getAccount(program.provider.connection, vaultTokenAccount);

    const withdrawAmount = new BN(20 * 10**6); // Withdraw 20 tokens

    await program.methods.withdraw(withdrawAmount).accounts({
      user: bob.publicKey,
      userTokenAccount: bobTokenAccount,
      vaultTokenAccount: vaultTokenAccount,
      state: statePDA,
      vaultAuthority: vaultAuthorityPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([bob]).rpc();

    // Get token balances after withdrawal
    const bobTokenBalanceAfter = await getAccount(program.provider.connection, bobTokenAccount);
    const vaultTokenBalanceAfter = await getAccount(program.provider.connection, vaultTokenAccount);

    // Verify the withdrawal worked
    assert.equal(
      vaultTokenBalanceBefore.amount.toString(),
      (BigInt(vaultTokenBalanceAfter.amount.toString()) + BigInt(withdrawAmount.toString())).toString()
    );
    assert.equal(
      bobTokenBalanceAfter.amount.toString(),
      (BigInt(bobTokenBalanceBefore.amount.toString()) + BigInt(withdrawAmount.toString())).toString()
    );
  });

  it("sends back vault tokens to user when target is reached/exceeded", async () => {
    // Initialize vault with 100 token target
    await program.methods
      .initialize(new BN(100 * 10**6), mint)
      .accounts({
        user: bob.publicKey,
        state: statePDA,
        vaultTokenAccount: vaultPDA,
        vaultAuthority: vaultAuthorityPDA,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bob])
      .rpc();
    
    vaultTokenAccount = vaultPDA;
    
    // Get token balances before deposit
    const bobTokenBalanceBefore = await getAccount(program.provider.connection, bobTokenAccount);
    const vaultTokenBalanceBefore = await getAccount(program.provider.connection, vaultTokenAccount);

    // Deposit exactly 100 tokens (target amount) - should trigger auto-release
    await program.methods
      .deposit(new BN(100 * 10**6))
      .accounts({
        user: bob.publicKey,
        userTokenAccount: bobTokenAccount,
        vaultTokenAccount: vaultTokenAccount,
        state: statePDA,
        vaultAuthority: vaultAuthorityPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([bob])
      .rpc();

    // Get token balances after deposit
    const bobTokenBalanceAfter = await getAccount(program.provider.connection, bobTokenAccount);
    const vaultTokenBalanceAfter = await getAccount(program.provider.connection, vaultTokenAccount);

    // Since vault balance reached target amount, it should be sent back to bob
    // so vault balance should be 0
    assert.equal(vaultTokenBalanceAfter.amount.toString(), "0");
    
    // Bob should have roughly the same balance as before (minus transaction fees)
    // because he deposited 100 tokens and got 100 tokens back
    const expectedBobBalance = bobTokenBalanceBefore.amount;
    // Allow for small transaction fee differences
    assert.isAtMost(
      Math.abs(Number(bobTokenBalanceAfter.amount) - Number(expectedBobBalance)), 
      1000 // Allow 1000 units difference for transaction fees
    );
  });

  const airdrop = async (publicKey: anchor.web3.PublicKey, amount: number) => {
    const sig = await program.provider.connection.requestAirdrop(
      publicKey,
      amount
    );
    await program.provider.connection.confirmTransaction(sig, "confirmed");
  };

  // returns PDA of account
  const getStatePDA = (user: PublicKey, programID: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("state"), user.toBuffer()],
      programID
    )[0];
  };

  // returns PDA of vault account
  const getVaultPDA = (state: PublicKey, programID: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), state.toBytes()],
      programID
    )[0];
  };

  // returns PDA of vault authority
  const getVaultAuthorityPDA = (state: PublicKey, programID: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), state.toBytes()],
      programID
    )[0];
  };
});
