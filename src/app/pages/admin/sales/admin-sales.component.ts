import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AdminWorkspaceNavComponent } from '../../../components/admin-workspace/admin-workspace-nav.component';
import {
  CollectionApiService,
  PresaleSeries,
  PresaleVoucher,
  VoucherState,
} from '../../../services/collection-api.service';
import { formatError } from '../../../utils/format-error';

@Component({
  selector: 'solslot-admin-sales',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminWorkspaceNavComponent],
  template: `
    <solslot-admin-workspace-nav />
    <main class="sales-desk">
      <header>
        <div>
          <span class="eyebrow">Customer activity</span>
          <h1>Sales & refunds</h1>
          <p>See what customers paid, what was delivered, and what still needs attention.</p>
        </div>
        <div class="actions">
          <button type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
        </div>
      </header>

      @if (error()) {
        <div class="notice notice--error" role="alert">{{ error() }}</div>
      }

      <section class="summary" aria-label="Sales summary">
        <div><span>Reservations</span><strong>{{ vouchers().length }}</strong></div>
        <div><span>Delivered</span><strong>{{ count('REDEEMED') }}</strong></div>
        <div><span>Refunded</span><strong>{{ count('REFUNDED') }}</strong></div>
        <div><span>Processing</span><strong>{{ processingCount() }}</strong></div>
      </section>

      @if (loading()) {
        <div class="empty">Loading voucher and settlement state...</div>
      } @else if (!series().length) {
        <div class="empty">
          <strong>No presale campaign yet</strong>
          <span>Refundable voucher campaigns created from a collection will appear here.</span>
        </div>
      } @else {
        @for (campaign of series(); track campaign.termsHash) {
          <section class="campaign">
            <div class="campaign-heading">
              <div>
                <span class="eyebrow">{{ campaign.state }}</span>
                <h2>{{ campaign.terms.collectionWorkspaceId }}</h2>
                <p>{{ campaign.vouchers.length }} of {{ campaign.terms.inventoryCap }} deeds reserved</p>
              </div>
              <a [routerLink]="['/admin/collections', campaign.terms.collectionWorkspaceId]">
                Open collection
              </a>
            </div>
            @if (!campaign.vouchers.length) {
              <p class="campaign-empty">No confirmed reservations.</p>
            } @else {
              <div class="voucher-table" role="table" aria-label="Voucher fulfillment">
                <div class="table-head" role="row">
                  <span>Deed</span><span>Payment</span><span>Vault</span><span>Status</span><span>Updated</span>
                </div>
                @for (voucher of campaign.vouchers; track voucher.serial) {
                  <article role="row">
                    <span>
                      <strong>#{{ voucher.serial }}</strong>
                      <small>{{ short(voucher.deedLauncherId) }}</small>
                    </span>
                    <span>
                      <strong>{{ paymentAmount(voucher) }}</strong>
                      <small>{{ paymentRail(voucher) }}</small>
                    </span>
                    <span>
                      <strong>{{ short(voucher.vaultLauncherId) }}</strong>
                      <small>Approved vault</small>
                    </span>
                    <span>
                      <strong [class]="statusClass(voucher.state)">{{ statusLabel(voucher.state) }}</strong>
                      <small>{{ stateHelp(voucher.state) }}</small>
                    </span>
                    <time>{{ voucher.updatedAt * 1000 | date: 'MMM d, h:mm a' }}</time>
                  </article>
                }
              </div>
            }
          </section>
        }
      }

      <aside class="guardrail">
        <strong>Customer terms cannot be changed here</strong>
        <span>
          The approved vault, payment, and SmartDeed are fixed when the reservation confirms.
          This page can monitor or retry the same result, never redirect it.
        </span>
      </aside>
    </main>
  `,
  styles: [
    `
      :host { display:block; min-height:100vh; background:#06110f; color:#eefbf5; }
      .sales-desk { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:42px 0 80px; }
      header,.campaign-heading,.actions { display:flex; align-items:center; justify-content:space-between; gap:16px; }
      header { align-items:flex-end; padding-bottom:22px; border-bottom:1px solid #245144; }
      .eyebrow { color:#67e7ad; font:700 11px monospace; text-transform:uppercase; }
      h1,h2 { letter-spacing:0; } h1 { margin:7px 0; font-size:34px; } h2 { margin:5px 0; font-size:21px; }
      p,small,.guardrail span { color:#a9c2b8; }
      .actions a,.actions button,.campaign-heading a { border:1px solid #4f8d77; background:#123329; color:white; padding:9px 12px; text-decoration:none; cursor:pointer; }
      .summary { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; margin-top:20px; border:1px solid #245144; background:#245144; }
      .summary div { display:grid; gap:5px; padding:15px; background:#0a1a16; }
      .summary span { color:#8fb5a6; font-size:11px; } .summary strong { font-size:23px; }
      .campaign { margin-top:18px; border:1px solid #245144; background:#0a1a16; }
      .campaign-heading { padding:18px; } .campaign-heading p { margin:3px 0 0; font-size:12px; }
      .voucher-table { border-top:1px solid #245144; }
      .table-head,.voucher-table article { display:grid; grid-template-columns:1fr 1fr 1.2fr 1.2fr .8fr; gap:12px; align-items:center; padding:11px 14px; }
      .table-head { color:#8fb5a6; background:#081612; font:10px monospace; text-transform:uppercase; }
      .voucher-table article { border-top:1px solid #18392f; }
      .voucher-table article > span { display:grid; gap:3px; min-width:0; } .voucher-table small { overflow:hidden; text-overflow:ellipsis; }
      time { color:#77998c; font:11px monospace; }
      .status { color:#e8c66a; } .status--done { color:#67e7ad; } .status--attention { color:#ffb49f; }
      .empty,.campaign-empty { display:grid; place-content:center; min-height:160px; text-align:center; color:#a9c2b8; }
      .guardrail { display:grid; grid-template-columns:auto 1fr; gap:12px; margin-top:18px; padding:14px; border-left:3px solid #67e7ad; background:#0a1a16; font-size:12px; }
      .notice--error { margin-top:16px; padding:12px; border:1px solid #844f4f; color:#ffc4c4; }
      @media (max-width:780px) { .summary { grid-template-columns:repeat(2,1fr); } .table-head { display:none; } .voucher-table article { grid-template-columns:1fr 1fr; } .voucher-table article > span:nth-child(3) { grid-column:1/-1; } header { align-items:flex-start; flex-direction:column; } }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSalesComponent {
  private readonly api = inject(CollectionApiService);
  readonly series = signal<PresaleSeries[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly vouchers = computed(() => this.series().flatMap((campaign) => campaign.vouchers));
  readonly processingCount = computed(
    () => this.vouchers().filter((voucher) => !['REDEEMED', 'REFUNDED', 'ESCROWED'].includes(voucher.state)).length,
  );

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.series.set(await this.api.listPresales());
    } catch (error) {
      this.error.set(formatError(error));
    } finally {
      this.loading.set(false);
    }
  }

  count(state: VoucherState): number {
    return this.vouchers().filter((voucher) => voucher.state === state).length;
  }

  paymentAmount(voucher: PresaleVoucher): string {
    if (voucher.paymentRail === 'BASE_SEPOLIA_USDC') {
      return `$${(voucher.paymentPrincipal / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
    }
    return `${(voucher.paymentPrincipal / 1_000_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 12 })} XCH`;
  }

  paymentRail(voucher: PresaleVoucher): string {
    return voucher.paymentRail === 'BASE_SEPOLIA_USDC' ? 'Base Sepolia USDC' : 'Testnet11 XCH';
  }

  statusLabel(state: VoucherState): string {
    const labels: Record<VoucherState, string> = {
      PENDING_ISSUANCE: 'Preparing receipt',
      ISSUANCE_SUBMITTED: 'Receipt submitted',
      ESCROWED: 'Refundable',
      REFUNDING: 'Refund processing',
      REFUNDED: 'Refunded',
      REDEEMING: 'Delivering deed',
      REDEEMED: 'Deed delivered',
    };
    return labels[state];
  }

  stateHelp(state: VoucherState): string {
    if (state === 'ESCROWED') return 'Funds remain protected';
    if (state === 'REDEEMED') return 'SmartDeed confirmed';
    if (state === 'REFUNDED') return 'Exact paid asset returned';
    return 'Deterministic processing';
  }

  statusClass(state: VoucherState): string {
    if (state === 'REDEEMED' || state === 'REFUNDED') return 'status status--done';
    if (state === 'REFUNDING' || state === 'REDEEMING') return 'status status--attention';
    return 'status';
  }

  short(value: string): string {
    return value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-7)}` : value;
  }
}
