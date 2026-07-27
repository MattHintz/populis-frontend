import { Injectable } from '@angular/core';

export type BigintLike = bigint | number | string;

export const USD_MICRO_PER_DOLLAR = 1_000_000n;
export const SOLS_MOJOS_PER_SOLS = 1_000n;
export const BOOTSTRAP_VALUE_MICRO_USD_PER_SOLS = 3_330_000n;
export const SHARE_PPM_DENOMINATOR = 1_000_000n;
export const FEE_BPS_DENOMINATOR = 10_000n;
export const DEFAULT_EXCHANGE_FEE_BPS = 100n;
export const DEFAULT_PROTOCOL_FEE_BPS = 30n;
export const DEFAULT_SGT_REWARDS_FEE_BPS = 70n;
export const MAX_EXCHANGE_FEE_BPS = 100n;

export interface SolsEconomicStateInput {
  bootstrapComplete: boolean;
  inventoryNavMicroUsd: BigintLike;
  treasuryAssetsMicroUsd: BigintLike;
  provenLiabilitiesMicroUsd: BigintLike;
  deedCount: BigintLike;
  totalSolsMojos: BigintLike;
  reserveSolsMojos: BigintLike;
}

export interface SolsEconomicState {
  bootstrapComplete: boolean;
  inventoryNavMicroUsd: bigint;
  treasuryAssetsMicroUsd: bigint;
  provenLiabilitiesMicroUsd: bigint;
  deedCount: bigint;
  totalSolsMojos: bigint;
  reserveSolsMojos: bigint;
}

export interface ExactFraction {
  numerator: bigint;
  denominator: bigint;
}

export interface SolsFeeSplit {
  totalFeeSolsMojos: bigint;
  protocolFeeSolsMojos: bigint;
  sgtRewardsFeeSolsMojos: bigint;
}

export interface DeedToSolsQuote {
  deedValueMicroUsd: bigint;
  sellerSolsMojos: bigint;
  reserveSolsMojosPaid: bigint;
  freshSolsMojosMinted: bigint;
  usedBootstrapPrice: boolean;
  nextState: SolsEconomicState;
}

export interface SolsToDeedQuote {
  deedValueMicroUsd: bigint;
  principalSolsMojos: bigint;
  feeSplit: SolsFeeSplit;
  buyerTotalSolsMojos: bigint;
  nextState: SolsEconomicState;
}

export interface SettlementShareInput {
  deedId: string;
  sharePpm: BigintLike;
}

export interface SettlementAllocation {
  deedId: string;
  sharePpm: bigint;
  amountMicroUsd: bigint;
}

function toBigInt(value: BigintLike): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error('number inputs must be safe integers');
  }
  return BigInt(value);
}

function assertNonNegative(label: string, value: bigint): void {
  if (value < 0n) throw new Error(`${label} must be non-negative`);
}

