// Import necessary dependencies for Anchor framework and SPL token operations
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as TokenTransfer};

// Declare the program ID - this is the unique identifier for our vault program
declare_id!("6Xf5BppD241vj5Pw5nYTpU78MEyvkQ5N77cCxdyB1rjH");

#[program]
pub mod vault2 {
    use super::*;

    /// Initialize a new token vault for a user
    /// 
    /// This function creates a vault that can hold any SPL token type.
    /// The vault will automatically release all tokens back to the user
    /// when the target amount is reached.
    /// 
    /// # Arguments
    /// * `ctx` - The initialize context containing all required accounts
    /// * `amount` - The target amount of tokens to save (in token's smallest unit)
    /// * `mint` - The mint address of the token to be stored in the vault
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn initialize(ctx: Context<Initialize>, amount: u64, mint: Pubkey) -> Result<()> {
        // Delegate the actual initialization logic to the accounts implementation
        ctx.accounts.initialize(amount, mint, &ctx.bumps)?;

        Ok(())
    }

    /// Deposit tokens into the vault
    /// 
    /// This function transfers tokens from the user's token account to the vault.
    /// If the deposit causes the vault to reach or exceed the target amount,
    /// all tokens are automatically sent back to the user.
    /// 
    /// # Arguments
    /// * `ctx` - The deposit context containing user and vault token accounts
    /// * `amount` - The amount of tokens to deposit (in token's smallest unit)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // Delegate the deposit logic to the accounts implementation
        ctx.accounts.deposit(amount)?;

        Ok(())
    }

    /// Withdraw tokens from the vault
    /// 
    /// This function allows users to withdraw tokens from their vault before
    /// reaching the target amount. The vault authority (PDA) signs the transfer.
    /// Tokens cannot be withdrawn if they are currently locked.
    /// 
    /// # Arguments
    /// * `ctx` - The withdraw context containing user and vault token accounts
    /// * `amount` - The amount of tokens to withdraw (in token's smallest unit)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // Delegate the withdraw logic to the accounts implementation
        ctx.accounts.withdraw(amount)?;

        Ok(())
    }

    /// Lock tokens in the vault for a specified duration
    /// 
    /// This function locks tokens in the vault, preventing withdrawals until
    /// the lock period expires. The lock duration is specified in seconds.
    /// 
    /// # Arguments
    /// * `ctx` - The lock context containing vault state
    /// * `duration_seconds` - The duration in seconds to lock the tokens
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn lock_tokens(ctx: Context<LockTokens>, duration_seconds: i64) -> Result<()> {
        // Delegate the lock logic to the accounts implementation
        ctx.accounts.lock_tokens(duration_seconds)?;

        Ok(())
    }
}

/// Account structure for initializing a new token vault
/// 
/// This struct defines all the accounts required to create a new vault:
/// - User account (signer and payer)
/// - State account (stores vault configuration)
/// - Vault token account (holds the actual tokens)
/// - Vault authority PDA (controls the vault token account)
/// - Token mint (the type of token being stored)
/// - Required programs (Token and System)
#[derive(Accounts)]
#[instruction(amount: u64, mint: Pubkey)]
pub struct Initialize<'info> {
    /// The user creating the vault (must sign the transaction and pay for account creation)
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// The vault state account that stores configuration and metadata
    /// This account is created with a PDA derived from "state" + user's public key
    /// It stores the target amount, mint address, and vault token account address
    #[account(
        init,                    // Create a new account
        payer = user,            // User pays for account creation
        seeds = [b"state", user.key().as_ref()], // PDA seeds for deterministic address
        bump,                    // Store the bump seed for later use
        space = 8 + Vault::INIT_SPACE, // Allocate space for account data
    )]
    pub state: Account<'info, Vault>,
    
    /// The vault's token account that will hold the deposited tokens
    /// This account is created with a PDA derived from "vault" + state account key
    /// The vault authority PDA is set as the authority for this token account
    #[account(
        init,                           // Create a new token account
        payer = user,                   // User pays for account creation
        token::mint = mint,             // Specify which token mint this account is for
        token::authority = vault_authority, // Set vault authority as the account authority
        seeds = [b"vault", state.key().as_ref()], // PDA seeds for deterministic address
        bump,                           // Store the bump seed for later use
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// The vault authority PDA that controls the vault token account
    /// This PDA can sign transactions on behalf of the vault
    /// CHECK: This is the vault authority PDA (no need to deserialize)
    #[account(
        seeds = [b"vault", state.key().as_ref()], // Same seeds as vault token account
        bump,                                     // Must match the bump used for vault token account
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// The token mint account (read-only, used for validation)
    #[account(mut)]
    pub mint: Account<'info, token::Mint>,
    
    /// The SPL Token program (required for token operations)
    pub token_program: Program<'info, Token>,
    
    /// The System program (required for account creation)
    pub system_program: Program<'info, System>,
}

