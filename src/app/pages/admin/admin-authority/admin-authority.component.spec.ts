import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SigningKey } from 'ethers';

import { AdminSessionService } from '../../../services/admin-session.service';
import { OnChainStateService } from '../../../services/on-chain-state.service';
import { SolslotProtocolArtifactService } from '../../../services/solslot-protocol-artifact.service';
import { AdminAuthorityComponent } from './admin-authority.component';

describe('AdminAuthorityComponent', () => {
  let fixture: ComponentFixture<AdminAuthorityComponent>;

  beforeEach(async () => {
    const roster = [publicKey(1), publicKey(2), publicKey(3)];
    const artifact = {
      artifact: {
        artifactHash: hash('a1'),
        adminAuthority: {
          threshold: 2,
          policy: 'owner-plus-one',
          rosterHash: hash('a2'),
          mipsRootHash: hash('a3'),
          compressedPubkeys: roster,
        },
        validatorSet: { threshold: 2, pubkeys: [hash('b1'), hash('b2'), hash('b3')] },
      },
    };
    const authority = {
      getAuthorityV2: jasmine.createSpy('getAuthorityV2').and.resolveTo({
        enabled: true,
        launcher_id: hash('c1'),
        mips_root_hash: hash('c2'),
        admins_hash: hash('c3'),
        pending_ops_hash: hash('c4'),
        authority_version: 1,
        state_hash: hash('c5'),
        phase: '4-gating-source',
        gating_source: 'SOLSLOT_ADMIN_PUBKEY_ALLOWLIST',
        informational_only: false,
      }),
    };
    const session = {
      subject: signal('0x1111111111111111111111111111111111111111'),
      pubkey: signal(roster[0]),
      logoutAndRedirect: jasmine.createSpy('logoutAndRedirect'),
    };
    await TestBed.configureTestingModule({
      imports: [AdminAuthorityComponent],
      providers: [
        provideRouter([]),
        { provide: AdminSessionService, useValue: session },
        { provide: SolslotProtocolArtifactService, useValue: artifact },
        { provide: OnChainStateService, useValue: authority },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminAuthorityComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('explains the team and owner-plus-one policy in ordinary language', () => {
    const text = pageText();
    expect(text).toContain('People and approval rules');
    expect(text).toContain('The owner and one coadministrator');
    expect(text).toContain('Owner administrator');
    expect(text).toContain('Coadministrator 2');
    expect(text).toContain('Coadministrator 3');
    expect(text).toContain('No one person can approve them alone');
  });

  it('teaches safe key handling without promising an unavailable shortcut', () => {
    const text = pageText();
    expect(text).toContain('Never put a recovery phrase in Solslot');
    expect(text).toContain('Do not improvise a key change');
    expect(text).toContain('simplified signing workflow is not enabled');
    expect(text).toContain('SGT voting does not replace the administrator authority');
  });

  function pageText(): string {
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }
});

function publicKey(value: number): string {
  return SigningKey.computePublicKey(`0x${value.toString(16).padStart(64, '0')}`, true);
}

function hash(byte: string): string {
  return `0x${byte.repeat(32)}`;
}
