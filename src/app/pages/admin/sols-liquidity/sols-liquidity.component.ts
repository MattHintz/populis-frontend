import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AdminWorkspaceNavComponent } from '../../../components/admin-workspace/admin-workspace-nav.component';
import {
  SolsLiquidityVenue,
  SolsMarketApiService,
  SolsMarketOpportunity,
  SolsMarketSnapshot,
} from '../../../services/sols-market-api.service';
import { formatError } from '../../../utils/format-error';

interface VenueCandidate {
  name: string;
  scope: string;
  status: string;
  summary: string;
  requirements: string[];
}

@Component({
  selector: 'solslot-admin-sols-liquidity',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminWorkspaceNavComponent],
  template: `
    <solslot-admin-workspace-nav />
    <main class="liquidity-desk">
      <header>
        <div>
          <span class="eyebrow">Secondary market</span>
          <h1>SOLS liquidity</h1>
          <p>
            See SmartDeeds available for SOLS and the external pools approved by SGT holders.
          </p>
        </div>
        <button type="button" (click)="reload()" [disabled]="loading()">
          {{ loading() ? 'Checking...' : 'Refresh' }}
        </button>
      </header>

      @if (error()) {
        <div class="notice notice--error" role="alert">
          <strong>Liquidity verification failed closed</strong>
          <span>{{ error() }}</span>
        </div>
      }

      <section class="status-band" aria-label="SOLS market status">
        <div>
          <span>Customer market</span>
          <strong>{{ market()?.outcome || 'Checking' }}</strong>
        </div>
        <div>
          <span>SmartDeeds available</span>
          <strong>{{ market()?.verifiedOpportunityCount ?? 0 }}</strong>
        </div>
        <div>
          <span>Governed venues</span>
          <strong>{{ activeVenues().length }}</strong>
        </div>
        <div>
          <span>Registry version</span>
          <strong>{{ market()?.statutes?.registryVersion ?? 'Waiting' }}</strong>
        </div>
      </section>

      <section class="market-panel" aria-labelledby="market-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Protocol market</span>
            <h2 id="market-title">{{ market()?.title || 'Reading Pool V4' }}</h2>
            <p>{{ market()?.body || 'Waiting for chain-authoritative market state.' }}</p>
          </div>
          <span [class]="'state state--' + (market()?.outcome || 'WAITING').toLowerCase()">
            {{ market()?.outcome || 'Waiting' }}
          </span>
        </div>

        @if (market()?.pool; as pool) {
          <div class="pool-version">Pool V4 state</div>
          <dl class="metrics">
            <div><dt>SmartDeeds held</dt><dd>{{ poolNumber(pool, 'deedCount') }}</dd></div>
            <div><dt>Total SOLS</dt><dd>{{ formatSols(poolString(pool, 'totalSolsMojos')) }}</dd></div>
            <div><dt>Swap reserve</dt><dd>{{ formatSols(poolString(pool, 'reserveSolsMojos')) }}</dd></div>
            <div><dt>Governed value</dt><dd>{{ formatMicroUsd(poolString(pool, 'inventoryNavMicroUsd')) }}</dd></div>
          </dl>
        } @else {
          <div class="empty">
            The protocol market is waiting for its confirmed launch state.
          </div>
        }

        @if (opportunities().length) {
          <div class="opportunity-list">
            @for (opportunity of opportunities(); track opportunity.deedLauncherId) {
              <article>
                <div>
                  <span class="eyebrow">Chain verified</span>
                  <strong>{{ opportunity.collectionTitle }}</strong>
                  <small>{{ opportunity.sharePpm / 10_000 | number: '1.0-2' }}% share</small>
                </div>
                <dl>
                  <div><dt>Governed value</dt><dd>{{ formatMicroUsd(opportunity.deedValueMicroUsd) }}</dd></div>
                  <div><dt>Customer total</dt><dd>{{ formatSols(opportunity.totalSolsMojos) }} SOLS</dd></div>
                </dl>
              </article>
            }
          </div>
        }
      </section>

      <section class="venue-panel" aria-labelledby="venue-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">External liquidity</span>
            <h2 id="venue-title">Governed venues</h2>
            <p>
              Solslot uses only pools that are active under the current governed rules.
            </p>
          </div>
          <a routerLink="/committee">Open SGT committee</a>
        </div>

        @if (activeVenues().length) {
          <div class="venue-list">
            @for (venue of activeVenues(); track venue.venueId) {
              <article>
                <span class="state state--ready">On-chain active</span>
                <div>
                  <strong>Trusted venue {{ shortHex(venue.venueId) }}</strong>
                  <small>Pool {{ shortHex(venue.poolId) }}</small>
                </div>
                <details>
                  <summary>On-chain evidence</summary>
                  <dl>
                    <div><dt>Chain</dt><dd>{{ venue.chainId }}</dd></div>
                    <div><dt>Protocol</dt><dd>{{ venue.protocolId }}</dd></div>
                    <div><dt>Factory</dt><dd>{{ venue.factoryId }}</dd></div>
                    <div><dt>Base asset</dt><dd>{{ venue.baseAssetId }}</dd></div>
                    <div><dt>Quote asset</dt><dd>{{ venue.quoteAssetId }}</dd></div>
                    <div><dt>Code hash</dt><dd>{{ venue.poolCodeHash }}</dd></div>
                  </dl>
                </details>
              </article>
            }
          </div>
        } @else {
          <div class="empty">
            <strong>No external venue is trusted yet</strong>
            <span>
              SOLS remains transferable. External routing stays disabled until an exact pool is
              deployed, verified, proposed, and approved by SGT holders.
            </span>
          </div>
        }
      </section>

      <section class="candidate-panel" aria-labelledby="candidate-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Venue roadmap</span>
            <h2 id="candidate-title">Pools being evaluated</h2>
          </div>
        </div>
        <div class="candidate-grid">
          @for (candidate of candidates; track candidate.name) {
            <article>
              <div class="candidate-head">
                <span class="state">{{ candidate.status }}</span>
                <strong>{{ candidate.name }}</strong>
              </div>
              <small>{{ candidate.scope }}</small>
              <p>{{ candidate.summary }}</p>
              <ul>
                @for (requirement of candidate.requirements; track requirement) {
                  <li>{{ requirement }}</li>
                }
              </ul>
            </article>
          }
        </div>
      </section>

      <aside>
        <strong>Community pools are separate from approved Solslot routes</strong>
        <span>
          A community may create another pool without Solslot approval. It remains community-run:
          no trusted badge, no automatic routing, and no authority inherited from a token symbol,
          website, or router name.
        </span>
      </aside>
    </main>
  `,
  styles: [
    `
      :host { display:block; min-height:100vh; background:#06110f; color:#eefbf5; }
      .liquidity-desk { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:42px 0 80px; }
      header,.section-heading,.candidate-head { display:flex; align-items:center; justify-content:space-between; gap:16px; }
      header { align-items:flex-end; padding-bottom:22px; border-bottom:1px solid #245144; }
      header > div { display:grid; gap:6px; } .back-link { color:#8bf0bd; font-size:12px; text-decoration:none; }
      .eyebrow { color:#67e7ad; font:700 10px/1.2 monospace; text-transform:uppercase; }
      h1,h2 { margin:0; letter-spacing:0; } h1 { font-size:36px; } h2 { font-size:22px; }
      p,small,li,.empty span,aside span { color:#a9c2b8; } p { margin:0; }
      button,.section-heading > a { border:1px solid #4f8d77; background:#123329; color:white; padding:9px 12px; text-decoration:none; cursor:pointer; }
      button:disabled { opacity:.55; cursor:not-allowed; }
      .status-band { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1px; margin-top:20px; border:1px solid #245144; background:#245144; }
      .status-band > div { display:grid; gap:5px; padding:14px; background:#081612; }
      .status-band span,dt { color:#8fb5a6; font:700 10px monospace; text-transform:uppercase; }
      .status-band strong { font-size:18px; }
      .market-panel,.venue-panel,.candidate-panel { margin-top:16px; padding:20px; border:1px solid #245144; background:#0a1a16; }
      .section-heading { align-items:flex-start; } .section-heading > div { display:grid; gap:5px; }
      .state { width:max-content; padding:4px 7px; border:1px solid #4f8d77; color:#c1d9d0; font:700 10px monospace; text-transform:uppercase; }
      .state--ready { color:#67e7ad; } .state--locked,.state--paused { color:#ffb49f; border-color:#844f4f; }
      .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1px; margin:17px 0 0; background:#245144; }
      .pool-version { margin-top:17px; color:#67e7ad; font:700 10px monospace; text-transform:uppercase; }
      .pool-version + .metrics { margin-top:7px; }
      .metrics > div { padding:13px; background:#081612; } dd { margin:4px 0 0; overflow-wrap:anywhere; }
      .opportunity-list,.venue-list { display:grid; gap:1px; margin-top:16px; background:#245144; }
      .opportunity-list article { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:20px; padding:14px; background:#081612; }
      .opportunity-list article > div { display:grid; gap:4px; }
      .opportunity-list dl { display:grid; grid-template-columns:repeat(2,minmax(120px,1fr)); gap:18px; margin:0; }
      .venue-list article { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:14px; align-items:start; padding:14px; background:#081612; }
      .venue-list article > div { display:grid; gap:4px; }
      details { color:#a9c2b8; font-size:11px; } summary { cursor:pointer; color:#eefbf5; }
      details dl { display:grid; gap:5px; max-width:520px; } details dd { font:10px/1.4 monospace; }
      .candidate-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:16px; }
      .candidate-grid article { padding:15px; border:1px solid #245144; background:#081612; }
      .candidate-head { justify-content:flex-start; align-items:flex-start; flex-direction:column; }
      .candidate-grid p { margin-top:9px; font-size:13px; } .candidate-grid ul { display:grid; gap:5px; padding-left:17px; font-size:12px; }
      .empty { display:grid; gap:4px; margin-top:16px; padding:16px; border:1px solid #245144; background:#081612; }
      aside { display:grid; grid-template-columns:auto minmax(0,1fr); gap:14px; margin-top:16px; padding:15px; border-left:3px solid #67e7ad; background:#0a1a16; }
      .notice { display:grid; gap:4px; margin-top:16px; padding:12px; } .notice--error { border:1px solid #844f4f; color:#ffc4c4; }
      @media (max-width:850px) { .status-band,.metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .candidate-grid { grid-template-columns:1fr; } }
      @media (max-width:620px) { header,.section-heading { align-items:flex-start; flex-direction:column; } .status-band,.metrics { grid-template-columns:1fr; } .opportunity-list article,.venue-list article { grid-template-columns:1fr; } .opportunity-list dl { grid-template-columns:1fr 1fr; } aside { grid-template-columns:1fr; } }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SolsLiquidityComponent implements OnInit {
  private readonly api = inject(SolsMarketApiService);

  readonly market = signal<SolsMarketSnapshot | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly candidates: VenueCandidate[] = [
    {
      name: 'Uniswap V3',
      scope: 'Base Sepolia alpha',
      status: 'Recommended',
      summary: 'The first EVM venue after Wrapped SOLS exists.',
      requirements: [
        'Official Base Sepolia factory.',
        'Circle test USDC paired with the deployed Wrapped SOLS.',
        'Exact pool address and runtime code hash approved by SGT.',
      ],
    },
    {
      name: 'Aerodrome',
      scope: 'Base mainnet beta',
      status: 'Later beta',
      summary: 'A Base-native community venue after the alpha bridge route is proven.',
      requirements: [
        'Official production deployment only.',
        'No unofficial Base Sepolia substitute.',
        'Independent exact-pool SGT approval.',
      ],
    },
    {
      name: 'TibetSwap',
      scope: 'Native Chia mainnet',
      status: 'Native route',
      summary: 'CAT/XCH liquidity for SOLS that has not crossed the bridge.',
      requirements: [
        'Native SOLS CAT paired through a reviewed pool.',
        'Exact launcher and puzzle code evidence.',
        'No Testnet11 trust claim without a real test venue.',
      ],
    },
  ];

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    if (this.loading() && this.market()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const market = await this.api.readMarket();
      if (market.schemaVersion !== 2) {
        throw new Error('The deployed API does not expose the RC22 SOLS market schema.');
      }
      this.market.set(market);
    } catch (error) {
      this.market.set(null);
      this.error.set(formatError(error));
    } finally {
      this.loading.set(false);
    }
  }

  activeVenues(): SolsLiquidityVenue[] {
    return (this.market()?.statutes?.liquidityVenues ?? []).filter((venue) => venue.active);
  }

  opportunities(): SolsMarketOpportunity[] {
    return this.market()?.opportunities.filter((item) => item.chainVerified === true) ?? [];
  }

  poolString(pool: Record<string, unknown>, key: string): string {
    const value = pool[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '0';
  }

  poolNumber(pool: Record<string, unknown>, key: string): string {
    return Number(this.poolString(pool, key)).toLocaleString('en-US');
  }

  formatSols(value: string): string {
    return formatFixed(value, 12, 6);
  }

  formatMicroUsd(value: string): string {
    return `$${formatFixed(value, 6, 2)}`;
  }

  shortHex(value: string): string {
    return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
  }
}

function formatFixed(value: string, decimals: number, visibleDecimals: number): string {
  const amount = BigInt(value || '0');
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, '0');
  const visible = fraction.slice(0, visibleDecimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}${visible ? `.${visible}` : ''}`;
}