/// Implementation for the Initialize accounts
impl<'info> Initialize<'info> {
    /// Initialize the vault state with the provided parameters
    /// 
    /// This function sets up the vault state account with all necessary information:
    /// - Target amount to save
    /// - Token mint address
    /// - Vault token account address
    /// - PDA bump seeds for later use
    /// 
    /// # Arguments
    /// * `amount` - The target amount of tokens to save
    /// * `mint` - The mint address of the token type
    /// * `bumps` - The PDA bump seeds generated by Anchor
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn initialize(&mut self, amount: u64, mint: Pubkey, bumps: &InitializeBumps) -> Result<()> {
        // Store the target amount of tokens to save
        self.state.amount = amount;
        
        // Store the vault authority bump seed for signing transactions later
        self.state.vault_bump = bumps.vault_authority;
        
        // Store the state account bump seed for validation
        self.state.state_bump = bumps.state;
        
        // Store the mint address to validate token operations
        self.state.mint = mint;
        
        // Store the vault token account address for reference
        self.state.vault_token_account = self.vault_token_account.key();
        
        // Initialize lock to None (unlocked)
        self.state.locked_until = None;
        
        Ok(())
    }
}

/// Account structure for depositing tokens into the vault
/// 
/// This struct defines all the accounts required to deposit tokens:
/// - User account (signer)
/// - User's token account (source of tokens)
/// - Vault token account (destination for tokens)
/// - Vault state (for validation and auto-release logic)
/// - Vault authority PDA (for potential auto-release)
/// - Token program (for token transfers)
#[derive(Accounts)]
pub struct Deposit<'info> {
    /// The user making the deposit (must sign the transaction)
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// The user's token account that contains the tokens to be deposited
    /// Validates that:
    /// - The account belongs to the user
    /// - The account is for the correct token mint
    #[account(
        mut,                                    // Account will be modified (token balance decreases)
        constraint = user_token_account.owner == user.key(), // Ensure user owns the token account
        constraint = user_token_account.mint == state.mint,  // Ensure correct token mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// The vault's token account that will receive the deposited tokens
    /// Validates that this is the correct vault token account for this state
    #[account(
        mut,                                                           // Account will be modified (token balance increases)
        constraint = vault_token_account.key() == state.vault_token_account, // Ensure correct vault token account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// The vault state account containing configuration and metadata
    /// Validates using PDA seeds and stored bump seed
    #[account(
        seeds = [b"state", user.key().as_ref()], // PDA seeds for deterministic address
        bump = state.state_bump,                  // Use stored bump seed for validation
    )]
    pub state: Account<'info, Vault>,
    
    /// The vault authority PDA that can sign transactions on behalf of the vault
    /// This is used for automatic token release when target is reached
    /// CHECK: This is the vault authority PDA (no need to deserialize)
    #[account(
        seeds = [b"vault", state.key().as_ref()], // Same seeds as vault token account
        bump = state.vault_bump,                  // Use stored bump seed for validation
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// The SPL Token program (required for token transfers)
    pub token_program: Program<'info, Token>,
}

/// Implementation for the Deposit accounts
impl<'info> Deposit<'info> {
    /// Deposit tokens into the vault
    /// 
    /// This function performs the following steps:
    /// 1. Transfer tokens from user's account to vault's account
    /// 2. Check if the vault has reached the target amount
    /// 3. If target is reached, automatically send all tokens back to user
    /// 
    /// # Arguments
    /// * `amount` - The amount of tokens to deposit
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        // Step 1: Transfer tokens from user to vault using CPI (Cross-Program Invocation)
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = TokenTransfer {
            from: self.user_token_account.to_account_info(),    // Source: user's token account
            to: self.vault_token_account.to_account_info(),     // Destination: vault's token account
            authority: self.user.to_account_info(),             // Authority: user (signs the transfer)
        };

