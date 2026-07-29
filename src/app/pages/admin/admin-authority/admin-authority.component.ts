import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { computeAddress, SigningKey } from 'ethers';

import { AdminWorkspaceNavComponent } from '../../../components/admin-workspace/admin-workspace-nav.component';
import { AdminAuthorityV2Response } from '../../../services/admin-api.service';
import { AdminSessionService } from '../../../services/admin-session.service';
import { OnChainStateService } from '../../../services/on-chain-state.service';
import { SolslotProtocolArtifactService } from '../../../services/solslot-protocol-artifact.service';
import { formatError } from '../../../utils/format-error';

interface AdministratorMember {
  slot: number;
  role: string;
  address: string;
  pubkey: string;
  current: boolean;
}

@Component({
  selector: 'solslot-admin-authority',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminWorkspaceNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <solslot-admin-workspace-nav />
    <main class="team-page">
      <header class="page-header">
        <div>
          <span class="eyebrow">Administrator team</span>
          <h1>People and approval rules</h1>
          <p>
            See who can act, how important decisions are approved, and how to protect
            administrator access.
          </p>
        </div>
        <a routerLink="/admin/approvals" class="secondary-action">Open approvals</a>
      </header>

      @if (error(); as message) {
        <section class="notice notice--error" role="alert">
          <strong>Team verification needs attention</strong>
          <span>{{ message }}</span>
          <button type="button" (click)="reload()">Try again</button>
        </section>
      }

      <section class="approval-rule" aria-labelledby="approval-rule-title">
        <div class="rule-number">2</div>
        <div>
          <span class="eyebrow">Approval policy</span>
          <h2 id="approval-rule-title">The owner and one coadministrator</h2>
          <p>
            Important actions require the owner plus either Administrator 2 or
            Administrator 3. No one person can approve them alone.
          </p>
        </div>
        <span [class]="authorityStatusClass()">{{ authorityStatusLabel() }}</span>
      </section>

      <section class="team-section" aria-labelledby="active-team-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Active team</span>
            <h2 id="active-team-title">Administrator wallets</h2>
          </div>
          <span>{{ members().length }} of 3 recorded</span>
        </div>

        @if (loading()) {
          <div class="empty">Verifying the administrator team...</div>
        } @else if (!members().length) {
          <div class="empty">
            <strong>No signed administrator team is available yet</strong>
            <span>Complete administrator enrollment in the guided launch.</span>
            <a routerLink="/admin/genesis">Open protocol launch</a>
          </div>
        } @else {
          <div class="member-list">
            @for (member of members(); track member.slot) {
              <article [class.is-current]="member.current">
                <div class="member-slot">{{ member.slot }}</div>
                <div>
                  <span>{{ member.role }}</span>
                  <strong>{{ shortAddress(member.address) }}</strong>
                  @if (member.current) {
                    <small>Signed in on this device</small>
                  } @else {
                    <small>Enrolled administrator wallet</small>
                  }
                </div>
                <details>
                  <summary>Wallet details</summary>
                  <dl>
                    <div><dt>Address</dt><dd>{{ member.address }}</dd></div>
                    <div><dt>Public key</dt><dd>{{ member.pubkey }}</dd></div>
                  </dl>
                </details>
              </article>
            }
          </div>
        }
      </section>

      <div class="guidance-grid">
        <section aria-labelledby="daily-safety-title">
          <span class="eyebrow">Everyday safety</span>
          <h2 id="daily-safety-title">Protect your administrator wallet</h2>
          <ol>
            <li>
              <strong>Keep recovery material offline</strong>
              <span>Never put a recovery phrase in Solslot, email, chat, or cloud notes.</span>
            </li>
            <li>
              <strong>Read every decision receipt</strong>
              <span>Match the network, amount, recipient, and expected result in your wallet.</span>
            </li>
            <li>
              <strong>Stop when anything differs</strong>
              <span>Reject the request and ask another administrator to review it independently.</span>
            </li>
          </ol>
        </section>

        <section aria-labelledby="lost-access-title">
          <span class="eyebrow">Lost or compromised access</span>
          <h2 id="lost-access-title">Do not improvise a key change</h2>
          <p>
            Contact the owner and a second administrator immediately. Pause affected
            operations, preserve the old wallet evidence, and use the governed key-recovery
            path. Never edit a roster file or server setting to substitute a wallet.
          </p>
          <div class="recovery-status">
            <strong>Guided key replacement</strong>
            <span>{{ keyRecoveryStatus() }}</span>
          </div>
          <details>
            <summary>How protocol key replacement works</summary>
            <p>
              A new key is added to the same administrator slot and confirmed after the
              protocol cooldown. Only then can the old key be removed. Adding another
              administrator slot is a separate current-team quorum decision. SGT voting does
              not replace the administrator authority required by these key operations.
            </p>
          </details>
        </section>
      </div>

      <section class="launch-note">
        <div>
          <strong>Before the first launch</strong>
          <span>
            All three administrators enroll fresh through the launch wizard. Confirm each
            person is using the intended long-term wallet before final approval.
          </span>
        </div>
        <a routerLink="/admin/genesis">Review launch enrollment</a>
      </section>

      <details class="chain-evidence">
        <summary>On-chain authority evidence</summary>
        @if (authority(); as auth) {
          <dl>
            <div><dt>Authority status</dt><dd>{{ auth.enabled ? 'Enabled' : 'Not active' }}</dd></div>
            <div><dt>Launcher ID</dt><dd>{{ auth.launcher_id || 'Not available' }}</dd></div>
            <div><dt>State hash</dt><dd>{{ auth.state_hash || 'Not available' }}</dd></div>
            <div><dt>Authority version</dt><dd>{{ auth.authority_version ?? 'Waiting' }}</dd></div>
            <div><dt>Chain phase</dt><dd>{{ auth.phase }}</dd></div>
          </dl>
        }
        @if (artifactService.artifact; as artifact) {
          <dl>
            <div><dt>Signed artifact</dt><dd>{{ artifact.artifactHash }}</dd></div>
            <div><dt>Roster commitment</dt><dd>{{ artifact.adminAuthority.rosterHash }}</dd></div>
            <div><dt>MIPS root</dt><dd>{{ artifact.adminAuthority.mipsRootHash }}</dd></div>
            <div>
              <dt>Validator threshold</dt>
              <dd>{{ artifact.validatorSet.threshold }} of {{ artifact.validatorSet.pubkeys.length }}</dd>
            </div>
          </dl>
        }
        <a routerLink="/admin/trust-roots">Open complete trust-root evidence</a>
      </details>
    </main>
  `,
  styles: [
    `
      :host { display:block; min-height:100vh; background:#06110f; color:#eefbf5; }
      .team-page { width:min(1100px,calc(100% - 32px)); margin:0 auto; padding:36px 0 80px; }
      .page-header,.section-heading,.launch-note { display:flex; align-items:center; justify-content:space-between; gap:20px; }
      .page-header { align-items:flex-end; padding-bottom:21px; border-bottom:1px solid #245144; }
      .eyebrow { color:#67e7ad; font:700 10px/1.2 var(--font-mono); text-transform:uppercase; }
      h1,h2 { font-family:var(--font-sans); letter-spacing:0; } h1 { margin:7px 0; font-size:35px; } h2 { margin:5px 0 0; font-size:21px; }
      p,.page-header p,.member-list small,.empty span,.launch-note span { color:#a9c2b8; }
      .page-header p { max-width:660px; }
      .secondary-action,.launch-note a,.empty a { padding:9px 12px; border:1px solid #4f8d77; background:#123329; color:#fff; text-decoration:none; font-size:12px; }
      .approval-rule { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:18px; margin-top:20px; padding:20px; border:1px solid #3c7461; background:#0d251e; }
      .rule-number { display:grid; width:48px; height:48px; place-items:center; border:1px solid #67e7ad; color:#67e7ad; font-size:22px; font-weight:700; }
      .approval-rule p { margin:6px 0 0; font-size:13px; }
      .authority-status { padding:5px 8px; border:1px solid #6c7951; color:#e5d18a; font:700 10px var(--font-mono); text-transform:uppercase; }
      .authority-status--ready { border-color:#4f8d77; color:#67e7ad; }
      .authority-status--blocked { border-color:#844f4f; color:#ffb49f; }
      .team-section { margin-top:16px; padding:20px; border:1px solid #245144; background:#0a1a16; }
      .section-heading > span { color:#8dab9f; font:11px var(--font-mono); }
      .member-list { display:grid; gap:1px; margin-top:16px; background:#245144; }
      .member-list article { display:grid; grid-template-columns:auto minmax(0,1fr) minmax(180px,.7fr); align-items:center; gap:14px; padding:15px; background:#081612; }
      .member-list article.is-current { background:#0d251e; }
      .member-slot { display:grid; width:34px; height:34px; place-items:center; border:1px solid #4f8d77; color:#67e7ad; font:700 12px var(--font-mono); }
      .member-list article > div:nth-child(2) { display:grid; gap:3px; }
      .member-list article > div:nth-child(2) > span { color:#91ada1; font-size:11px; }
      .member-list details { min-width:0; }
      summary { color:#80d8b1; font-size:11px; cursor:pointer; }
      .member-list dl,.chain-evidence dl { display:grid; gap:8px; margin:10px 0 0; }
      dt { color:#86a89a; font-size:10px; text-transform:uppercase; }
      dd { margin:3px 0 0; overflow-wrap:anywhere; color:#cce5db; font:10px var(--font-mono); }
      .guidance-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:16px; }
      .guidance-grid > section { padding:20px; border:1px solid #245144; background:#0a1a16; }
      .guidance-grid ol { display:grid; gap:14px; margin:18px 0 0; padding-left:20px; }
      .guidance-grid li { padding-left:5px; color:#67e7ad; }
      .guidance-grid li strong,.guidance-grid li span { display:block; }
      .guidance-grid li strong { color:#edf9f4; font-size:13px; }
      .guidance-grid li span,.guidance-grid p { margin-top:3px; color:#a9c2b8; font-size:12px; line-height:1.55; }
      .recovery-status { display:grid; gap:4px; margin:17px 0 13px; padding:12px; border-left:3px solid #e5c96e; background:#1a1b11; }
      .recovery-status strong { font-size:12px; } .recovery-status span { color:#cfbd7a; font-size:11px; }
      .guidance-grid details p { margin-top:8px; }
      .launch-note { margin-top:16px; padding:16px 18px; border:1px solid #245144; background:#091a16; }
      .launch-note > div { display:grid; gap:4px; } .launch-note span { font-size:12px; }
      .chain-evidence { margin-top:16px; padding:16px 18px; border:1px solid #245144; background:#071510; }
      .chain-evidence > summary { color:#9ab6aa; }
      .chain-evidence dl { grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:16px; }
      .chain-evidence dl div { padding:10px; border:1px solid #18382f; }
      .chain-evidence > a { display:inline-block; margin-top:14px; color:#80d8b1; font-size:11px; }
      .empty { display:grid; place-content:center; justify-items:center; gap:6px; min-height:170px; text-align:center; }
      .notice { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; margin-top:16px; padding:12px; }
      .notice--error { border:1px solid #844f4f; color:#ffc4c4; }
      .notice button { border:0; background:none; color:#ffb49f; cursor:pointer; }
      @media (max-width:760px) { .page-header,.launch-note { align-items:flex-start; flex-direction:column; } .guidance-grid { grid-template-columns:1fr; } .member-list article { grid-template-columns:auto 1fr; } .member-list details { grid-column:2; } }
      @media (max-width:540px) { .approval-rule { grid-template-columns:auto 1fr; } .approval-rule > span:last-child { grid-column:2; width:max-content; } .chain-evidence dl { grid-template-columns:1fr; } .notice { grid-template-columns:1fr; } }
    `,
  ],
})
export class AdminAuthorityComponent implements OnInit {
  private readonly onChain = inject(OnChainStateService);
  private readonly session = inject(AdminSessionService);
  readonly artifactService = inject(SolslotProtocolArtifactService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly authority = signal<AdminAuthorityV2Response | null>(null);

  readonly members = computed<AdministratorMember[]>(() => {
    const currentPubkey = this.session.pubkey()?.toLowerCase() ?? '';
    const roster = this.artifactService.artifact?.adminAuthority.compressedPubkeys ?? [];
    return roster.map((pubkey, index) => ({
      slot: index + 1,
      role: index === 0 ? 'Owner administrator' : `Coadministrator ${index + 1}`,
      address: computeAddress(SigningKey.computePublicKey(pubkey, false)),
      pubkey,
      current: pubkey.toLowerCase() === currentPubkey,
    }));
  });

  readonly keyRecoveryStatus = computed(() =>
    this.authority()?.enabled
      ? 'The protocol supports protected key changes. The simplified signing workflow is not enabled in this portal release.'
      : 'Available only after the administrator authority is confirmed on chain.',
  );

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.authority.set(await this.onChain.getAuthorityV2());
    } catch (error) {
      this.error.set(formatError(error));
    } finally {
      this.loading.set(false);
    }
  }

  authorityStatusLabel(): string {
    if (this.error()) return 'Verification failed';
    if (this.authority()?.enabled && this.members().length === 3) return 'Verified on chain';
    return 'Waiting for launch';
  }

  authorityStatusClass(): string {
    if (this.error()) return 'authority-status authority-status--blocked';
    return this.authority()?.enabled && this.members().length === 3
      ? 'authority-status authority-status--ready'
      : 'authority-status';
  }

  shortAddress(value: string): string {
    return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
  }
}
