import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { ChiaWalletService } from './chia-wallet.service';
import { EvmWalletService } from './evm-wallet.service';
import { SessionService } from './session.service';
import { VaultOwnerSessionService } from './vault-owner-session.service';

describe('VaultOwnerSessionService', () => {
  const launcher = '0x' + '11'.repeat(32);
  let service: VaultOwnerSessionService;
  let http: HttpTestingController;
  let chia: jasmine.SpyObj<ChiaWalletService>;

  beforeEach(() => {
    chia = jasmine.createSpyObj<ChiaWalletService>('ChiaWalletService', ['signMessage']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            session: signal({
              authType: 'chia_bls',
              vaultLauncherId: launcher,
            }),
          },
        },
        { provide: ChiaWalletService, useValue: chia },
        {
          provide: EvmWalletService,
          useValue: jasmine.createSpyObj<EvmWalletService>('EvmWalletService', ['signTypedData']),
        },
      ],
    });
    service = TestBed.inject(VaultOwnerSessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reuses a valid HttpOnly vault session without another signature', async () => {
    const promise = service.ensure(launcher);
    const request = http.expectOne(
      `${environment.faucetApi}/zkpassport/enrollments/${launcher}/session`,
    );
    expect(request.request.withCredentials).toBeTrue();
    request.flush({
      vaultLauncherId: launcher,
      authType: 'chia_bls',
      network: 'testnet11',
      protocolVersion: 'solslot-v2',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    expect((await promise).vaultLauncherId).toBe(launcher);
    expect(chia.signMessage).not.toHaveBeenCalled();
  });

  it('signs the existing CHIP-0002 challenge when the cookie is absent', async () => {
    chia.signMessage.and.resolveTo('0x' + '33'.repeat(96));
    const promise = service.ensure(launcher);
    http.expectOne(`${environment.faucetApi}/zkpassport/enrollments/${launcher}/session`).flush(
      { detail: 'missing' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const challenge = http.expectOne(
      `${environment.faucetApi}/zkpassport/enrollments/${launcher}/session/challenge`,
    );
    challenge.flush({
      challengeId: 'challenge-id',
      vaultLauncherId: launcher,
      action: 'session_login',
      payloadHash: '0x' + '22'.repeat(32),
      authType: 'chia_bls',
      expiresAt: Math.floor(Date.now() / 1000) + 120,
      messageHex: '0x' + '44'.repeat(32),
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const create = http.expectOne(
      `${environment.faucetApi}/zkpassport/enrollments/${launcher}/session`,
    );
    expect(create.request.withCredentials).toBeTrue();
    expect(create.request.body).toEqual({
      ownerAuth: {
        challengeId: 'challenge-id',
        signature: '0x' + '33'.repeat(96),
      },
    });
    create.flush({
      vaultLauncherId: launcher,
      authType: 'chia_bls',
      network: 'testnet11',
      protocolVersion: 'solslot-v2',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    expect((await promise).authType).toBe('chia_bls');
    expect(chia.signMessage).toHaveBeenCalledOnceWith('0x' + '44'.repeat(32));
  });
});
