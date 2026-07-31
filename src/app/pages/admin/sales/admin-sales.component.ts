import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideCircleCheck,
  LucideClock3,
  LucideRefreshCw,
  LucideTriangleAlert,
  LucideUndo2,
} from '@lucide/angular';
import { RouterLink } from '@angular/router';

import { AdminWorkspaceNavComponent } from '../../../components/admin-workspace/admin-workspace-nav.component';
import {
  CollectionApiService,
  PresaleSeries,
  PresaleVoucher,
  VoucherState,
} from '../../../services/collection-api.service';
import { formatError } from '../../../utils/format-error';
import { AdminOperationApprovalService } from '../../../services/admin-operation-approval.service';
import {
  AdminStripeHistoryEvent,
  AdminStripeOperation,
  AdminStripeOperationsService,
} from '../../../services/admin-stripe-operations.service';

@Component({
  selector: 'solslot-admin-sales',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    AdminWorkspaceNavComponent,
    LucideChevronDown,
    LucideChevronUp,
    LucideCircleCheck,
    LucideClock3,
    LucideRefreshCw,
    LucideTriangleAlert,
    LucideUndo2,
  ],
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
      @if (message()) {
        <div class="notice notice--success" role="status">{{ message() }}</div>
      }

      <section class="summary" aria-label="Sales summary">
        <div><span>Stripe payments</span><strong>{{ stripeOperations().length }}</strong></div>
        <div><span>Needs attention</span><strong>{{ stripeAttentionCount() }}</strong></div>
        <div><span>Delivered</span><strong>{{ count('REDEEMED') + stripeCount('FINALIZED') }}</strong></div>
        <div><span>Refunded</span><strong>{{ count('REFUNDED') + stripeCount('REFUNDED') }}</strong></div>
      </section>

      <section class="stripe-queue" aria-labelledby="stripe-queue-title">
        <div class="campaign-heading">
          <div>
            <span class="eyebrow">Stripe test mode</span>
            <h2 id="stripe-queue-title">Card and bank payments</h2>
            <p>Every row is locked to one SmartDeed and one approved customer vault.</p>
          </div>
        </div>
        @if (!stripeOperations().length && !loading()) {
          <p class="campaign-empty">No Stripe purchases have started.</p>
        } @else {
          <div class="stripe-list">
            @for (operation of stripeOperations(); track operation.purchaseId) {
              <article>
                <div class="stripe-main">
                  <span class="stripe-icon" [class.stripe-icon--attention]="needsAttention(operation)">
                    @if (operation.state === 'FINALIZED') {
                      <svg lucideCircleCheck aria-hidden="true"></svg>
                    } @else if (operation.state === 'REFUNDED') {
                      <svg lucideUndo2 aria-hidden="true"></svg>
                    } @else if (needsAttention(operation)) {
                      <svg lucideTriangleAlert aria-hidden="true"></svg>
                    } @else if (operation.state === 'PAYMENT_PROCESSING') {
                      <svg lucideClock3 aria-hidden="true"></svg>
                    } @else {
                      <svg lucideRefreshCw aria-hidden="true"></svg>
                    }
                  </span>
                  <div>
                    <strong>{{ operation.purchaseKind === 'PRESALE' ? 'Presale reservation' : 'SmartDeed purchase' }}</strong>
                    <small>{{ short(operation.deedLauncherId) }}</small>
                  </div>
                </div>
                <div><strong>{{ money(operation.totalAmountMinor) }}</strong><small>{{ stripeMethod(operation) }}</small></div>
                <div>
                  <strong [class]="stripeStatusClass(operation)">{{ stripeStatus(operation) }}</strong>
                  <small>{{ stripeNextStep(operation) }}</small>
                </div>
                <time>{{ operation.updatedAt * 1000 | date: 'MMM d, h:mm a' }}</time>
                <div class="row-actions">
                  <button type="button" class="icon-action" (click)="toggleEvidence(operation)" [attr.aria-expanded]="expandedPurchaseId() === operation.purchaseId" title="View exact evidence">
                    @if (expandedPurchaseId() === operation.purchaseId) {
                      <svg lucideChevronUp aria-hidden="true"></svg>
                    } @else {
                      <svg lucideChevronDown aria-hidden="true"></svg>
                    }
                  </button>
                  @if (canReconcile(operation)) {
                    <button type="button" (click)="reconcile(operation)" [disabled]="workingPurchaseId() === operation.purchaseId">
                      <svg lucideRefreshCw aria-hidden="true"></svg>
                      {{ workingPurchaseId() === operation.purchaseId ? 'Checking...' : 'Retry exact step' }}
                    </button>
                  }
                </div>
                @if (operation.lastError) {
                  <p class="row-error" role="alert">{{ operation.lastError }}</p>
                }
                @if (expandedPurchaseId() === operation.purchaseId) {
                  <div class="evidence-panel">
                    <dl>
                      <div><dt>Approved vault</dt><dd>{{ short(operation.approvedVaultLauncherId) }}</dd></div>
                      <div><dt>Payment</dt><dd>{{ short(operation.paymentIntentId || 'Not submitted') }}</dd></div>
                      <div><dt>Reservation</dt><dd>{{ short(operation.reservationCoinId || 'Preparing') }}</dd></div>
                      <div><dt>SmartDeed output</dt><dd>{{ short(operation.expectedOutputCoinId || 'Not delivered') }}</dd></div>
                      <div><dt>Refund</dt><dd>{{ short(operation.refundId || 'None') }}</dd></div>
                      <div><dt>Dispute</dt><dd>{{ disputeEvidence(operation) }}</dd></div>
                      <div><dt>Revision</dt><dd>{{ operation.revision }}</dd></div>
                    </dl>
                    @if (operation.state === 'DISPUTED') {
                      <div class="incident-panel">
                        <div>
                          <strong>Protocol actions are paused</strong>
                          <span>{{ disputeHelp(operation) }}</span>
                        </div>
                        @if (disputeResolutionFor(operation); as resolution) {
                          <button
                            type="button"
                            (click)="requestDisputeResolution(operation, resolution)"
                            [disabled]="workingPurchaseId() === operation.purchaseId"
                          >
                            {{ resolution === 'RESTORE_AFTER_WIN' ? 'Request restore' : 'Accept loss and request restore' }}
                          </button>
                        }
                      </div>
                    }
                    @if (evidenceLoading()) {
                      <p>Loading exact history...</p>
                    } @else if (history().length) {
                      <ol class="history">
                        @for (event of history(); track event.revision + ':' + event.createdAt) {
                          <li><strong>{{ stripeStatusFromState(event.toState) }}</strong><span>{{ event.reason || event.actor }}</span><time>{{ event.createdAt * 1000 | date: 'MMM d, h:mm a' }}</time></li>
                        }
                      </ol>
                    }
                  </div>
                }
              </article>
            }
          </div>
        }
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
      .stripe-queue { margin-top:18px; border:1px solid #245144; background:#0a1a16; }
      .stripe-list { border-top:1px solid #245144; }
      .stripe-list > article { display:grid; grid-template-columns:1.4fr .8fr 1.1fr .7fr auto; gap:14px; align-items:center; padding:14px; border-top:1px solid #18392f; }
      .stripe-list > article:first-child { border-top:0; }
      .stripe-list article > div:not(.evidence-panel):not(.stripe-main):not(.row-actions) { display:grid; gap:3px; }
      .stripe-main { display:flex; align-items:center; gap:10px; min-width:0; }
      .stripe-main > div { display:grid; gap:3px; min-width:0; }
      .stripe-icon { display:grid; place-items:center; width:36px; height:36px; color:#67e7ad; border:1px solid #356c59; background:#102b23; }
      .stripe-icon--attention { color:#ffb49f; border-color:#844f4f; background:#291817; }
      .stripe-icon svg { width:20px; height:20px; }
      .row-actions { display:flex; justify-content:flex-end; gap:7px; }
      .row-actions button { display:inline-flex; align-items:center; gap:5px; border:1px solid #4f8d77; background:#123329; color:white; min-height:36px; padding:7px 10px; cursor:pointer; }
      .row-actions button:disabled { opacity:.55; cursor:wait; }
      .row-actions svg { width:17px; height:17px; }
      .row-actions .icon-action { width:36px; padding:7px; justify-content:center; }
      .row-error { grid-column:1/-1; margin:0; padding:9px 11px; color:#ffc4c4; background:#241513; border-left:3px solid #d87162; }
      .evidence-panel { grid-column:1/-1; padding:14px; background:#071410; border:1px solid #245144; }
      .evidence-panel dl { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:0; }
      .evidence-panel dl div { min-width:0; }
      .evidence-panel dt { color:#77998c; font:10px monospace; text-transform:uppercase; }
      .evidence-panel dd { margin:4px 0 0; overflow:hidden; text-overflow:ellipsis; }
      .history { display:grid; gap:1px; margin:14px 0 0; padding:0; list-style:none; background:#18392f; }
      .history li { display:grid; grid-template-columns:1fr 2fr auto; gap:12px; padding:9px; background:#0a1a16; }
      .history span { color:#a9c2b8; }
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
      .notice--success { margin-top:16px; padding:12px; border:1px solid #4f8d77; color:#bff4dd; }
      .incident-panel { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:14px; padding:13px; border-left:3px solid #d9a957; background:#241e11; }
      .incident-panel div { display:grid; gap:4px; }
      .incident-panel span { color:#d6c7a6; font-size:12px; }
      .incident-panel button { border:1px solid #d9a957; background:#322815; color:#fff4d3; padding:9px 11px; cursor:pointer; }
      @media (max-width:900px) { .stripe-list > article { grid-template-columns:1fr 1fr; } .stripe-main,.row-actions,.row-error,.evidence-panel { grid-column:1/-1; } .row-actions { justify-content:flex-start; } .evidence-panel dl { grid-template-columns:1fr 1fr; } }
      @media (max-width:780px) { .summary { grid-template-columns:repeat(2,1fr); } .table-head { display:none; } .voucher-table article { grid-template-columns:1fr 1fr; } .voucher-table article > span:nth-child(3) { grid-column:1/-1; } header { align-items:flex-start; flex-direction:column; } .evidence-panel dl,.history li { grid-template-columns:1fr; } }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSalesComponent {
  private readonly api = inject(CollectionApiService);
  private readonly stripeApi = inject(AdminStripeOperationsService);
  private readonly approvalApi = inject(AdminOperationApprovalService);
  readonly series = signal<PresaleSeries[]>([]);
  readonly stripeOperations = signal<AdminStripeOperation[]>([]);
  readonly expandedPurchaseId = signal<string | null>(null);
  readonly history = signal<AdminStripeHistoryEvent[]>([]);
  readonly evidenceLoading = signal(false);
  readonly workingPurchaseId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly vouchers = computed(() => this.series().flatMap((campaign) => campaign.vouchers));
  readonly processingCount = computed(
    () => this.vouchers().filter((voucher) => !['REDEEMED', 'REFUNDED', 'ESCROWED'].includes(voucher.state)).length,
  );
  readonly stripeAttentionCount = computed(
    () => this.stripeOperations().filter((operation) => this.needsAttention(operation)).length,
  );

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [series, stripeOperations] = await Promise.all([
        this.api.listPresales(),
        this.stripeApi.list(),
      ]);
      this.series.set(series);
      this.stripeOperations.set(stripeOperations);
    } catch (error) {
      this.error.set(formatError(error));
    } finally {
      this.loading.set(false);
    }
  }

  count(state: VoucherState): number {
    return this.vouchers().filter((voucher) => voucher.state === state).length;
  }

  stripeCount(state: string): number {
    return this.stripeOperations().filter((operation) => operation.state === state).length;
  }

  money(value: string): string {
    const minor = Number(value);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      Number.isSafeInteger(minor) ? minor / 100 : 0,
    );
  }

  needsAttention(operation: AdminStripeOperation): boolean {
    return ['REVIEW_REQUIRED', 'DISPUTED', 'PAYMENT_FAILED'].includes(operation.state);
  }

  canReconcile(operation: AdminStripeOperation): boolean {
    return !['FINALIZED', 'REFUNDED', 'CANCELED', 'DISPUTED'].includes(operation.state);
  }

  stripeMethod(operation: AdminStripeOperation): string {
    if (operation.paymentMethodFamily === 'us_bank_account') return 'US bank account';
    if (operation.fundingType === 'credit') return 'Credit card';
    if (operation.fundingType === 'debit') return 'Debit card';
    if (operation.fundingType === 'prepaid') return 'Prepaid card';
    return operation.paymentIntentId ? 'Card' : 'Payment not submitted';
  }

  stripeStatus(operation: AdminStripeOperation): string {
    return this.stripeStatusFromState(operation.state);
  }

  stripeStatusFromState(state: string): string {
    const labels: Record<string, string> = {
      ARTIFACT_READY: 'Ready to reserve', SOFT_HELD: 'Customer hold', RESERVING: 'Reserving deed',
      RESERVATION_MEMPOOL: 'Reservation in mempool', RESERVED: 'Deed reserved',
      PAYMENT_METHOD_READY: 'Awaiting confirmation', PAYMENT_PROCESSING: 'Bank payment pending',
      PAYMENT_SUCCEEDED: 'Payment confirmed', VOUCHER_PENDING: 'Preparing voucher',
      VOUCHER_ISSUANCE_MEMPOOL: 'Voucher in mempool', VOUCHER_ESCROWED: 'Refundable voucher',
      RECEIPT_MEMPOOL: 'Receipt in mempool', RECEIPT_READY: 'Receipt confirmed',
      DELIVERY_SUBMITTED: 'Delivery submitted', MEMPOOL_OBSERVED: 'Delivery in mempool',
      CHAIN_CONFIRMED: 'Chain confirmed', FINALIZED: 'Delivered', PAYMENT_FAILED: 'Payment failed',
      CANCELED: 'Canceled', REFUND_PENDING: 'Refund pending', REFUNDED: 'Refunded',
      REVIEW_REQUIRED: 'Needs review', DISPUTED: 'Disputed',
    };
    return labels[state] || state.replaceAll('_', ' ').toLowerCase();
  }

  stripeNextStep(operation: AdminStripeOperation): string {
    if (operation.state === 'PAYMENT_PROCESSING') return 'Wait for Stripe settlement';
    if (operation.state === 'REVIEW_REQUIRED') return 'Review evidence, then retry exact step';
    if (operation.state === 'DISPUTED') {
      return this.disputeResolutionFor(operation)
        ? 'Final result needs owner-plus-one'
        : 'Wait for Stripe dispute result';
    }
    if (operation.state === 'REFUND_PENDING') return 'Inventory release and full refund';
    if (operation.state === 'FINALIZED') return 'No action needed';
    if (operation.state === 'REFUNDED') return 'Full amount returned';
    return 'Automatic processing';
  }

  stripeStatusClass(operation: AdminStripeOperation): string {
    if (['FINALIZED', 'REFUNDED'].includes(operation.state)) return 'status status--done';
    if (this.needsAttention(operation)) return 'status status--attention';
    return 'status';
  }

  async toggleEvidence(operation: AdminStripeOperation): Promise<void> {
    if (this.expandedPurchaseId() === operation.purchaseId) {
      this.expandedPurchaseId.set(null);
      this.history.set([]);
      return;
    }
    this.expandedPurchaseId.set(operation.purchaseId);
    this.history.set([]);
    this.evidenceLoading.set(true);
    try {
      const detail = await this.stripeApi.detail(operation.purchaseId);
      this.history.set(detail.history);
      this.replaceStripeOperation(detail.operation);
    } catch (error) {
      this.error.set(formatError(error));
    } finally {
      this.evidenceLoading.set(false);
    }
  }

  async reconcile(operation: AdminStripeOperation): Promise<void> {
    this.workingPurchaseId.set(operation.purchaseId);
    this.error.set(null);
    try {
      const result = await this.stripeApi.reconcile(operation.purchaseId, operation.revision);
      this.replaceStripeOperation(result.operation);
      if (this.expandedPurchaseId() === operation.purchaseId) {
        const detail = await this.stripeApi.detail(operation.purchaseId);
        this.history.set(detail.history);
      }
    } catch (error) {
      this.error.set(formatError(error));
      await this.reload();
    } finally {
      this.workingPurchaseId.set(null);
    }
  }

  disputeEvidence(operation: AdminStripeOperation): string {
    if (!operation.disputeId) return 'None';
    const status = operation.disputeStatus?.replaceAll('_', ' ') || 'open';
    return `${this.short(operation.disputeId)} · ${status}`;
  }

  disputeHelp(operation: AdminStripeOperation): string {
    if (operation.disputeStatus === 'won' || operation.disputeStatus === 'warning_closed') {
      return "Stripe closed the case in Solslot's favor. Owner plus one may restore swaps and redemption.";
    }
    if (operation.disputeStatus === 'lost') {
      return 'The payment was lost. Restoring protocol actions accepts the financial loss and does not recover funds.';
    }
    return 'New swaps and redemption remain paused while Stripe reviews the payment. Vault custody is unchanged.';
  }

  disputeResolutionFor(
    operation: AdminStripeOperation,
  ): 'RESTORE_AFTER_WIN' | 'ACCEPT_LOSS_AND_RESTORE' | null {
    if (operation.disputeStatus === 'won' || operation.disputeStatus === 'warning_closed') {
      return 'RESTORE_AFTER_WIN';
    }
    return operation.disputeStatus === 'lost' ? 'ACCEPT_LOSS_AND_RESTORE' : null;
  }

  async requestDisputeResolution(
    operation: AdminStripeOperation,
    resolution: 'RESTORE_AFTER_WIN' | 'ACCEPT_LOSS_AND_RESTORE',
  ): Promise<void> {
    this.workingPurchaseId.set(operation.purchaseId);
    this.error.set(null);
    this.message.set(null);
    try {
      const approval = await this.approvalApi.prepareAndSign({
        operation: 'stripe.dispute.resolve',
        revision: operation.revision,
        binding: {
          method: 'POST',
          path: `/protocol/stripe/admin/purchases/${encodeURIComponent(operation.purchaseId)}/resolve-dispute`,
          query: [],
          body: { expectedRevision: operation.revision, resolution },
        },
      });
      this.message.set(
        approval.status === 'approved'
          ? 'The exact dispute resolution is ready in the Approval Inbox.'
          : 'Your approval is recorded. One other required administrator must review it in the Approval Inbox.',
      );
    } catch (error) {
      this.error.set(formatError(error));
    } finally {
      this.workingPurchaseId.set(null);
    }
  }

  private replaceStripeOperation(next: AdminStripeOperation): void {
    this.stripeOperations.update((operations) =>
      operations.map((operation) => operation.purchaseId === next.purchaseId ? next : operation),
    );
  }

  paymentAmount(voucher: PresaleVoucher): string {
    if (voucher.paymentRail === 'STRIPE_USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(voucher.paymentPrincipal / 100);
    }
    if (voucher.paymentRail === 'BASE_SEPOLIA_USDC') {
      return `$${(voucher.paymentPrincipal / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
    }
    return `${(voucher.paymentPrincipal / 1_000_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 12 })} XCH`;
  }

  paymentRail(voucher: PresaleVoucher): string {
    if (voucher.paymentRail === 'STRIPE_USD') return 'Stripe USD';
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
