import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vault2 } from "../target/types/vault2";

import { PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { assert } from "chai";

import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

describe("vault2", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.vault2 as Program<Vault2>;

  let bob = anchor.web3.Keypair.generate();
  let statePDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;
  let vaultAuthorityPDA: anchor.web3.PublicKey;

  let mint: PublicKey;
  let bobTokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;

  beforeEach(async () => {
    bob = anchor.web3.Keypair.generate();
    await airdrop(bob.publicKey, 2_000_000_000);

    statePDA = getStatePDA(bob.publicKey, program.programId);
    vaultPDA = getVaultPDA(statePDA, program.programId);
    vaultAuthorityPDA = getVaultAuthorityPDA(statePDA, program.programId);

    // Create fresh token mint for each test
    mint = await createMint(
      program.provider.connection,
      bob,
      bob.publicKey,
      null,
      6
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
      1000 * 10 ** 6
    );
  });

  it("Is initialized!", async () => {
    // Initialize the vault with token mint
    const tx = await program.methods
      .initialize(new BN(100 * 10 ** 6), mint) // 100 tokens target
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
    assert.equal(stateAccount.amount.toString(), (100 * 10 ** 6).toString());
    assert.equal(stateAccount.mint.toString(), mint.toString());
    assert.equal(
      stateAccount.vaultTokenAccount.toString(),
      vaultTokenAccount.toString()
    );
  });

  it("Can deposit tokens!", async () => {
    // First initialize the vault
    await program.methods
      .initialize(new BN(100 * 10 ** 6), mint)
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
    const bobTokenBalanceBefore = await getAccount(
      program.provider.connection,
      bobTokenAccount
    );
    const vaultTokenBalanceBefore = await getAccount(
      program.provider.connection,
      vaultTokenAccount
    );

    // Deposit 50 tokens
    const depositAmount = new BN(50 * 10 ** 6);
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
    const bobTokenBalanceAfter = await getAccount(
      program.provider.connection,
      bobTokenAccount
    );
    const vaultTokenBalanceAfter = await getAccount(
      program.provider.connection,
      vaultTokenAccount
    );

    // Verify the deposit worked
    assert.equal(
      vaultTokenBalanceAfter.amount.toString(),
      (
        BigInt(vaultTokenBalanceBefore.amount.toString()) +
        BigInt(depositAmount.toString())
      ).toString()
    );
    assert.equal(
      bobTokenBalanceBefore.amount.toString(),
      (
        BigInt(bobTokenBalanceAfter.amount.toString()) +
        BigInt(depositAmount.toString())
      ).toString()
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

  it("can withdraw tokens!", async () => {
    // First initialize and deposit tokens
    await program.methods
      .initialize(new BN(100 * 10 ** 6), mint)
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
      .deposit(new BN(50 * 10 ** 6))
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
    const bobTokenBalanceBefore = await getAccount(
      program.provider.connection,
      bobTokenAccount
    );
    const vaultTokenBalanceBefore = await getAccount(
      program.provider.connection,
      vaultTokenAccount
    );

    const withdrawAmount = new BN(20 * 10 ** 6); // Withdraw 20 tokens

    await program.methods
      .withdraw(withdrawAmount)
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

    // Get token balances after withdrawal
    const bobTokenBalanceAfter = await getAccount(
      program.provider.connection,
      bobTokenAccount
    );
    const vaultTokenBalanceAfter = await getAccount(
      program.provider.connection,
      vaultTokenAccount
    );

    // Verify the withdrawal worked
    assert.equal(
      vaultTokenBalanceBefore.amount.toString(),
      (
        BigInt(vaultTokenBalanceAfter.amount.toString()) +
        BigInt(withdrawAmount.toString())
      ).toString()
    );
    assert.equal(
      bobTokenBalanceAfter.amount.toString(),
      (
        BigInt(bobTokenBalanceBefore.amount.toString()) +
        BigInt(withdrawAmount.toString())
      ).toString()
    );
  });

  it("can lock tokens in vault", async () => {
    // Initialize vault
    await program.methods
      .initialize(new BN(100 * 10 ** 6), mint)
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

    // Deposit some tokens
    await program.methods
      .deposit(new BN(50 * 10 ** 6))
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

    // Lock tokens for 1 hour (3600 seconds)
    const lockDuration = new BN(3600);
    await program.methods
      .lockTokens(lockDuration)
      .accounts({
        user: bob.publicKey,
        state: statePDA,
      })
      .signers([bob])
      .rpc();

    // Verify the lock was set
    const stateAccount = await program.account.vault.fetch(statePDA);
    assert.isNotNull(stateAccount.lockedUntil);
    assert(stateAccount.lockedUntil !== null);

    // Verify locked_until is in the future (should be approximately current time + 3600)
    const currentTime = Math.floor(Date.now() / 1000);
    const lockedUntil = stateAccount.lockedUntil.toNumber();
    assert.isAtLeast(lockedUntil, currentTime);
    assert.isAtMost(lockedUntil, currentTime + 3700); // Allow some buffer for transaction time
  });

  it("prevents withdrawal when tokens are locked", async () => {
    // Initialize vault
    await program.methods
      .initialize(new BN(100 * 10 ** 6), mint)
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

    // Deposit some tokens
    await program.methods
      .deposit(new BN(50 * 10 ** 6))
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

    // Lock tokens for 1 hour (3600 seconds)
    const lockDuration = new BN(3600);
    await program.methods
      .lockTokens(lockDuration)
      .accounts({
        user: bob.publicKey,
        state: statePDA,
      })
      .signers([bob])
      .rpc();

    // Try to withdraw - should fail with TokensLocked error
    const withdrawAmount = new BN(20 * 10 ** 6);
    try {
      await program.methods
        .withdraw(withdrawAmount)
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

      // If we get here, the test should fail
      assert.fail("Withdrawal should have failed but succeeded");
    } catch (error: any) {
      // Verify the error is TokensLocked
      assert.include(error.toString(), "TokensLocked");
    }
  });

  it("allows withdrawal when tokens are not locked", async () => {
    // Initialize vault
    await program.methods
      .initialize(new BN(100 * 10 ** 6), mint)
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

    // Deposit some tokens
    await program.methods
      .deposit(new BN(50 * 10 ** 6))
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

    // Verify tokens are not locked initially
    const stateAccountBefore = await program.account.vault.fetch(statePDA);
    assert.isNull(stateAccountBefore.lockedUntil);

    // Withdraw should succeed when tokens are not locked
    const withdrawAmount = new BN(20 * 10 ** 6);
    await program.methods
      .withdraw(withdrawAmount)
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

    // Verify withdrawal succeeded
    const vaultTokenBalanceAfter = await getAccount(
      program.provider.connection,
      vaultTokenAccount
    );
    assert.equal(
      vaultTokenBalanceAfter.amount.toString(),
      (30 * 10 ** 6).toString()
    );
  });

  // HELPERS
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