        // Create CPI context and execute the token transfer
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Step 2: Check if savings target has been reached and handle auto-release
        self.is_savings_target_reached()?;

        Ok(())
    }

    /// Check if the vault has reached the target amount and automatically release tokens
    /// 
    /// This function implements the core "savings goal" feature:
    /// - If vault balance >= target amount, all tokens are sent back to user
    /// - This happens automatically without user intervention
    /// - Uses PDA signing to authorize the transfer from vault to user
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn is_savings_target_reached(&self) -> Result<()> {
        // Check if vault token balance is greater than or equal to target amount
        if self.vault_token_account.amount >= self.state.amount {
            // Target reached! Automatically send all tokens back to user
            
            // Prepare CPI accounts for transferring tokens back to user
            let cpi_program = self.token_program.to_account_info();
            let cpi_accounts = TokenTransfer {
                from: self.vault_token_account.to_account_info(), // Source: vault's token account
                to: self.user_token_account.to_account_info(),    // Destination: user's token account
                authority: self.vault_authority.to_account_info(), // Authority: vault authority PDA
            };

            // Create PDA seeds for signing the transaction
            // The vault authority PDA must sign to authorize the transfer
            let seeds = &[
                b"vault",                                           // Seed prefix
                self.state.to_account_info().key.as_ref(),        // State account key
                &[self.state.vault_bump],                          // Bump seed
            ];

            let signer_seeds = &[&seeds[..]];

            // Create CPI context with PDA signer and execute the transfer
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

            // Transfer all tokens from vault back to user
            token::transfer(cpi_ctx, self.vault_token_account.amount)?;
        }

        Ok(())
    }
}

/// Account structure for withdrawing tokens from the vault
/// 
/// This struct defines all the accounts required to withdraw tokens:
/// - User account (signer)
/// - User's token account (destination for tokens)
/// - Vault token account (source of tokens)
/// - Vault state (for validation)
/// - Vault authority PDA (for signing the transfer)
/// - Token program (for token transfers)
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// The user making the withdrawal (must sign the transaction)
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// The user's token account that will receive the withdrawn tokens
    /// Validates that:
    /// - The account belongs to the user
    /// - The account is for the correct token mint
    #[account(
        mut,                                    // Account will be modified (token balance increases)
        constraint = user_token_account.owner == user.key(), // Ensure user owns the token account
        constraint = user_token_account.mint == state.mint,  // Ensure correct token mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// The vault's token account that contains the tokens to be withdrawn
    /// Validates that this is the correct vault token account for this state
    #[account(
        mut,                                                           // Account will be modified (token balance decreases)
        constraint = vault_token_account.key() == state.vault_token_account, // Ensure correct vault token account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// The vault state account containing configuration and metadata
    /// Validates using PDA seeds and stored bump seed
    #[account(
        seeds = [b"state", user.key().as_ref()], // PDA seeds for deterministic address
        bump = state.state_bump,                  // Use stored bump seed for validation
    )]
    pub state: Account<'info, Vault>,
    
    /// The vault authority PDA that can sign transactions on behalf of the vault
    /// This PDA must sign to authorize the withdrawal from the vault
    /// CHECK: This is the vault authority PDA (no need to deserialize)
    #[account(
        seeds = [b"vault", state.key().as_ref()], // Same seeds as vault token account
        bump = state.vault_bump,                  // Use stored bump seed for validation
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// The SPL Token program (required for token transfers)
    pub token_program: Program<'info, Token>,
}

