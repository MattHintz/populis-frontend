import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CollectionApiService } from '../../../services/collection-api.service';
import { AdminPurchaseOperation, AdminSalesService } from '../../../services/admin-sales.service';
import { AdminSessionService } from '../../../services/admin-session.service';
import { AdminSalesComponent } from './admin-sales.component';

const PURCHASES: AdminPurchaseOperation[] = [
  {
    id: 'pi_smartdeed',
    deliveryKind: 'smartdeed',
    governanceProposalId: null,
    rail: 'stripe',
    quantity: 1,
    vaultLauncherId: `0x${'11'.repeat(32)}`,
    state: 'payment_pending',
    artifactHash: `sha256:${'22'.repeat(32)}`,
    purchaseId: `0x${'33'.repeat(32)}`,
    artifact: {
      deedLauncherId: `0x${'44'.repeat(32)}`,
      grossUsdAmountMinor: '10100',
    },
    settlementEvidence: { payment_intent_id: 'pi_stripe_test' },
    createdAt: '2026-08-01 12:00:00',
    updatedAt: '2026-08-01 12:00:01',
    expiresAt: '2026-08-01 12:25:00',
  },
  {
    id: 'pi_sgt',
    deliveryKind: 'sgt',
    governanceProposalId: 'GOV-SGT-1',
    rail: 'base_usdc',
    quantity: 25000,
    vaultLauncherId: `0x${'55'.repeat(32)}`,
    state: 'manual_review',
    artifactHash: `sha256:${'66'.repeat(32)}`,
    purchaseId: `0x${'77'.repeat(32)}`,
    artifact: { grossUsdAmountMinor: '505000' },
    settlementEvidence: { transactionId: `0x${'88'.repeat(32)}` },
    createdAt: '2026-08-01 12:00:00',
    updatedAt: '2026-08-01 12:10:00',
    expiresAt: '2026-08-01 12:25:00',
  },
];

describe('AdminSalesComponent', () => {
  let fixture: ComponentFixture<AdminSalesComponent>;
  let sales: jasmine.SpyObj<AdminSalesService>;
  let collections: jasmine.SpyObj<CollectionApiService>;

  beforeEach(async () => {
    sales = jasmine.createSpyObj<AdminSalesService>('AdminSalesService', ['listPurchases', 'reconcilePurchase']);
    collections = jasmine.createSpyObj<CollectionApiService>('CollectionApiService', ['listPresales']);
    sales.listPurchases.and.resolveTo(PURCHASES);
    sales.reconcilePurchase.and.resolveTo({ state: 'PAYMENT_VERIFIED' });
    collections.listPresales.and.resolveTo([]);
    await TestBed.configureTestingModule({
      imports: [AdminSalesComponent],
      providers: [
        provideRouter([]),
        { provide: AdminSalesService, useValue: sales },
        { provide: CollectionApiService, useValue: collections },
        { provide: AdminSessionService, useValue: { clear: () => undefined } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminSalesComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows SmartDeed and SGT operations with their distinct rails', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('SmartDeed');
    expect(text).toContain('Stripe');
    expect(text).toContain('25,000 SGT');
    expect(text).toContain('Base USDC');
    expect(text).toContain('Review required');
  });

  it('filters attention without inventing an unsafe retry action', () => {
    fixture.componentInstance.filter.set('ATTENTION');
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('25,000 SGT');
    expect(text).not.toContain('SmartDeed 0x44444444');
    expect(text).not.toContain('Retry');
    expect(text).toContain('exact authorized action');
  });

  it('checks only the stored Stripe purchase without accepting new terms', async () => {
    const paid = { ...PURCHASES[0], state: 'paid' as const };
    fixture.componentInstance.purchases.set([paid]);
    fixture.detectChanges();

    await fixture.componentInstance.checkDelivery(paid);

    expect(sales.reconcilePurchase).toHaveBeenCalledOnceWith(paid.purchaseId!);
  });

  it('shows the exact SGT output coin for a finalized Stripe allocation', () => {
    const expectedSgtCoinId = `0x${'99'.repeat(32)}`;
    const sgtStripe = {
      ...PURCHASES[1],
      rail: 'stripe' as const,
      state: 'finalized' as const,
      settlementEvidence: {
        expectedSgtCoinId,
        expectedDeliveryCoinId: expectedSgtCoinId,
      },
    };

    expect(fixture.componentInstance.evidenceReference(sgtStripe)).toBe(expectedSgtCoinId);
    expect(fixture.componentInstance.purchaseTitle(sgtStripe)).toBe('25,000 SGT');
  });

  it('renders Stripe voucher principal as USD cents', () => {
    const voucher = {
      paymentRail: 'STRIPE_USD',
      paymentPrincipal: 23_129,
    } as Parameters<AdminSalesComponent['voucherPaymentAmount']>[0];

    expect(fixture.componentInstance.voucherPaymentAmount(voucher)).toBe('$231.29');
    expect(fixture.componentInstance.voucherRail(voucher)).toBe('Stripe USD');
  });
});
