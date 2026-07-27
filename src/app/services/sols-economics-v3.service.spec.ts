import fixtureJson from './sols-economics-v3.fixtures.json';

import {
  BOOTSTRAP_VALUE_MICRO_USD_PER_SOLS,
  MAX_EXCHANGE_FEE_BPS,
  SolsEconomicState,
  SolsEconomicStateInput,
  SolsEconomicsV3Service,
} from './sols-economics-v3.service';

interface FixtureState {
  bootstrap_complete: boolean;
  inventory_nav_micro_usd: string;
  treasury_assets_micro_usd: string;
  proven_liabilities_micro_usd: string;
  deed_count: string;
  total_sols_mojos: string;
  reserve_sols_mojos: string;
  backing_micro_usd: string;
  circulating_sols_mojos: string;
  nav_micro_usd_per_sols: {
    numerator: string;
    denominator: string;
  } | null;
}

interface FixtureSection {
  inputs: {
    state: FixtureState;
    deed_value_micro_usd: string;
  };
  expected: Record<string, unknown>;
}

interface SolsFixture {
  schema: string;
  constants: Record<string, string>;
  permanent_invariants: string[];
  base_state: FixtureState;
  bootstrap_deed_to_sols: FixtureSection;
  bootstrap_rounding: FixtureSection;
  dynamic_deed_to_sols_reserve_first: FixtureSection;
  dynamic_deed_to_sols_exact_mint: FixtureSection;
  sols_to_deed: FixtureSection;
  treasury_contribution: {
    inputs: { state: FixtureState; amount_micro_usd: string };
    expected_state: FixtureState;
  };
  zero_backing_pause: {
    inputs: {
      state: FixtureState;
      proven_liabilities_micro_usd: string;
    };
    expected_state: FixtureState;
  };
  collection_revaluation: {
    inputs: {
      state: FixtureState;
      previous_collection_inventory_micro_usd: string;
      next_collection_inventory_micro_usd: string;
    };
    expected_state: FixtureState;
  };
  settlement_allocation: {
    inputs: {
      total_micro_usd: string;
      shares: Array<{ deed_id: string; share_ppm: string }>;
    };
    expected: Array<{
      deed_id: string;
      share_ppm: string;
      amount_micro_usd: string;
    }>;
  };
  settlement_tie_break: SolsFixture['settlement_allocation'];
}

const fixture = fixtureJson as SolsFixture;

function stateInput(value: FixtureState): SolsEconomicStateInput {
  return {
    bootstrapComplete: value.bootstrap_complete,
    inventoryNavMicroUsd: value.inventory_nav_micro_usd,
    treasuryAssetsMicroUsd: value.treasury_assets_micro_usd,
    provenLiabilitiesMicroUsd: value.proven_liabilities_micro_usd,
    deedCount: value.deed_count,
    totalSolsMojos: value.total_sols_mojos,
    reserveSolsMojos: value.reserve_sols_mojos,
  };
}

function expectState(
  service: SolsEconomicsV3Service,
  actual: SolsEconomicState,
  expected: FixtureState,
): void {
  expect(actual).toEqual({
    bootstrapComplete: expected.bootstrap_complete,
    inventoryNavMicroUsd: BigInt(expected.inventory_nav_micro_usd),
    treasuryAssetsMicroUsd: BigInt(expected.treasury_assets_micro_usd),
    provenLiabilitiesMicroUsd: BigInt(expected.proven_liabilities_micro_usd),
    deedCount: BigInt(expected.deed_count),
    totalSolsMojos: BigInt(expected.total_sols_mojos),
    reserveSolsMojos: BigInt(expected.reserve_sols_mojos),
  });
  expect(service.backingMicroUsd(actual)).toBe(
    BigInt(expected.backing_micro_usd),
  );
  expect(service.circulatingSolsMojos(actual)).toBe(
    BigInt(expected.circulating_sols_mojos),
  );
  if (expected.nav_micro_usd_per_sols) {
    expect(service.navMicroUsdPerSols(actual)).toEqual({
      numerator: BigInt(expected.nav_micro_usd_per_sols.numerator),
      denominator: BigInt(expected.nav_micro_usd_per_sols.denominator),
    });
  }
}

