# Hunch Smart Contract Guide

This document explains the smart contracts in `contracts/src` so other developers can quickly understand the integration model and use the contracts correctly.

## Contracts Overview

- `Bridge2.sol`: Main bridge contract on Arbitrum for USDC deposits, withdrawal requests/finalization, validator set updates, and emergency lock/unlock controls.
- `TxKeeper.sol`: Admin-only event emitter used by backend services to record withdrawal/deposit lifecycle events for off-chain balance sync.
- `TestERC20.sol`: Test token with permit support for local/dev testing.

## Bridge2: Mental Model

`Bridge2` is secured by validator signatures and dispute windows:

- **Hot validator signatures** authorize normal operations (like withdrawal requests and adding finalizers/lockers).
- **Cold validator signatures** authorize sensitive/recovery operations (like emergency unlock, removing finalizers/lockers, and invalidating withdrawals).
- **Dispute period** applies before finalizing withdrawals and validator set updates.
- **Finalizers** are a whitelist that can execute finalization calls.
- **Lockers** can vote to pause the bridge if they detect bad state/signatures.

Important state fields:

- `hotValidatorSetHash`, `coldValidatorSetHash`
- `pendingValidatorSetUpdate`
- `requestedWithdrawals`, `finalizedWithdrawals`, `withdrawalsInvalidated`
- `lockers`, `finalizers`, `lockerThreshold`
- `disputePeriodSeconds`, `blockDurationMillis`

## Token Units

Amounts are represented as `uint64 usd` in events/functions.

- In practice, treat this as **USDC base units** (for 6 decimals, `1 USDC = 1_000_000`).
- Keep backend and signer logic consistent with contract expectations.

## Main Flows

### 1) Deposit Flow (User -> Bridge)

Function:

- `batchedDepositWithPermit(DepositWithPermit[] deposits)`

How it works:

1. User signs ERC20 permit off-chain.
2. Caller submits batched permit payload(s).
3. Contract calls `permit` then `transferFrom(user, bridge, usd)`.
4. Contract emits `Deposit(user, usd)` for each successful deposit.

Notes:

- Failed permit/transfer emits `FailedPermitDeposit`.
- Contract must be unpaused.

### 2) Withdrawal Request Flow (L1-signed -> Bridge pending)

Function:

- `batchedRequestWithdrawals(WithdrawalRequest[] withdrawalRequests, ValidatorSet hotValidatorSet)`

How it works:

1. L1 validators sign each withdrawal message.
2. Caller submits request batch + active hot validator set + signatures.
3. Contract verifies validator set hash and signature quorum (>2/3 power).
4. Contract stores each pending withdrawal in `requestedWithdrawals`.
5. Contract emits `RequestedWithdrawal`.

### 3) Withdrawal Finalization Flow (pending -> token transfer)

Function:

- `batchedFinalizeWithdrawals(bytes32[] messages)` (only finalizers)

How it works:

1. Finalizer submits message hashes to finalize.
2. Contract checks dispute time + Arbitrum block-based delay.
3. If valid and not already finalized/invalidated, USDC is transferred to destination.
4. Contract emits `FinalizedWithdrawal`.

### 4) Validator Set Update Flow

Functions:

- `updateValidatorSet(ValidatorSetUpdateRequest newValidatorSet, ValidatorSet activeHotValidatorSet, Signature[] signatures)`
- `finalizeValidatorSetUpdate()` (only finalizers, after dispute period)

How it works:

1. Hot quorum signs the new set.
2. Contract stores pending update + emits `RequestedValidatorSetUpdate`.
3. After dispute period, finalizer calls finalize.
4. Contract commits new hashes/epoch + emits `FinalizedValidatorSetUpdate`.

### 5) Emergency Lock / Unlock

Functions:

- `voteEmergencyLock()` by locker
- `emergencyUnlock(...)` using cold quorum signatures

How it works:

1. Locker votes can pause contract once `lockerThreshold` reached.
2. While paused, normal bridge actions are blocked by `whenNotPaused`.
3. `emergencyUnlock` applies a cold-signed validator update, clears lock votes, and unpauses.

## Admin/Governance Functions

Locker/finalizer role management:

- `modifyLocker(...)`
- `modifyFinalizer(...)`

Config changes (cold quorum signatures):

- `changeDisputePeriodSeconds(...)`
- `changeBlockDurationMillis(...)`
- `changeLockerThreshold(...)`
- `invalidateWithdrawals(...)`

All governance messages are nonce-protected through `usedMessages`.

## TxKeeper: Purpose and Usage

`TxKeeper` does not custody funds. It emits trusted admin-only events consumed by off-chain services.

Core functions (all `onlyAdmin`):

- `requestWithdrawal(user, destination, usd, nonce)` -> emits `WithdrawalRequested`
- `finalizeDeposit(user, usd)` -> emits `DepositFinalized`
- `finalizeWithdrawal(user, destination, usd, nonce)` -> emits `WithdrawalFinalized`
- `updateAdmin(newAdmin)` -> rotates admin key

Use this as an auditable event stream for backend indexing and reconciliation.

## Common Integration Rules

- Always pass validator signatures in the expected validator order (subsequence of active set).
- Always ensure signer side and Solidity side hash construction match exactly.
- Do not call finalization methods before dispute conditions pass.
- Treat role-management and parameter updates as signed governance ops, not ad-hoc transactions.
- Use batch methods where possible for lower operational overhead.

## Events to Index Off-Chain

Bridge:

- `Deposit`
- `RequestedWithdrawal`
- `FinalizedWithdrawal`
- `RequestedValidatorSetUpdate`
- `FinalizedValidatorSetUpdate`
- `ModifiedLocker`
- `ModifiedFinalizer`
- `InvalidatedWithdrawal`
- `FailedWithdrawal`
- `FailedPermitDeposit`

TxKeeper:

- `WithdrawalRequested`
- `DepositFinalized`
- `WithdrawalFinalized`

## Local/Dev Commands

From `contracts/`:

```bash
npm install
npm run compile
npm run test
```

Useful scripts:

- `npm run deploy:local`
- `npm run deploy-all:local`
- `npm run request-withdrawal:local`
- `npm run finalize-withdrawal:local`

## Source of Truth

For behavior details, always verify against:

- `contracts/src/Bridge2.sol`
- `contracts/src/TxKeeper.sol`
- `contracts/src/TestERC20.sol`

