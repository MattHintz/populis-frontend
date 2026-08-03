import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AdminSessionService } from './admin-session.service';
import { AdminSalesService } from './admin-sales.service';

describe('AdminSalesService', () => {
  let service: AdminSalesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminSessionService, useValue: { requireJwt: () => 'admin-jwt' } },
      ],
    });
    service = TestBed.inject(AdminSalesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the sanitized purchase feed through the administrator boundary', async () => {
    const promise = service.listPurchases({ state: 'payment_pending', limit: 25 });
    const request = http.expectOne(
      `${environment.faucetApi}/admin/sales/purchases?limit=25&state=payment_pending`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer admin-jwt');
    request.flush({ purchaseOperations: [{ id: 'pi_1', state: 'payment_pending' }] });

    expect((await promise)[0].id).toBe('pi_1');
  });

  it('reconciles only the purchase identifier already stored by the coordinator', async () => {
    const purchaseId = `0x${'33'.repeat(32)}`;
    const promise = service.reconcilePurchase(purchaseId);
    const request = http.expectOne(
      `${environment.faucetApi}/admin/sales/purchases/${purchaseId}/reconcile`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.get('Authorization')).toBe('Bearer admin-jwt');
    request.flush({ purchaseId, state: 'DELIVERY_SUBMITTED' });

    expect((await promise)['state']).toBe('DELIVERY_SUBMITTED');
  });

  it('submits the exact wallet-signed redemption funding bundle', async () => {
    const proposalId = 'redemption-1';
    const promise = service.submitRedemptionFunding(proposalId, {
      coinSpends: [{
        coin: {
          parentCoinInfo: '11'.repeat(32),
          puzzleHash: `0x${'22'.repeat(32)}`,
          amount: 125_000,
        },
        puzzleReveal: 'ff01',
        solution: '0x80',
      }],
      aggregatedSignature: '33'.repeat(96),
    });
    const request = http.expectOne(
      `${environment.faucetApi}/admin/redemptions/${proposalId}/funding/submit`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer admin-jwt');
    expect(request.request.body).toEqual({
      spendBundle: {
        coin_spends: [{
          coin: {
            parent_coin_info: `0x${'11'.repeat(32)}`,
            puzzle_hash: `0x${'22'.repeat(32)}`,
            amount: 125_000,
          },
          puzzle_reveal: '0xff01',
          solution: '0x80',
        }],
        aggregated_signature: `0x${'33'.repeat(96)}`,
      },
    });
    request.flush({
      proposalId,
      chainState: 'AWAITING_EXECUTE',
      funding: { status: 'SUBMITTED' },
    });

    expect((await promise).funding.status).toBe('SUBMITTED');
  });

  it('resumes only the server-persisted exact funding bundle', async () => {
    const proposalId = 'redemption-2';
    const promise = service.resumeRedemptionFunding(proposalId);
    const request = http.expectOne(
      `${environment.faucetApi}/admin/redemptions/${proposalId}/funding/submit`,
    );
    expect(request.request.body).toEqual({});
    request.flush({
      proposalId,
      chainState: 'AWAITING_EXECUTE',
      funding: { status: 'SUBMITTED' },
    });

    expect((await promise).proposalId).toBe(proposalId);
  });
});
