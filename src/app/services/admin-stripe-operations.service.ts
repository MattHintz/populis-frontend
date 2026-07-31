import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AdminSessionService } from './admin-session.service';

export interface AdminStripeOperation {
  purchaseId: string;
  revision: number;
  state: string;
  purchaseKind: 'DIRECT' | 'PRESALE';
  presaleTermsHash: string;
  rail: string;
  deedLauncherId: string;
  approvedVaultLauncherId: string;
  baseAmountMinor: string;
  technologyFeeMinor: string;
  processingChargeMinor: string;
  totalAmountMinor: string;
  softHoldExpiresAt: number | null;
  reservationCoinId: string | null;
  reservationBundleId: string | null;
  reservationExpiresAt: number | null;
  reservationConfirmationHeight: number | null;
  paymentIntentId: string | null;
  paymentMethodFamily: string | null;
  fundingType: string | null;
  paymentMethodReadyAt: number | null;
  stripeEventId: string | null;
  receiptHash: string | null;
  deliveryBundleId: string | null;
  expectedOutputCoinId: string | null;
  mempoolObservedAt: number | null;
  confirmationHeight: number | null;
  inventoryReleaseBundleId: string | null;
  inventoryReleaseOutputCoinId: string | null;
  inventoryReleaseConfirmationHeight: number | null;
  refundRequestHash: string | null;
  refundRequestedAt: number | null;
  feeMojos: string | null;
  refundId: string | null;
  refundedMinor: string;
  disputeId: string | null;
  disputeStatus: string | null;
  disputeEventId: string | null;
  disputeResolution: 'RESTORE_AFTER_WIN' | 'ACCEPT_LOSS_AND_RESTORE' | null;
  disputeResolvedAt: number | null;
  disputeResolutionOperationId: string | null;
  lastError: string | null;
  updatedAt: number;
}

export interface AdminStripeHistoryEvent {
  fromState: string | null;
  toState: string;
  revision: number;
  actor: string;
  reason: string | null;
  evidence: Record<string, unknown>;
  createdAt: number;
}

interface StripeOperationListResponse {
  ok: boolean;
  operations: AdminStripeOperation[];
}

export interface AdminStripeOperationDetail {
  ok: boolean;
  operation: AdminStripeOperation;
  history: AdminStripeHistoryEvent[];
}

@Injectable({ providedIn: 'root' })
export class AdminStripeOperationsService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AdminSessionService);
  private readonly base = environment.faucetApi;

  async list(state?: string): Promise<AdminStripeOperation[]> {
    const query = state ? `?state=${encodeURIComponent(state)}` : '';
    const response = await firstValueFrom(
      this.http.get<StripeOperationListResponse>(
        `${this.base}/protocol/stripe/admin/purchases${query}`,
        { headers: this.headers() },
      ),
    );
    return response.operations;
  }

  detail(purchaseId: string): Promise<AdminStripeOperationDetail> {
    return firstValueFrom(
      this.http.get<AdminStripeOperationDetail>(
        `${this.base}/protocol/stripe/admin/purchases/${encodeURIComponent(purchaseId)}`,
        { headers: this.headers() },
      ),
    );
  }

  reconcile(
    purchaseId: string,
    expectedRevision: number,
  ): Promise<{ ok: boolean; operation: AdminStripeOperation; pendingEventCount: number }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; operation: AdminStripeOperation; pendingEventCount: number }>(
        `${this.base}/protocol/stripe/admin/purchases/${encodeURIComponent(purchaseId)}/reconcile`,
        { expectedRevision },
        { headers: this.headers() },
      ),
    );
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.session.requireJwt()}` });
  }
}
