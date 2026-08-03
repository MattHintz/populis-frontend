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
import {
  AdminPurchaseOperation,
  AdminSalesService,
  PurchaseOperationState,
} from '../../../services/admin-sales.service';
import { formatError } from '../../../utils/format-error';

type DeskFilter = 'ALL' | 'ATTENTION' | 'IN_PROGRESS' | 'COMPLETED';

@Component({
  selector: 'solslot-admin-sales',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminWorkspaceNavComponent],
  template: `
    <solslot-admin-workspace-nav />
    <main class="sales-desk">
      <header class="page-heading">
        <div>
          <span class="eyebrow">Customer operations</span>
          <h1>Sales & fulfillment</h1>
          <p>Follow each approved payment through delivery or an exact refund.</p>
        </div>
        <button type="button" class="button" (click)="reload()" [disabled]="loading()">
          {{ loading() ? 'Checking…' : 'Refresh' }}
        </button>
      </header>

      @if (errors().length) {
        <div class="notice notice--warning" role="status">
          <strong>Some information could not be refreshed</strong>
          <span>{{ errors().join(' ') }}</span>
        </div>
      }
      <section class="summary" aria-label="Fulfillment summary">
        <button type="button" [class.is-active]="filter() === 'ALL'" (click)="filter.set('ALL')">
          <span>All activity</span><strong>{{ totalCount() }}</strong>
        </button>
        <button type="button" [class.is-active]="filter() === 'ATTENTION'" (click)="filter.set('ATTENTION')">
          <span>Needs attention</span><strong>{{ attentionCount() }}</strong>
        </button>
        <button type="button" [class.is-active]="filter() === 'IN_PROGRESS'" (click)="filter.set('IN_PROGRESS')">
          <span>In progress</span><strong>{{ inProgressCount() }}</strong>
        </button>
        <button type="button" [class.is-active]="filter() === 'COMPLETED'" (click)="filter.set('COMPLETED')">
          <span>Completed</span><strong>{{ completedCount() }}</strong>
        </button>
      </section>

      @if (loading()) {
        <div class="empty" aria-live="polite">Checking payment and chain delivery state…</div>
      } @else {
        <section class="desk-section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Direct sales</span>
              <h2>SmartDeed and SGT delivery</h2>
            </div>
            <span>{{ filteredPurchases().length }} shown</span>
          </div>

          @if (!filteredPurchases().length) {
            <div class="empty empty--small">
              <strong>No matching purchases</strong>
              <span>New approved purchases appear here as soon as their artifact is created.</span>
            </div>
          } @else {
            <div class="operation-list">
              @for (purchase of filteredPurchases(); track purchase.id) {
                <article class="operation">
                  <div class="asset">
                    <span class="asset-mark" [attr.data-kind]="purchase.deliveryKind">
                      {{ purchase.deliveryKind === 'sgt' ? 'SGT' : 'SD' }}
                    </span>
                    <span>
                      <strong>{{ purchaseTitle(purchase) }}</strong>
                      <small>{{ railLabel(purchase.rail) }} · {{ purchaseAmount(purchase) }}</small>
                    </span>
                  </div>
                  <div class="destination">
                    <span>Approved vault</span>
                    <strong [title]="purchase.vaultLauncherId">{{ short(purchase.vaultLauncherId) }}</strong>
                  </div>
                  <div class="state">
                    <strong [class]="purchaseStatusClass(purchase.state)">{{ purchaseStatus(purchase.state) }}</strong>
                    <small>{{ purchaseHelp(purchase.state) }}</small>
                  </div>
                  <time>{{ operationTime(purchase) | date: 'MMM d, h:mm a' }}</time>
                  @if (canCheckDelivery(purchase)) {
                    <button
                      type="button"
                      class="button button--compact"
                      (click)="checkDelivery(purchase)"
                      [disabled]="checkingPurchase() === purchase.purchaseId"
                    >
                      {{ checkingPurchase() === purchase.purchaseId ? 'Checking…' : 'Check delivery' }}
                    </button>
                  }
                  <details>
                    <summary>Evidence</summary>
                    <dl>
                      <div><dt>Operation</dt><dd>{{ purchase.id }}</dd></div>
                      <div><dt>Purchase</dt><dd>{{ purchase.purchaseId || 'Preparing' }}</dd></div>
                      <div><dt>Artifact</dt><dd>{{ purchase.artifactHash || 'Preparing' }}</dd></div>
                      @if (evidenceReference(purchase); as evidence) {
                        <div><dt>Settlement</dt><dd>{{ evidence }}</dd></div>
                      }
                    </dl>
                  </details>
                </article>
              }
            </div>
          }
        </section>

        <section class="desk-section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Refundable reservations</span>
              <h2>Voucher delivery and refunds</h2>
            </div>
            <span>{{ filteredVouchers().length }} shown</span>
          </div>

          @if (!filteredVouchers().length) {
            <div class="empty empty--small">
              <strong>No matching reservations</strong>
              <span>Governed presale reservations appear after confirmed payment.</span>
            </div>
          } @else {
            <div class="operation-list">
              @for (item of filteredVouchers(); track item.campaign.termsHash + ':' + item.voucher.serial) {
                <article class="operation">
                  <div class="asset">
                    <span class="asset-mark" data-kind="voucher">V</span>
                    <span>
                      <strong>Reservation #{{ item.voucher.serial }}</strong>
                      <small>{{ voucherPaymentAmount(item.voucher) }} · {{ voucherRail(item.voucher) }}</small>
                    </span>
                  </div>
                  <div class="destination">
                    <span>Approved vault</span>
                    <strong [title]="item.voucher.vaultLauncherId">{{ short(item.voucher.vaultLauncherId) }}</strong>
                  </div>
                  <div class="state">
                    <strong [class]="voucherStatusClass(item.voucher.state)">{{ voucherStatus(item.voucher.state) }}</strong>
                    <small>{{ voucherHelp(item.voucher.state) }}</small>
                  </div>
                  <time>{{ item.voucher.updatedAt * 1000 | date: 'MMM d, h:mm a' }}</time>
                  <a [routerLink]="['/admin/collections', item.campaign.terms.collectionWorkspaceId]">Collection</a>
                </article>
              }
            </div>
          }
        </section>
      }

      <aside class="guardrail">
        <strong>Approved terms stay fixed</strong>
        <span>
          This desk cannot change the customer, vault, asset, amount, or SmartDeed. A retry or
          refund will appear only when the server can prepare that exact authorized action.
        </span>
      </aside>
    </main>
  `,
  styles: [
    `
      :host { display:block; min-height:100vh; background:#06110f; color:#eefbf5; }
      .sales-desk { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:38px 0 80px; }
      .page-heading,.section-heading,.asset { display:flex; align-items:center; justify-content:space-between; gap:16px; }
      .page-heading { align-items:flex-end; padding-bottom:22px; border-bottom:1px solid #245144; }
      .eyebrow { color:#67e7ad; font:700 10px/1.2 var(--font-mono, monospace); text-transform:uppercase; }
      h1,h2 { letter-spacing:0; } h1 { margin:7px 0; font-size:34px; } h2 { margin:5px 0; font-size:20px; }
      p,small,.guardrail span,.section-heading > span { color:#a9c2b8; }
      .button,.operation > a { min-height:38px; border:1px solid #4f8d77; background:#123329; color:white; padding:9px 13px; text-decoration:none; cursor:pointer; }
      .button--compact { min-height:34px; padding:7px 10px; font-size:11px; white-space:nowrap; }
      .button:disabled { opacity:.55; cursor:wait; }
      .summary { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; margin:20px 0; border:1px solid #245144; background:#245144; }
      .summary button { display:grid; gap:5px; padding:15px; border:0; background:#0a1a16; color:#eefbf5; text-align:left; cursor:pointer; }
      .summary button:hover,.summary button.is-active { background:#123329; box-shadow:inset 0 -3px #67e7ad; }
      .summary span { color:#8fb5a6; font-size:11px; } .summary strong { font-size:23px; }
      .desk-section { margin-top:18px; border:1px solid #245144; background:#0a1a16; }
      .section-heading { padding:17px 18px; border-bottom:1px solid #245144; }
      .section-heading > span { font-size:11px; }
      .operation-list { display:grid; }
      .operation { display:grid; grid-template-columns:minmax(220px,1.5fr) minmax(145px,1fr) minmax(150px,1fr) 110px auto; gap:14px; align-items:center; padding:14px 16px; border-bottom:1px solid #18392f; }
      .operation:last-child { border-bottom:0; }
      .asset { justify-content:flex-start; min-width:0; }
      .asset > span:last-child,.destination,.state { display:grid; gap:3px; min-width:0; }
      .asset-mark { display:grid; flex:0 0 38px; width:38px; height:38px; place-items:center; border:1px solid #3b7b65; color:#76e0b2; font:700 10px var(--font-mono, monospace); }
      .asset-mark[data-kind='sgt'] { border-color:#557af5; color:#9eb7ff; }
      .asset-mark[data-kind='voucher'] { border-color:#b28c4c; color:#f2cf83; }
      .asset small,.destination strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .destination span { color:#78998c; font-size:10px; text-transform:uppercase; }
      .destination strong { font:11px var(--font-mono, monospace); }
      time { color:#77998c; font:10px var(--font-mono, monospace); }
      .status { color:#e8c66a; } .status--done { color:#67e7ad; } .status--attention { color:#ffad9a; }
      details { position:relative; }
      summary { color:#8de1bb; font-size:11px; cursor:pointer; list-style:none; }
      summary::-webkit-details-marker { display:none; }
      details[open] { grid-column:1/-1; padding:12px; border:1px solid #2c5b4b; background:#071512; }
      details dl { display:grid; gap:8px; margin:0; }
      details dl div { display:grid; grid-template-columns:90px 1fr; gap:10px; }
      dt { color:#78998c; font-size:10px; text-transform:uppercase; }
      dd { min-width:0; margin:0; overflow-wrap:anywhere; font:10px var(--font-mono, monospace); }
      .empty { display:grid; min-height:180px; place-content:center; gap:6px; text-align:center; color:#a9c2b8; }
      .empty--small { min-height:120px; }
      .notice { display:grid; gap:4px; margin-top:16px; padding:12px 14px; }
      .notice--warning { border:1px solid #856d38; background:#221e11; color:#f0d892; }
      .guardrail { display:grid; grid-template-columns:auto 1fr; gap:12px; margin-top:18px; padding:14px; border-left:3px solid #67e7ad; background:#0a1a16; font-size:12px; }
      @media (max-width:900px) { .operation { grid-template-columns:1.4fr 1fr 1fr; } .operation time { display:none; } }
      @media (max-width:680px) { .sales-desk { width:min(100% - 20px,1180px); padding-top:24px; } .page-heading { align-items:flex-start; flex-direction:column; } .summary { grid-template-columns:repeat(2,1fr); } .operation { grid-template-columns:1fr auto; } .destination,.state { grid-column:1/-1; } .operation > a { justify-self:start; } .guardrail { grid-template-columns:1fr; } }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSalesComponent {
  private readonly collections = inject(CollectionApiService);
  private readonly sales = inject(AdminSalesService);

  readonly series = signal<PresaleSeries[]>([]);
  readonly purchases = signal<AdminPurchaseOperation[]>([]);
  readonly loading = signal(true);
  readonly errors = signal<string[]>([]);
  readonly checkingPurchase = signal<string | null>(null);
  readonly filter = signal<DeskFilter>('ALL');
  readonly vouchers = computed(() =>
    this.series().flatMap((campaign) =>
      campaign.vouchers.map((voucher) => ({ campaign, voucher })),
    ),
  );
  readonly filteredPurchases = computed(() =>
    this.purchases().filter((purchase) => this.matchesPurchaseFilter(purchase.state)),
  );
  readonly filteredVouchers = computed(() =>
    this.vouchers().filter(({ voucher }) => this.matchesVoucherFilter(voucher.state)),
  );
  readonly totalCount = computed(() => this.purchases().length + this.vouchers().length);
  readonly attentionCount = computed(
    () => this.purchases().filter((item) => this.purchaseGroup(item.state) === 'ATTENTION').length
      + this.vouchers().filter(({ voucher }) => this.voucherGroup(voucher.state) === 'ATTENTION').length,
  );
  readonly inProgressCount = computed(
    () => this.purchases().filter((item) => this.purchaseGroup(item.state) === 'IN_PROGRESS').length
      + this.vouchers().filter(({ voucher }) => this.voucherGroup(voucher.state) === 'IN_PROGRESS').length,
  );
  readonly completedCount = computed(
    () => this.purchases().filter((item) => this.purchaseGroup(item.state) === 'COMPLETED').length
      + this.vouchers().filter(({ voucher }) => this.voucherGroup(voucher.state) === 'COMPLETED').length,
  );

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errors.set([]);
    const [purchases, presales] = await Promise.allSettled([
      this.sales.listPurchases(),
      this.collections.listPresales(),
    ]);
    const errors: string[] = [];
    if (purchases.status === 'fulfilled') this.purchases.set(purchases.value);
    else errors.push(`Direct purchases: ${formatError(purchases.reason)}`);
    if (presales.status === 'fulfilled') this.series.set(presales.value);
    else errors.push(`Reservations: ${formatError(presales.reason)}`);
    this.errors.set(errors);
    this.loading.set(false);
  }

  purchaseTitle(purchase: AdminPurchaseOperation): string {
    if (purchase.deliveryKind === 'sgt') return `${purchase.quantity.toLocaleString()} SGT`;
    const launcher = String(purchase.artifact?.['deedLauncherId'] || '');
    return launcher ? `SmartDeed ${this.short(launcher)}` : 'SmartDeed purchase';
  }

  purchaseAmount(purchase: AdminPurchaseOperation): string {
    const minor = this.integer(purchase.artifact?.['grossUsdAmountMinor']);
    return minor === null ? 'Price fixed in artifact' : this.usd(minor);
  }

  railLabel(rail: AdminPurchaseOperation['rail']): string {
    return {
      chia_xch: 'XCH offer',
      chia_cat: 'Chia CAT offer',
      base_usdc: 'Base USDC',
      stripe: 'Stripe',
    }[rail];
  }

  purchaseStatus(state: PurchaseOperationState): string {
    return {
      created: 'Starting',
      zk_verified: 'Vault approved',
      artifact_ready: 'Ready for payment',
      payment_pending: 'Payment pending',
      paid: 'Payment confirmed',
      protocol_verified: 'Payment verified',
      finalized: 'Delivered',
      failed: 'Failed',
      expired: 'Expired',
      refund_pending: 'Refund pending',
      manual_review: 'Review required',
    }[state];
  }

  purchaseHelp(state: PurchaseOperationState): string {
    if (state === 'payment_pending') return 'Waiting for the payment provider';
    if (state === 'paid' || state === 'protocol_verified') return 'Awaiting exact vault delivery';
    if (state === 'finalized') return 'Chain confirmation recorded';
    if (state === 'manual_review') return 'Owner and coadministrator should inspect evidence';
    if (state === 'refund_pending') return 'Exact original-payment refund is processing';
    if (state === 'failed' || state === 'expired') return 'No delivery is authorized';
    return 'No administrator action needed';
  }

  purchaseStatusClass(state: PurchaseOperationState): string {
    const group = this.purchaseGroup(state);
    if (group === 'COMPLETED') return 'status status--done';
    if (group === 'ATTENTION') return 'status status--attention';
    return 'status';
  }

  voucherPaymentAmount(voucher: PresaleVoucher): string {
    if (voucher.paymentRail === 'STRIPE_USD') return this.usd(BigInt(voucher.paymentPrincipal));
    if (voucher.paymentRail === 'BASE_SEPOLIA_USDC') return this.usd(BigInt(voucher.paymentPrincipal), 6);
    return `${(voucher.paymentPrincipal / 1_000_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 12 })} XCH`;
  }

  voucherRail(voucher: PresaleVoucher): string {
    if (voucher.paymentRail === 'STRIPE_USD') return 'Stripe USD';
    return voucher.paymentRail === 'BASE_SEPOLIA_USDC' ? 'Base USDC' : 'XCH offer';
  }

  voucherStatus(state: VoucherState): string {
    return {
      PENDING_ISSUANCE: 'Preparing receipt',
      ISSUANCE_SUBMITTED: 'Receipt submitted',
      ESCROWED: 'Refundable',
      REFUNDING: 'Refund processing',
      REFUNDED: 'Refunded',
      REDEEMING: 'Delivering deed',
      REDEEMED: 'Deed delivered',
    }[state];
  }

  voucherHelp(state: VoucherState): string {
    if (state === 'ESCROWED') return 'Funds remain protected';
    if (state === 'REDEEMED') return 'SmartDeed confirmed';
    if (state === 'REFUNDED') return 'Exact paid asset returned';
    return 'Deterministic processing';
  }

  voucherStatusClass(state: VoucherState): string {
    const group = this.voucherGroup(state);
    if (group === 'COMPLETED') return 'status status--done';
    if (group === 'ATTENTION') return 'status status--attention';
    return 'status';
  }

  operationTime(purchase: AdminPurchaseOperation): string | number | null {
    return purchase.updatedAt || purchase.createdAt;
  }

  evidenceReference(purchase: AdminPurchaseOperation): string {
    const evidence = purchase.settlementEvidence;
    for (const key of [
      'expectedDeliveryCoinId',
      'expectedSmartDeedCoinId',
      'expectedSgtCoinId',
      'expectedOutputCoinId',
      'spendBundleId',
      'transactionId',
      'payment_intent_id',
    ]) {
      const value = evidence[key];
      if (typeof value === 'string' && value) return value;
    }
    return '';
  }

  canCheckDelivery(purchase: AdminPurchaseOperation): boolean {
    return purchase.rail === 'stripe'
      && !!purchase.purchaseId
      && ['paid', 'protocol_verified'].includes(purchase.state);
  }

  async checkDelivery(purchase: AdminPurchaseOperation): Promise<void> {
    if (!purchase.purchaseId || !this.canCheckDelivery(purchase)) return;
    this.checkingPurchase.set(purchase.purchaseId);
    this.errors.set([]);
    try {
      await this.sales.reconcilePurchase(purchase.purchaseId);
      await this.reload();
    } catch (error) {
      this.errors.set([`Delivery check: ${formatError(error)}`]);
    } finally {
      this.checkingPurchase.set(null);
    }
  }

  short(value: string): string {
    return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-7)}` : value;
  }

  private matchesPurchaseFilter(state: PurchaseOperationState): boolean {
    return this.filter() === 'ALL' || this.purchaseGroup(state) === this.filter();
  }

  private matchesVoucherFilter(state: VoucherState): boolean {
    return this.filter() === 'ALL' || this.voucherGroup(state) === this.filter();
  }

  private purchaseGroup(state: PurchaseOperationState): Exclude<DeskFilter, 'ALL'> {
    if (state === 'finalized') return 'COMPLETED';
    if (['failed', 'expired', 'refund_pending', 'manual_review'].includes(state)) return 'ATTENTION';
    return 'IN_PROGRESS';
  }

  private voucherGroup(state: VoucherState): Exclude<DeskFilter, 'ALL'> {
    if (state === 'REDEEMED' || state === 'REFUNDED') return 'COMPLETED';
    if (state === 'REFUNDING') return 'ATTENTION';
    return 'IN_PROGRESS';
  }

  private integer(value: unknown): bigint | null {
    const text = String(value ?? '');
    return /^(0|[1-9][0-9]*)$/.test(text) ? BigInt(text) : null;
  }

  private usd(minor: bigint, decimals = 2): string {
    const divisor = 10n ** BigInt(decimals);
    const dollars = minor / divisor;
    const cents = (minor % divisor).toString().padStart(decimals, '0');
    return `$${dollars.toLocaleString()}.${cents.slice(0, 2)}`;
  }
}