/// Implementation for the Withdraw accounts
impl<'info> Withdraw<'info> {
    /// Withdraw tokens from the vault
    /// 
    /// This function allows users to withdraw tokens from their vault before
    /// reaching the target amount. The vault authority PDA signs the transfer
    /// to authorize moving tokens from the vault back to the user.
    /// 
    /// # Arguments
    /// * `amount` - The amount of tokens to withdraw
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn withdraw(&mut self, amount: u64) -> Result<()> {
        // Check if tokens are currently locked
        if let Some(locked_until) = self.state.locked_until {
            let clock = Clock::get()?;
            require!(
                clock.unix_timestamp >= locked_until,
                ErrorCode::TokensLocked
            );
        }

        // Prepare CPI accounts for transferring tokens from vault to user
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = TokenTransfer {
            from: self.vault_token_account.to_account_info(), // Source: vault's token account
            to: self.user_token_account.to_account_info(),    // Destination: user's token account
            authority: self.vault_authority.to_account_info(), // Authority: vault authority PDA
        };

        // Create PDA seeds for signing the transaction
        // The vault authority PDA must sign to authorize the transfer from vault
        let seeds = &[
            b"vault",                                           // Seed prefix
            self.state.to_account_info().key.as_ref(),        // State account key
            &[self.state.vault_bump],                          // Bump seed
        ];
        let signer_seeds = &[&seeds[..]];
        
        // Create CPI context with PDA signer and execute the transfer
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        // Transfer the specified amount of tokens from vault to user
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

/// Account structure for locking tokens in the vault
/// 
/// This struct defines all the accounts required to lock tokens:
/// - User account (signer)
/// - Vault state (to update lock status)
#[derive(Accounts)]
pub struct LockTokens<'info> {
    /// The user locking the tokens (must sign the transaction)
    /// Only the vault owner can lock tokens
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// The vault state account containing configuration and metadata
    /// Validates using PDA seeds and stored bump seed
    /// Also validates that the user is the owner of the vault
    #[account(
        mut,
        seeds = [b"state", user.key().as_ref()], // PDA seeds for deterministic address
        bump = state.state_bump,                  // Use stored bump seed for validation
    )]
    pub state: Account<'info, Vault>,
}

/// Implementation for the LockTokens accounts
impl<'info> LockTokens<'info> {
    /// Lock tokens in the vault for a specified duration
    /// 
    /// This function sets the lock expiration timestamp based on the current
    /// time plus the specified duration. Tokens will be locked until this
    /// timestamp is reached.
    /// 
    /// # Arguments
    /// * `duration_seconds` - The duration in seconds to lock the tokens
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error result
    pub fn lock_tokens(&mut self, duration_seconds: i64) -> Result<()> {
        // Get the current timestamp from the Solana clock
        let clock = Clock::get()?;
        
        // Calculate the lock expiration timestamp
        let locked_until = clock.unix_timestamp.checked_add(duration_seconds)
            .ok_or(ErrorCode::InvalidLockDuration)?;
        
        // Update the vault state with the lock expiration timestamp
        self.state.locked_until = Some(locked_until);
        
        Ok(())
    }
}

/// The Vault account structure that stores vault configuration and metadata
/// 
/// This account is created as a PDA and stores all the information needed
/// to manage a user's token vault. It acts as the "state" for the vault.
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// The target amount of tokens to save (in token's smallest unit)
    /// When the vault balance reaches this amount, all tokens are automatically released
    pub amount: u64,
    
    /// The bump seed for the vault authority PDA
    /// This is used to sign transactions on behalf of the vault
    pub vault_bump: u8,
    
    /// The bump seed for the state account PDA
    /// This is used for validation when accessing the state account
    pub state_bump: u8,
    
    /// The mint address of the token type stored in this vault
    /// This ensures all operations are performed on the correct token type
    pub mint: Pubkey,
    
    /// The address of the vault's token account
    /// This is where the actual tokens are stored
    pub vault_token_account: Pubkey,
    
    /// The timestamp until which tokens are locked (Unix timestamp in seconds)
    /// If None, tokens are not locked and can be withdrawn at any time
    /// If Some(timestamp), tokens cannot be withdrawn until the current time >= timestamp
    pub locked_until: Option<i64>,
}

/// Custom error codes for the vault program
#[error_code]
pub enum ErrorCode {
    /// Tokens are currently locked and cannot be withdrawn
    #[msg("Tokens are currently locked and cannot be withdrawn")]
    TokensLocked,
    
    /// Invalid lock duration provided
    #[msg("Invalid lock duration provided")]
    InvalidLockDuration,
}
