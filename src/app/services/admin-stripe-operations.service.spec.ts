import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AdminSessionService } from './admin-session.service';
import { AdminStripeOperationsService } from './admin-stripe-operations.service';

describe('AdminStripeOperationsService', () => {
  let service: AdminStripeOperationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AdminSessionService,
          useValue: { requireJwt: () => 'admin-jwt' },
        },
      ],
    });
    service = TestBed.inject(AdminStripeOperationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the PII-free Stripe queue with admin authentication', async () => {
    const pending = service.list('REVIEW_REQUIRED');
    const request = http.expectOne(
      `${environment.faucetApi}/protocol/stripe/admin/purchases?state=REVIEW_REQUIRED`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer admin-jwt');
    request.flush({ ok: true, operations: [] });
    await expectAsync(pending).toBeResolvedTo([]);
  });

  it('reconciles only an exact purchase revision', async () => {
    const pending = service.reconcile('0x' + 'a'.repeat(64), 7);
    const request = http.expectOne(
      `${environment.faucetApi}/protocol/stripe/admin/purchases/${encodeURIComponent('0x' + 'a'.repeat(64))}/reconcile`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ expectedRevision: 7 });
    request.flush({ ok: true, operation: {}, pendingEventCount: 0 });
    await pending;
  });
});
