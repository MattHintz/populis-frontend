import {
  solsMarketHealthCheck,
} from './admin-system-health.component';
import type {
  SolsMarketSnapshot,
} from '../../../services/sols-market-api.service';

describe('SOLS market health', () => {
  it('waits without the signed launch artifact', () => {
    const check = solsMarketHealthCheck(market({
      outcome: 'LOCKED',
      title: 'SOLS secondary swaps begin after protocol launch',
    }));

    expect(check.status).toBe('Waiting');
    expect(check.impact).toContain('after protocol launch');
    expect(check.route).toBe('/admin/pool-economics-v2');
  });

  it('waits when the pool has no verified customer inventory', () => {
    const check = solsMarketHealthCheck(market({
      outcome: 'WAITING',
      title: 'No SmartDeeds are available for SOLS yet',
    }));

    expect(check.status).toBe('Waiting');
    expect(check.impact).toContain('No SmartDeeds');
  });

  it('blocks when an executed candidate fails chain verification', () => {
    const check = solsMarketHealthCheck(market({
      outcome: 'READY',
      rejectedCandidateCount: 1,
      verifiedOpportunityCount: 1,
    }));

    expect(check.status).toBe('Blocked');
    expect(check.impact).toContain('failed chain verification');
  });

  it('reports healthy only for the same inventory customers can see', () => {
    const check = solsMarketHealthCheck(market({
      outcome: 'READY',
      verifiedOpportunityCount: 2,
    }));

    expect(check.status).toBe('Healthy');
    expect(check.impact).toContain('2 chain-verified SmartDeed swaps');
  });
});

function market(
  overrides: Partial<SolsMarketSnapshot> = {},
): SolsMarketSnapshot {
  return {
    schemaVersion: 1,
    network: 'testnet11',
    outcome: 'WAITING',
    title: 'Waiting for SOLS',
    body: 'Nothing is exposed until chain verification passes.',
    pool: null,
    navRegistry: null,
    opportunities: [],
    verifiedOpportunityCount: 0,
    rejectedCandidateCount: 0,
    ...overrides,
  };
}
