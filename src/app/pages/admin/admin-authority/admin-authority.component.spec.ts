import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AdminRecoveryBackupCryptoService } from '../../../services/admin-recovery-backup-crypto.service';
import { AdminRecoveryDriveService } from '../../../services/admin-recovery-drive.service';
import { AdminRecoveryKitService } from '../../../services/admin-recovery-kit.service';
import { AdminSecurityService, AdminSecurityStatus } from '../../../services/admin-security.service';
import { AdminSessionService } from '../../../services/admin-session.service';
import { EvmWalletService } from '../../../services/evm-wallet.service';
import { SolslotProtocolArtifactService } from '../../../services/solslot-protocol-artifact.service';
import { AdminAuthorityComponent } from './admin-authority.component';

describe('AdminAuthorityComponent', () => {
  let fixture: ComponentFixture<AdminAuthorityComponent>;

  beforeEach(async () => {
    const security = {
      status: jasmine.createSpy('status').and.resolveTo(status()),
    };
    const session = {
      isAuthenticated: signal(true),
    };
    await TestBed.configureTestingModule({
      imports: [AdminAuthorityComponent],
      providers: [
        provideRouter([]),
        { provide: AdminSecurityService, useValue: security },
        {
          provide: AdminRecoveryKitService,
          useValue: { clear: jasmine.createSpy('clear') },
        },
        { provide: AdminRecoveryBackupCryptoService, useValue: {} },
        { provide: AdminRecoveryDriveService, useValue: {} },
        {
          provide: EvmWalletService,
          useValue: {
            address: signal(null),
          },
        },
        { provide: AdminSessionService, useValue: session },
        {
          provide: SolslotProtocolArtifactService,
          useValue: { artifact: null },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminAuthorityComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('explains the fixed owner-plus-one rule and recovery readiness', () => {
    const text = pageText();
    expect(text).toContain('Security & Access');
    expect(text).toContain('Owner plus either coadministrator');
    expect(text).toContain('Cannot be changed by recovery');
    expect(text).toContain('3 of 3 ready');
  });

  it('teaches the no-backdoor and clear-signing safety rules', () => {
    const text = pageText();
    expect(text).toContain('Solslot support will never ask for the 24 words');
    expect(text).toContain('Reject unknown Chia effects or EVM calls');
    expect(text).toContain('Total loss');
  });

  it('offers guided daily-wallet rotation instead of a disabled control', () => {
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((candidate) => candidate.textContent?.includes('Rotate wallet'));
    expect(button).toBeTruthy();
    expect(button?.disabled).toBeFalse();
  });

  function pageText(): string {
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }
});

function status(): AdminSecurityStatus {
  const recoveryKits = ([0, 1, 2] as const).map((slot) => ({
    ceremonyId: `0x${'11'.repeat(32)}`,
    slot,
    revision: 1,
    evmGuardian: `0x${String(slot + 1).repeat(40)}`,
    recoveryBlsPubkey: `0x${String(slot + 1).repeat(96)}`,
    recoveryBlsCommitment: `0x${String(slot + 1).repeat(64)}`,
    drillChallengeHash: `0x${String(slot + 1).repeat(64)}`,
    drillVerifiedAt: 1_800_000_000,
    offlineCopyConfirmed: true,
    secondDeviceConfirmed: true,
    backupStatus: 'NOT_CONFIGURED' as const,
    backupRevision: null,
    backupCiphertextHash: null,
    backupVerifiedAt: null,
    updatedAt: 1_800_000_000,
  }));
  return {
    schemaVersion: 1,
    actor: {
      ceremonyId: `0x${'11'.repeat(32)}`,
      slot: 0,
      role: 'Owner',
      wallet: '0x1111111111111111111111111111111111111111',
    },
    authorityRule: 'owner_plus_one',
    authority: null,
    authorityNotice: 'Created during genesis.',
    recoveryKits,
    recoveryReady: true,
    myRecoveryKit: recoveryKits[0],
    pendingRecoveryKit: null,
    activeRecovery: null,
    operationsFrozen: false,
    recoveryPolicy: {
      routineDelaySeconds: 86400,
      lostKeyDelaySeconds: 604800,
      oldKeyVeto: true,
      replacementAcceptanceRequired: true,
      totalLossBypass: false,
    },
  };
}