describe('SolsEconomicsV3Service cross-language fixtures', () => {
  let service: SolsEconomicsV3Service;

  beforeEach(() => {
    service = new SolsEconomicsV3Service();
  });

  it('pins the approved schema and permanent limits', () => {
    expect(fixture.schema).toBe('solslot.sols-economics.v3');
    expect(BOOTSTRAP_VALUE_MICRO_USD_PER_SOLS).toBe(
      BigInt(fixture.constants['bootstrap_value_micro_usd_per_sols']),
    );
    expect(MAX_EXCHANGE_FEE_BPS).toBe(
      BigInt(fixture.constants['max_exchange_fee_bps']),
    );
    expect(fixture.permanent_invariants).toContain('no-sols-melt');
    expect(fixture.permanent_invariants).toContain(
      'protocol-only-smartdeed-sols-swaps',
    );
  });

  it('matches Python bootstrap and seller rounding', () => {
    for (const section of [
      fixture.bootstrap_deed_to_sols,
      fixture.bootstrap_rounding,
    ]) {
      const quote = service.quoteDeedToSols({
        state: stateInput(section.inputs.state),
        deedValueMicroUsd: section.inputs.deed_value_micro_usd,
      });
      const expected = section.expected as {
        deed_value_micro_usd: string;
        seller_sols_mojos: string;
        reserve_sols_mojos_paid: string;
        fresh_sols_mojos_minted: string;
        used_bootstrap_price: boolean;
        next_state: FixtureState;
      };
      expect(quote.deedValueMicroUsd).toBe(
        BigInt(expected.deed_value_micro_usd),
      );
      expect(quote.sellerSolsMojos).toBe(
        BigInt(expected.seller_sols_mojos),
      );
      expect(quote.reserveSolsMojosPaid).toBe(
        BigInt(expected.reserve_sols_mojos_paid),
      );
      expect(quote.freshSolsMojosMinted).toBe(
        BigInt(expected.fresh_sols_mojos_minted),
      );
      expect(quote.usedBootstrapPrice).toBe(expected.used_bootstrap_price);
      expectState(service, quote.nextState, expected.next_state);
    }
  });

  it('matches Python reserve-first and exact-shortfall deposits', () => {
    for (const section of [
      fixture.dynamic_deed_to_sols_reserve_first,
      fixture.dynamic_deed_to_sols_exact_mint,
    ]) {
      const quote = service.quoteDeedToSols({
        state: stateInput(section.inputs.state),
        deedValueMicroUsd: section.inputs.deed_value_micro_usd,
      });
      const expected = section.expected as {
        seller_sols_mojos: string;
        reserve_sols_mojos_paid: string;
        fresh_sols_mojos_minted: string;
        next_state: FixtureState;
      };
      expect(quote.sellerSolsMojos).toBe(
        BigInt(expected.seller_sols_mojos),
      );
      expect(quote.reserveSolsMojosPaid).toBe(
        BigInt(expected.reserve_sols_mojos_paid),
      );
      expect(quote.freshSolsMojosMinted).toBe(
        BigInt(expected.fresh_sols_mojos_minted),
      );
      expectState(service, quote.nextState, expected.next_state);
    }
  });

  it('matches Python no-melt deed purchase and fee split', () => {
    const section = fixture.sols_to_deed;
    const quote = service.quoteSolsToDeed({
      state: stateInput(section.inputs.state),
      deedValueMicroUsd: section.inputs.deed_value_micro_usd,
    });
    const expected = section.expected as {
      principal_sols_mojos: string;
      buyer_total_sols_mojos: string;
      fee_split: {
        total_fee_sols_mojos: string;
        protocol_fee_sols_mojos: string;
        sgt_rewards_fee_sols_mojos: string;
      };
      next_state: FixtureState;
    };
    expect(quote.principalSolsMojos).toBe(
      BigInt(expected.principal_sols_mojos),
    );
    expect(quote.buyerTotalSolsMojos).toBe(
      BigInt(expected.buyer_total_sols_mojos),
    );
    expect(quote.feeSplit).toEqual({
      totalFeeSolsMojos: BigInt(expected.fee_split.total_fee_sols_mojos),
      protocolFeeSolsMojos: BigInt(
        expected.fee_split.protocol_fee_sols_mojos,
      ),
      sgtRewardsFeeSolsMojos: BigInt(
        expected.fee_split.sgt_rewards_fee_sols_mojos,
      ),
    });
    expectState(service, quote.nextState, expected.next_state);
  });

  it('matches contribution, liability, and collection revaluation states', () => {
    const contribution = service.contributeTreasuryAssets(
      stateInput(fixture.treasury_contribution.inputs.state),
      fixture.treasury_contribution.inputs.amount_micro_usd,
    );
    expectState(
      service,
      contribution,
      fixture.treasury_contribution.expected_state,
    );

    const zeroBacking = service.setProvenLiabilities(
      stateInput(fixture.zero_backing_pause.inputs.state),
      fixture.zero_backing_pause.inputs.proven_liabilities_micro_usd,
    );
    expectState(
      service,
      zeroBacking,
      fixture.zero_backing_pause.expected_state,
    );
    expect(() =>
      service.quoteDeedToSols({
        state: zeroBacking,
        deedValueMicroUsd: 166_500_000n,
      }),
    ).toThrowError(/backing must be positive/);

    const revalued = service.revaluePoolInventory({
      state: stateInput(fixture.collection_revaluation.inputs.state),
      previousCollectionInventoryMicroUsd:
        fixture.collection_revaluation.inputs
          .previous_collection_inventory_micro_usd,
      nextCollectionInventoryMicroUsd:
        fixture.collection_revaluation.inputs
          .next_collection_inventory_micro_usd,
    });
    expectState(
      service,
      revalued,
      fixture.collection_revaluation.expected_state,
    );
  });

  it('matches Python largest-remainder settlement allocation', () => {
    for (const section of [
      fixture.settlement_allocation,
      fixture.settlement_tie_break,
    ]) {
      const allocations = service.allocateSettlement(
        section.inputs.total_micro_usd,
        section.inputs.shares.map((item) => ({
          deedId: item.deed_id,
          sharePpm: item.share_ppm,
        })),
      );
      expect(
        allocations.map((item) => ({
          deed_id: item.deedId,
          share_ppm: item.sharePpm.toString(),
          amount_micro_usd: item.amountMicroUsd.toString(),
        })),
      ).toEqual(section.expected);
    }
  });

  it('rejects fees above the permanent cap', () => {
    expect(() =>
      service.feeSplitForPrincipal(50_000n, 101n, 31n, 70n),
    ).toThrowError(/permanent 1% cap/);
  });
});
