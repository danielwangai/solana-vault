import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vault2 } from "../target/types/vault2";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { assert } from "chai";

describe("vault2", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.vault2 as Program<Vault2>;

  const bob = anchor.web3.Keypair.generate();
  let statePDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;
  beforeEach(async () => {
    await airdrop(bob.publicKey, 2_000_000_000);
    statePDA = getStatePDA(bob.publicKey, program.programId);
    vaultPDA = getVaultPDA(statePDA, program.programId);
  });

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods
      .initialize(new BN(1000000000))
      .accounts({
        user: bob.publicKey,
        state: statePDA,
        vault: vaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bob])
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Can deposit!", async () => {
    const bobBalanceBefore = await program.provider.connection.getBalance(
      bob.publicKey
    );
    const vaultBalanceBefore = await program.provider.connection.getBalance(
      vaultPDA
    );

    // deposit 0.5 SOL
    const depositAmount = new BN(500000000);
    await program.methods
      .deposit(depositAmount)
      .accounts({
        user: bob.publicKey,
        vault: vaultPDA,
        state: statePDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bob])
      .rpc();

    const bobBalanceAfter = await program.provider.connection.getBalance(
      bob.publicKey
    );
    const vaultBalanceAfter = await program.provider.connection.getBalance(
      vaultPDA
    );

    assert.equal(
      vaultBalanceAfter - vaultBalanceBefore,
      depositAmount.toNumber()
    );
    assert.equal(bobBalanceBefore - bobBalanceAfter, depositAmount.toNumber());
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
  
  it("can withdraw!", async () => {
    const bobBalanceBefore = await program.provider.connection.getBalance(
      bob.publicKey
    );
    const vaultBalanceBefore = await program.provider.connection.getBalance(
      vaultPDA
    );

    const withdrawAmount = new BN(500000000);

    await program.methods.withdraw(withdrawAmount).accounts({
      user: bob.publicKey,
      vault: vaultPDA,
      state: statePDA,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([bob]).rpc();

    const bobBalanceAfter = await program.provider.connection.getBalance(
      bob.publicKey
    );
    const vaultBalanceAfter = await program.provider.connection.getBalance(
      vaultPDA
    );

    assert.equal(vaultBalanceBefore - vaultBalanceAfter, withdrawAmount.toNumber());
    assert.equal(bobBalanceAfter - bobBalanceBefore, withdrawAmount.toNumber());
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
});
