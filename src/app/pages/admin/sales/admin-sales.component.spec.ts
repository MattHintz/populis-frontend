import { TestBed } from '@angular/core/testing';

import { CollectionApiService, PresaleVoucher } from '../../../services/collection-api.service';
import { AdminOperationApprovalService } from '../../../services/admin-operation-approval.service';
import { AdminStripeOperation, AdminStripeOperationsService } from '../../../services/admin-stripe-operations.service';
import { AdminSalesComponent } from './admin-sales.component';

describe('AdminSalesComponent', () => {
  let component: AdminSalesComponent;
  let approvals: jasmine.SpyObj<AdminOperationApprovalService>;

  beforeEach(() => {
    const collections = jasmine.createSpyObj<CollectionApiService>(
      'CollectionApiService',
      ['listPresales'],
    );
    collections.listPresales.and.resolveTo([]);
    const stripe = jasmine.createSpyObj<AdminStripeOperationsService>(
      'AdminStripeOperationsService',
      ['list', 'detail', 'reconcile'],
    );
    stripe.list.and.resolveTo([]);
    approvals = jasmine.createSpyObj<AdminOperationApprovalService>(
      'AdminOperationApprovalService',
      ['prepareAndSign'],
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: CollectionApiService, useValue: collections },
        { provide: AdminStripeOperationsService, useValue: stripe },
        { provide: AdminOperationApprovalService, useValue: approvals },
      ],
    });
    component = TestBed.runInInjectionContext(() => new AdminSalesComponent());
  });

  it('renders Stripe voucher principal as USD cents, not XCH units', () => {
    const voucher = {
      paymentRail: 'STRIPE_USD',
      paymentPrincipal: 23_129,
    } as PresaleVoucher;

    expect(component.paymentAmount(voucher)).toBe('$231.29');
    expect(component.paymentRail(voucher)).toBe('Stripe USD');
  });

  it('preserves Base USDC and Testnet11 XCH display units', () => {
    expect(
      component.paymentAmount({
        paymentRail: 'BASE_SEPOLIA_USDC',
        paymentPrincipal: 23_129_000,
      } as PresaleVoucher),
    ).toBe('$23.129');
    expect(
      component.paymentRail({ paymentRail: 'CHIA_XCH' } as PresaleVoucher),
    ).toBe('Testnet11 XCH');
  });

  it('waits for final dispute evidence and never imposes a time lock', () => {
    const operation = {
      state: 'DISPUTED',
      disputeId: 'dp_test',
      disputeStatus: 'under_review',
    } as AdminStripeOperation;
    expect(component.disputeResolutionFor(operation)).toBeNull();
    expect(component.disputeHelp(operation)).toContain('Vault custody is unchanged');

    operation.disputeStatus = 'won';
    expect(component.disputeResolutionFor(operation)).toBe('RESTORE_AFTER_WIN');
  });

  it('routes a final dispute through the existing owner-plus-one inbox', async () => {
    approvals.prepareAndSign.and.resolveTo({
      status: 'pending',
    } as never);
    const operation = {
      purchaseId: `0x${'a'.repeat(64)}`,
      revision: 9,
      disputeStatus: 'lost',
    } as AdminStripeOperation;

    await component.requestDisputeResolution(
      operation,
      'ACCEPT_LOSS_AND_RESTORE',
    );

    expect(approvals.prepareAndSign).toHaveBeenCalledWith({
      operation: 'stripe.dispute.resolve',
      revision: 9,
      binding: {
        method: 'POST',
        path: `/protocol/stripe/admin/purchases/${encodeURIComponent(operation.purchaseId)}/resolve-dispute`,
        query: [],
        body: {
          expectedRevision: 9,
          resolution: 'ACCEPT_LOSS_AND_RESTORE',
        },
      },
    });
    expect(component.message()).toContain('One other required administrator');
  });
});
