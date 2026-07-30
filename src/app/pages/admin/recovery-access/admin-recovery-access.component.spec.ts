import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { createAdminRecoveryDrillPackage } from '../../../services/admin-recovery-handoff';
import { AdminRecoveryKitService } from '../../../services/admin-recovery-kit.service';
import { RecoveryDrillChallenge } from '../../../services/admin-security.service';
import { AdminRecoveryAccessComponent } from './admin-recovery-access.component';

describe('AdminRecoveryAccessComponent', () => {
  let fixture: ComponentFixture<AdminRecoveryAccessComponent>;
  let component: AdminRecoveryAccessComponent;
  const recoveryKit = {
    unlock: jasmine.createSpy('unlock'),
    signDrill: jasmine.createSpy('signDrill').and.resolveTo({
      evmSignature: `0x${'22'.repeat(65)}`,
      blsSignature: `0x${'33'.repeat(96)}`,
    }),
    clear: jasmine.createSpy('clear'),
  };

  beforeEach(async () => {
    recoveryKit.unlock.calls.reset();
    recoveryKit.signDrill.calls.reset();
    recoveryKit.clear.calls.reset();
    await TestBed.configureTestingModule({
      imports: [AdminRecoveryAccessComponent],
      providers: [
        provideRouter([]),
        { provide: AdminRecoveryKitService, useValue: recoveryKit },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminRecoveryAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('explains that signing is local and no authority or funds change', () => {
    const text = pageText();
    expect(text).toContain('never contacts the Solslot API');
    expect(text).toContain('Solslot support will never ask for these words');
    expect(text).toContain('there is no support bypass');
  });

  it('refuses a package with an altered checksum', () => {
    const drillPackage = createAdminRecoveryDrillPackage(challenge());
    drillPackage.challenge.revision = 2;
    component.packageText = JSON.stringify(drillPackage);

    component.reviewPackage();

    expect(component.reviewedPackage()).toBeNull();
    expect(component.error()).toContain('checksum does not match');
  });

  it('signs locally and clears the phrase and in-memory keys', async () => {
    component.packageText = JSON.stringify(createAdminRecoveryDrillPackage(challenge()));
    component.reviewPackage();
    component.phrase = 'test phrase';
    component.trustedDeviceConfirmed = true;

    await component.signTest(component.reviewedPackage()!);

    expect(recoveryKit.unlock).toHaveBeenCalled();
    expect(recoveryKit.signDrill).toHaveBeenCalled();
    expect(component.resultText()).toContain(`0x${'22'.repeat(65)}`);
    expect(component.phrase).toBe('');
    expect(recoveryKit.clear).toHaveBeenCalled();
  });

  function pageText(): string {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }
});

function challenge(): RecoveryDrillChallenge {
  return {
    challengeId: `0x${'11'.repeat(32)}`,
    challengeHash: `0x${'22'.repeat(32)}`,
    expiresAt: Math.floor(Date.now() / 1000) + 900,
    revision: 1,
    evmTypedData: {
      types: {
        EIP712Domain: [],
        SolslotAdminRecoveryDrill: [],
      },
      primaryType: 'SolslotAdminRecoveryDrill',
      domain: { name: 'Solslot Admin Recovery', version: '1', chainId: 84532 },
      message: {
        slot: 0,
        dailyWallet: '0x1111111111111111111111111111111111111111',
        evmGuardian: '0x2222222222222222222222222222222222222222',
      },
    },
    blsSigningDigest: `0x${'33'.repeat(32)}`,
    recoveryBlsPath: 'm/12381/8444/2/0-unhardened',
    recoveryEvmPath: "m/44'/60'/0'/0/0",
  };
}
