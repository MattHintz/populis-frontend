import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AdminOperationApproval,
  AdminOperationApprovalService,
} from '../../../services/admin-operation-approval.service';
import { AdminSessionService } from '../../../services/admin-session.service';
import {
  CollectionApiService,
  CollectionFeatureStatus,
  CollectionWorkspace,
  PresaleSeries,
} from '../../../services/collection-api.service';
import {
  SolsMarketApiService,
  SolsMarketSnapshot,
} from '../../../services/sols-market-api.service';
import { formatError } from '../../../utils/format-error';

interface DeskTask {
  id: string;
  title: string;
  body: string;
  route: string[];
  label: string;
  urgency: 'now' | 'review' | 'waiting';
}

@Component({
  selector: 'pp-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="operations-desk">
      <header class="desk-header">
        <div>
          <span class="eyebrow">Solslot administrator operations</span>
          <h1>Alpha operations</h1>
          <p>One place for assigned work, collections, approvals, sales, and system readiness.</p>
        </div>
        <div class="identity">
          <span>{{ shortWallet(subject() || '') }}</span>
          <button type="button" (click)="logout()">Sign out</button>
        </div>
      </header>

      @if (error()) {
        <div class="notice notice--error" role="alert">
          <strong>Some operations could not be loaded</strong>
          <span>{{ error() }}</span>
          <button type="button" (click)="reload()">Retry</button>
        </div>
      }

      <section class="task-panel" aria-labelledby="tasks-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Your work</span>
            <h2 id="tasks-title">Task inbox</h2>
          </div>
          <button type="button" class="icon-button" title="Refresh tasks" (click)="reload()">
            <span aria-hidden="true">&#8635;</span>
            <span class="sr-only">Refresh tasks</span>
          </button>
        </div>
        @if (loading()) {
          <p class="empty">Checking current operations...</p>
        } @else if (!tasks().length) {
          <div class="empty">
            <strong>No assigned action is waiting</strong>
            <span>You can continue preparing collections while chain-write windows remain closed.</span>
          </div>
        } @else {
          <div class="task-list">
            @for (task of tasks(); track task.id) {
              <article>
                <span [class]="'task-state task-state--' + task.urgency">
                  {{ task.urgency === 'now' ? 'Action' : task.urgency === 'review' ? 'Review' : 'Waiting' }}
                </span>
                <div>
                  <strong>{{ task.title }}</strong>
                  <p>{{ task.body }}</p>
                </div>
                <a [routerLink]="task.route">{{ task.label }}</a>
              </article>
            }
          </div>
        }
      </section>

      <section class="desk-grid" aria-label="Administrator work areas">
        <a routerLink="/admin/collections" class="desk-tile">
          <span class="eyebrow">Issuance</span>
          <strong>Collections</strong>
          <p>Draft, review, seal, govern, and publish investor dossiers and SmartDeeds.</p>
          <dl>
            <div><dt>Total</dt><dd>{{ collections().length }}</dd></div>
            <div><dt>Need attention</dt><dd>{{ collectionAttentionCount() }}</dd></div>
          </dl>
        </a>

        <a routerLink="/admin/approvals" class="desk-tile">
          <span class="eyebrow">Owner plus one</span>
          <strong>Approvals</strong>
          <p>Review consequential operations from every admin workflow in one inbox.</p>
          <dl>
            <div><dt>Open</dt><dd>{{ approvals().length }}</dd></div>
            <div><dt>Ready</dt><dd>{{ readyApprovalCount() }}</dd></div>
          </dl>
        </a>

        <a routerLink="/admin/sales" class="desk-tile">
          <span class="eyebrow">Customer fulfillment</span>
          <strong>Sales & refunds</strong>
          <p>Track refundable vouchers, SmartDeed delivery, settlement, and exact refunds.</p>
          <dl>
            <div><dt>Vouchers</dt><dd>{{ voucherCount() }}</dd></div>
            <div><dt>Need action</dt><dd>{{ voucherAttentionCount() }}</dd></div>
          </dl>
        </a>

        <a routerLink="/admin/pool-economics-v2" class="desk-tile">
          <span class="eyebrow">Secondary market</span>
          <strong>SOLS liquidity</strong>
          <p>Review the live SOLS pool, SmartDeeds available for swap, reserves, and governed NAV.</p>
          <dl>
            <div><dt>Customer view</dt><dd>{{ solsMarket()?.outcome || 'Checking' }}</dd></div>
            <div><dt>Verified swaps</dt><dd>{{ solsMarket()?.verifiedOpportunityCount || 0 }}</dd></div>
          </dl>
        </a>

        <a routerLink="/admin/system-health" class="desk-tile">
          <span class="eyebrow">Readiness</span>
          <strong>System health</strong>
          <p>See release, node, rail, SOLS pool, media, and write-gate outcomes in ordinary language.</p>
          <dl>
            <div><dt>Drafting</dt><dd>{{ feature()?.metadataEnabled ? 'Available' : 'Locked' }}</dd></div>
            <div><dt>Minting</dt><dd>{{ feature()?.mintingEnabled ? 'Open' : 'Closed' }}</dd></div>
          </dl>
        </a>

        <a routerLink="/admin/authority" class="desk-tile">
          <span class="eyebrow">Team</span>
          <strong>Administrators</strong>
          <p>Review the active on-chain authority and administrator roster.</p>
          <span class="tile-action">Open authority</span>
        </a>

        <a routerLink="/admin/genesis" class="desk-tile">
          <span class="eyebrow">Read only after launch</span>
          <strong>Launch archive</strong>
          <p>Review the signed RC21 ceremony, confirmations, evidence, and checksums.</p>
          <span class="tile-action">Open archive</span>
        </a>
      </section>

      <section class="recent" aria-labelledby="recent-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Shared workspace</span>
            <h2 id="recent-title">Recent collections</h2>
          </div>
          <a routerLink="/admin/collections">View all</a>
        </div>
        @if (!collections().length && !loading()) {
          <div class="empty">
            <strong>No collection workspace yet</strong>
            <span>Create the first property through the general collection desk.</span>
          </div>
        } @else {
          <div class="collection-list">
            @for (collection of collections().slice(0, 5); track collection.id) {
              <a [routerLink]="['/admin/collections', collection.id]">
                <span [class]="'collection-state collection-state--' + collection.state.toLowerCase()">
                  {{ collection.state }}
                </span>
                <span>
                  <strong>{{ collection.dossier.title }}</strong>
                  <small>{{ collectionSummary(collection) }}</small>
                </span>
                <time>{{ collection.updatedAt * 1000 | date: 'MMM d, y' }}</time>
              </a>
            }
          </div>
        }
      </section>
    </main>
  `,
  styles: [
    `
      :host { display:block; min-height:100vh; background:#06110f; color:#eefbf5; }
      .operations-desk { width:min(1220px,calc(100% - 32px)); margin:0 auto; padding:0 0 80px; }
      .desk-header,.section-heading,.identity,.task-list article { display:flex; align-items:center; justify-content:space-between; gap:16px; }
      .desk-header { align-items:flex-end; padding-bottom:23px; border-bottom:1px solid #245144; }
      .eyebrow { color:#67e7ad; font:700 11px/1.2 monospace; text-transform:uppercase; }
      h1,h2 { letter-spacing:0; } h1 { margin:7px 0; font-size:36px; } h2 { margin:5px 0 0; font-size:22px; }
      p,small { color:#a9c2b8; } .desk-header p { max-width:680px; }
      .identity { padding:8px 10px; border:1px solid #245144; font:11px monospace; }
      .identity button,.notice button,.icon-button { border:0; background:none; color:#67e7ad; cursor:pointer; }
      .task-panel,.recent { margin-top:20px; padding:20px; border:1px solid #245144; background:#0a1a16; }
      .task-list { display:grid; gap:1px; margin-top:16px; background:#245144; }
      .task-list article { display:grid; grid-template-columns:auto minmax(0,1fr) auto; padding:14px; background:#081612; }
      .task-list article > div { display:grid; gap:3px; } .task-list p { margin:0; font-size:13px; }
      .task-list a,.recent a,.tile-action { color:#8bf0bd; text-decoration:none; font-size:12px; }
      .task-state { min-width:56px; padding:4px 6px; border:1px solid #4f8d77; font:700 10px monospace; text-align:center; }
      .task-state--now { color:#ffd58a; border-color:#8c713e; } .task-state--review { color:#7cffb2; }
      .desk-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:20px; }
      .desk-tile { display:flex; min-height:220px; flex-direction:column; padding:20px; border:1px solid #245144; background:#0a1a16; color:inherit; text-decoration:none; transition:background .15s,border-color .15s; }
      .desk-tile:hover { border-color:#4f8d77; background:#0d211b; }
      .desk-tile > strong { margin-top:9px; font-size:21px; } .desk-tile p { min-height:58px; font-size:13px; }
      .desk-tile dl { display:grid; grid-template-columns:repeat(2,1fr); gap:1px; margin:auto 0 0; background:#245144; }
      .desk-tile dl div { padding:10px; background:#081612; } dt { color:#8fb5a6; font-size:10px; } dd { margin:3px 0 0; }
      .tile-action { margin-top:auto; }
      .collection-list { display:grid; gap:1px; margin-top:16px; background:#245144; }
      .collection-list > a { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; padding:13px; background:#081612; color:inherit; }
      .collection-list > a > span:nth-child(2) { display:grid; gap:3px; }
      .collection-list time { color:#77998c; font:11px monospace; }
      .collection-state { min-width:70px; color:#a9c2b8; font:700 10px monospace; }
      .collection-state--sealed,.collection-state--published { color:#67e7ad; }
      .empty { display:grid; place-content:center; gap:5px; min-height:130px; color:#eefbf5; text-align:center; }
      .notice { display:grid; grid-template-columns:auto 1fr auto; gap:12px; margin-top:18px; padding:12px; border:1px solid #844f4f; color:#ffc4c4; }
      .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
      @media (max-width:900px) { .desk-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
      @media (max-width:650px) { .desk-header { align-items:flex-start; flex-direction:column; } .desk-grid { grid-template-columns:1fr; } .task-list article,.collection-list > a { grid-template-columns:auto 1fr; } .task-list a,.collection-list time { grid-column:2; } .notice { grid-template-columns:1fr; } }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  private readonly collectionApi = inject(CollectionApiService);
  private readonly approvalApi = inject(AdminOperationApprovalService);
  private readonly solsMarketApi = inject(SolsMarketApiService);
  private readonly session = inject(AdminSessionService);

  readonly feature = signal<CollectionFeatureStatus | null>(null);
  readonly collections = signal<CollectionWorkspace[]>([]);
  readonly approvals = signal<AdminOperationApproval[]>([]);
  readonly presales = signal<PresaleSeries[]>([]);
  readonly solsMarket = signal<SolsMarketSnapshot | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly subject = this.session.subject;

  readonly collectionAttentionCount = computed(
    () =>
      this.collections().filter(
        (collection) =>
          !collection.readiness.ready ||
          collection.comments.some((comment) => comment.blocking && !comment.resolved),
      ).length,
  );
  readonly readyApprovalCount = computed(
    () => this.approvals().filter((approval) => approval.status === 'approved').length,
  );
  readonly voucherCount = computed(() =>
    this.presales().reduce((total, series) => total + series.vouchers.length, 0),
  );
  readonly voucherAttentionCount = computed(() =>
    this.presales().reduce(
      (total, series) =>
        total +
        series.vouchers.filter((voucher) =>
          ['REFUNDING', 'REDEEMING', 'PENDING_ISSUANCE', 'ISSUANCE_SUBMITTED'].includes(
            voucher.state,
          ),
        ).length,
      0,
    ),
  );
  readonly tasks = computed<DeskTask[]>(() => {
    const current = this.subject()?.toLowerCase() ?? '';
    const tasks: DeskTask[] = [];
    for (const approval of this.approvals()) {
      if (!approval.signatures.some((item) => item.signerAddress.toLowerCase() === current)) {
        tasks.push({
          id: approval.operationId,
          title: this.approvalTitle(approval),
          body: 'A consequential testnet action is waiting for your independent review.',
          route: ['/admin/approvals'],
          label: 'Review',
          urgency: 'review',
        });
      } else if (approval.status === 'approved') {
        tasks.push({
          id: `execute-${approval.operationId}`,
          title: this.approvalTitle(approval),
          body: 'Required approvals are recorded. A signing administrator may execute the exact request.',
          route: ['/admin/approvals'],
          label: 'Execute',
          urgency: 'now',
        });
      }
    }
    for (const collection of this.collections()) {
      const blocking = collection.comments.filter(
        (comment) => comment.blocking && !comment.resolved,
      ).length;
      if (blocking || (!collection.readiness.ready && collection.state !== 'PUBLISHED')) {
        tasks.push({
          id: `collection-${collection.id}`,
          title: collection.dossier.title,
          body: blocking
            ? `${blocking} blocking review comment${blocking === 1 ? '' : 's'} must be resolved.`
            : `${collection.readiness.issues.length} readiness check${collection.readiness.issues.length === 1 ? '' : 's'} remain.`,
          route: ['/admin/collections', collection.id],
          label: 'Open collection',
          urgency: blocking ? 'now' : 'waiting',
        });
      }
    }
    if (this.voucherAttentionCount()) {
      tasks.push({
        id: 'voucher-fulfillment',
        title: 'Voucher fulfillment needs review',
        body: `${this.voucherAttentionCount()} voucher state${this.voucherAttentionCount() === 1 ? '' : 's'} are awaiting deterministic delivery or refund processing.`,
        route: ['/admin/sales'],
        label: 'Review sales',
        urgency: 'now',
      });
    }
    return tasks.slice(0, 12);
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const errors: string[] = [];
    const [feature, collections, approvals, presales, solsMarket] = await Promise.allSettled([
      this.collectionApi.featureStatus(),
      this.collectionApi.list(),
      this.approvalApi.list('active'),
      this.collectionApi.listPresales(),
      this.solsMarketApi.readMarket(),
    ]);
    if (feature.status === 'fulfilled') this.feature.set(feature.value);
    else errors.push(formatError(feature.reason));
    if (collections.status === 'fulfilled') this.collections.set(collections.value.collections);
    else errors.push(formatError(collections.reason));
    if (approvals.status === 'fulfilled') this.approvals.set(approvals.value.operations);
    else errors.push(formatError(approvals.reason));
    if (presales.status === 'fulfilled') this.presales.set(presales.value);
    else errors.push(formatError(presales.reason));
    if (solsMarket.status === 'fulfilled') this.solsMarket.set(solsMarket.value);
    else errors.push(formatError(solsMarket.reason));
    this.error.set(errors.length ? [...new Set(errors)].join(' ') : null);
    this.loading.set(false);
  }

  collectionSummary(collection: CollectionWorkspace): string {
    if (collection.state === 'PUBLISHED') return 'Published and chain-verifiable';
    if (collection.readiness.ready) return 'Ready for independent review and sealing';
    return `${collection.readiness.issues.length} readiness checks remain`;
  }

  shortWallet(value: string): string {
    return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
  }

  logout(): void {
    this.session.logoutAndRedirect();
  }

  private approvalTitle(approval: AdminOperationApproval): string {
    return approval.operation
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