function floorDiv(numerator: bigint, denominator: bigint): bigint {
  assertNonNegative('numerator', numerator);
  if (denominator <= 0n) throw new Error('denominator must be positive');
  return numerator / denominator;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  assertNonNegative('numerator', numerator);
  if (denominator <= 0n) throw new Error('denominator must be positive');
  return (numerator + denominator - 1n) / denominator;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

@Injectable({ providedIn: 'root' })
export class SolsEconomicsV3Service {
  normaliseState(input: SolsEconomicStateInput): SolsEconomicState {
    const state: SolsEconomicState = {
      bootstrapComplete: input.bootstrapComplete,
      inventoryNavMicroUsd: toBigInt(input.inventoryNavMicroUsd),
      treasuryAssetsMicroUsd: toBigInt(input.treasuryAssetsMicroUsd),
      provenLiabilitiesMicroUsd: toBigInt(input.provenLiabilitiesMicroUsd),
      deedCount: toBigInt(input.deedCount),
      totalSolsMojos: toBigInt(input.totalSolsMojos),
      reserveSolsMojos: toBigInt(input.reserveSolsMojos),
    };
    assertNonNegative('inventoryNavMicroUsd', state.inventoryNavMicroUsd);
    assertNonNegative('treasuryAssetsMicroUsd', state.treasuryAssetsMicroUsd);
    assertNonNegative('provenLiabilitiesMicroUsd', state.provenLiabilitiesMicroUsd);
    assertNonNegative('deedCount', state.deedCount);
    assertNonNegative('totalSolsMojos', state.totalSolsMojos);
    assertNonNegative('reserveSolsMojos', state.reserveSolsMojos);
    if (state.reserveSolsMojos > state.totalSolsMojos) {
      throw new Error('reserveSolsMojos cannot exceed totalSolsMojos');
    }
    if (state.deedCount === 0n && state.inventoryNavMicroUsd !== 0n) {
      throw new Error('inventory NAV requires at least one pool-held deed');
    }
    if (
      !state.bootstrapComplete &&
      (state.deedCount !== 0n ||
        state.inventoryNavMicroUsd !== 0n ||
        state.totalSolsMojos !== 0n ||
        state.reserveSolsMojos !== 0n)
    ) {
      throw new Error('an unbootstrapped pool cannot have inventory or Sols');
    }
    return state;
  }

  backingMicroUsd(input: SolsEconomicStateInput): bigint {
    const state = this.normaliseState(input);
    return (
      state.inventoryNavMicroUsd +
      state.treasuryAssetsMicroUsd -
      state.provenLiabilitiesMicroUsd
    );
  }

  circulatingSolsMojos(input: SolsEconomicStateInput): bigint {
    const state = this.normaliseState(input);
    return state.totalSolsMojos - state.reserveSolsMojos;
  }

  navMicroUsdPerSols(input: SolsEconomicStateInput): ExactFraction {
    const backing = this.backingMicroUsd(input);
    const circulating = this.circulatingSolsMojos(input);
    if (backing <= 0n) throw new Error('Sols backing must be positive');
    if (circulating <= 0n) throw new Error('circulating Sols must be positive');
    const numerator = backing * SOLS_MOJOS_PER_SOLS;
    const divisor = gcd(numerator, circulating);
    return {
      numerator: numerator / divisor,
      denominator: circulating / divisor,
    };
  }

  feeSplitForPrincipal(
    principalSolsMojos: BigintLike,
    exchangeFeeBps: BigintLike = DEFAULT_EXCHANGE_FEE_BPS,
    protocolFeeBps: BigintLike = DEFAULT_PROTOCOL_FEE_BPS,
    sgtRewardsFeeBps: BigintLike = DEFAULT_SGT_REWARDS_FEE_BPS,
  ): SolsFeeSplit {
    const principal = toBigInt(principalSolsMojos);
    const exchange = toBigInt(exchangeFeeBps);
    const protocol = toBigInt(protocolFeeBps);
    const rewards = toBigInt(sgtRewardsFeeBps);
    if (principal <= 0n) throw new Error('principalSolsMojos must be positive');
    if (exchange < 0n || exchange > MAX_EXCHANGE_FEE_BPS) {
      throw new Error('exchange fee exceeds the permanent 1% cap');
    }
    if (protocol < 0n || rewards < 0n) {
      throw new Error('fee split bps must be non-negative');
    }
    if (protocol + rewards !== exchange) {
      throw new Error('protocol and SGT reward bps must equal exchange fee bps');
    }
    const totalFeeSolsMojos = ceilDiv(
      principal * exchange,
      FEE_BPS_DENOMINATOR,
    );
    const protocolFeeSolsMojos = minBigInt(
      totalFeeSolsMojos,
      ceilDiv(principal * protocol, FEE_BPS_DENOMINATOR),
    );
    return {
      totalFeeSolsMojos,
      protocolFeeSolsMojos,
      sgtRewardsFeeSolsMojos: totalFeeSolsMojos - protocolFeeSolsMojos,
    };
  }

  quoteDeedToSols(args: {
    state: SolsEconomicStateInput;
    deedValueMicroUsd: BigintLike;
  }): DeedToSolsQuote {
    const state = this.normaliseState(args.state);
    const value = toBigInt(args.deedValueMicroUsd);
    if (value <= 0n) throw new Error('deedValueMicroUsd must be positive');
    const sellerSolsMojos = state.bootstrapComplete
      ? this.dynamicSolsForValue(state, value, false)
      : floorDiv(
          value * SOLS_MOJOS_PER_SOLS,
          BOOTSTRAP_VALUE_MICRO_USD_PER_SOLS,
        );
    if (sellerSolsMojos <= 0n) {
      throw new Error('deed value is below the minimum Sols precision');
    }
    const reserveSolsMojosPaid = minBigInt(
      state.reserveSolsMojos,
      sellerSolsMojos,
    );
    const freshSolsMojosMinted =
      sellerSolsMojos - reserveSolsMojosPaid;
    return {
      deedValueMicroUsd: value,
      sellerSolsMojos,
      reserveSolsMojosPaid,
      freshSolsMojosMinted,
      usedBootstrapPrice: !state.bootstrapComplete,
      nextState: this.normaliseState({
        bootstrapComplete: true,
        inventoryNavMicroUsd: state.inventoryNavMicroUsd + value,
        treasuryAssetsMicroUsd: state.treasuryAssetsMicroUsd,
        provenLiabilitiesMicroUsd: state.provenLiabilitiesMicroUsd,
        deedCount: state.deedCount + 1n,
        totalSolsMojos: state.totalSolsMojos + freshSolsMojosMinted,
        reserveSolsMojos: state.reserveSolsMojos - reserveSolsMojosPaid,
      }),
    };
  }

  quoteSolsToDeed(args: {
    state: SolsEconomicStateInput;
    deedValueMicroUsd: BigintLike;
    exchangeFeeBps?: BigintLike;
    protocolFeeBps?: BigintLike;
    sgtRewardsFeeBps?: BigintLike;
  }): SolsToDeedQuote {
    const state = this.normaliseState(args.state);
    const value = toBigInt(args.deedValueMicroUsd);
    if (state.deedCount <= 0n) throw new Error('pool has no SmartDeeds');
    if (value <= 0n) throw new Error('deedValueMicroUsd must be positive');
    if (value > state.inventoryNavMicroUsd) {
      throw new Error('deed value exceeds pool inventory NAV');
    }
    const principalSolsMojos = this.dynamicSolsForValue(state, value, true);
    const circulating = state.totalSolsMojos - state.reserveSolsMojos;
    if (principalSolsMojos > circulating) {
      throw new Error('deed requires more than the circulating Sols supply');
    }
    const feeSplit = this.feeSplitForPrincipal(
      principalSolsMojos,
      args.exchangeFeeBps,
      args.protocolFeeBps,
      args.sgtRewardsFeeBps,
    );
    return {
      deedValueMicroUsd: value,
      principalSolsMojos,
      feeSplit,
      buyerTotalSolsMojos:
        principalSolsMojos + feeSplit.totalFeeSolsMojos,
      nextState: this.normaliseState({
        bootstrapComplete: true,
        inventoryNavMicroUsd: state.inventoryNavMicroUsd - value,
        treasuryAssetsMicroUsd: state.treasuryAssetsMicroUsd,
        provenLiabilitiesMicroUsd: state.provenLiabilitiesMicroUsd,
        deedCount: state.deedCount - 1n,
        totalSolsMojos: state.totalSolsMojos,
        reserveSolsMojos: state.reserveSolsMojos + principalSolsMojos,
      }),
    };
  }

  contributeTreasuryAssets(
    input: SolsEconomicStateInput,
    amountMicroUsd: BigintLike,
  ): SolsEconomicState {
    const state = this.normaliseState(input);
    const amount = toBigInt(amountMicroUsd);
    if (amount <= 0n) throw new Error('amountMicroUsd must be positive');
    return this.normaliseState({
      ...state,
      treasuryAssetsMicroUsd: state.treasuryAssetsMicroUsd + amount,
    });
  }

  setProvenLiabilities(
    input: SolsEconomicStateInput,
    amountMicroUsd: BigintLike,
  ): SolsEconomicState {
    const state = this.normaliseState(input);
    const amount = toBigInt(amountMicroUsd);
    assertNonNegative('amountMicroUsd', amount);
    return this.normaliseState({
      ...state,
      provenLiabilitiesMicroUsd: amount,
    });
  }

  revaluePoolInventory(args: {
    state: SolsEconomicStateInput;
    previousCollectionInventoryMicroUsd: BigintLike;
    nextCollectionInventoryMicroUsd: BigintLike;
  }): SolsEconomicState {
    const state = this.normaliseState(args.state);
    const previous = toBigInt(args.previousCollectionInventoryMicroUsd);
    const next = toBigInt(args.nextCollectionInventoryMicroUsd);
    assertNonNegative('previousCollectionInventoryMicroUsd', previous);
    assertNonNegative('nextCollectionInventoryMicroUsd', next);
    if (previous > state.inventoryNavMicroUsd) {
      throw new Error('previous collection inventory exceeds total inventory NAV');
    }
    return this.normaliseState({
      ...state,
      inventoryNavMicroUsd: state.inventoryNavMicroUsd - previous + next,
    });
  }

  allocateSettlement(
    totalMicroUsd: BigintLike,
    shareInputs: readonly SettlementShareInput[],
  ): SettlementAllocation[] {
    const total = toBigInt(totalMicroUsd);
    if (total <= 0n) throw new Error('totalMicroUsd must be positive');
    if (shareInputs.length === 0) {
      throw new Error('settlement must contain at least one deed');
    }
    const shares = shareInputs.map((item) => ({
      deedId: item.deedId,
      sharePpm: toBigInt(item.sharePpm),
    }));
    if (shares.some((item) => item.deedId.length === 0)) {
      throw new Error('deedId must not be empty');
    }
    if (new Set(shares.map((item) => item.deedId)).size !== shares.length) {
      throw new Error('settlement deed ids must be unique');
    }
    if (shares.some((item) => item.sharePpm <= 0n)) {
      throw new Error('sharePpm must be positive');
    }
    if (
      shares.reduce((sum, item) => sum + item.sharePpm, 0n) !==
      SHARE_PPM_DENOMINATOR
    ) {
      throw new Error('settlement shares must total exactly 1000000 ppm');
    }
    const rows = shares.map((item) => {
      const numerator = total * item.sharePpm;
      return {
        ...item,
        amountMicroUsd: floorDiv(numerator, SHARE_PPM_DENOMINATOR),
        remainder: numerator % SHARE_PPM_DENOMINATOR,
      };
    });
    const allocated = rows.reduce(
      (sum, item) => sum + item.amountMicroUsd,
      0n,
    );
    const leftover = Number(total - allocated);
    const ranked = [...rows].sort((left, right) => {
      if (left.remainder !== right.remainder) {
        return left.remainder > right.remainder ? -1 : 1;
      }
      if (left.deedId === right.deedId) return 0;
      return left.deedId < right.deedId ? -1 : 1;
    });
    for (let index = 0; index < leftover; index += 1) {
      ranked[index].amountMicroUsd += 1n;
    }
    return rows.map(({ deedId, sharePpm, amountMicroUsd }) => ({
      deedId,
      sharePpm,
      amountMicroUsd,
    }));
  }

  private dynamicSolsForValue(
    input: SolsEconomicStateInput,
    valueMicroUsd: bigint,
    roundUp: boolean,
  ): bigint {
    const state = this.normaliseState(input);
    if (!state.bootstrapComplete) {
      throw new Error('dynamic pricing requires a bootstrapped pool');
    }
    if (valueMicroUsd <= 0n) throw new Error('valueMicroUsd must be positive');
    const backing = this.backingMicroUsd(state);
    const circulating = state.totalSolsMojos - state.reserveSolsMojos;
    if (backing <= 0n) throw new Error('Sols backing must be positive');
    if (circulating <= 0n) throw new Error('circulating Sols must be positive');
    const numerator = valueMicroUsd * circulating;
    return roundUp
      ? ceilDiv(numerator, backing)
      : floorDiv(numerator, backing);
  }
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
