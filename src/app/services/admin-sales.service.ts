import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AdminSessionService } from './admin-session.service';

export type PurchaseOperationState =
  | 'created'
  | 'zk_verified'
  | 'artifact_ready'
  | 'payment_pending'
  | 'paid'
  | 'protocol_verified'
  | 'finalized'
  | 'failed'
  | 'expired'
  | 'refund_pending'
  | 'manual_review';

export interface AdminPurchaseOperation {
  id: string;
  deliveryKind: 'smartdeed' | 'sgt';
  governanceProposalId: string | null;
  rail: 'chia_xch' | 'chia_cat' | 'base_usdc' | 'stripe';
  quantity: number;
  vaultLauncherId: string;
  state: PurchaseOperationState;
  artifactHash: string | null;
  purchaseId: string | null;
  artifact: Record<string, unknown> | null;
  settlementEvidence: Record<string, unknown>;
  createdAt: string | number | null;
  updatedAt: string | number | null;
  expiresAt: string | number | null;
}

interface PurchaseOperationsResponse {
  purchaseOperations: AdminPurchaseOperation[];
}

@Injectable({ providedIn: 'root' })
export class AdminSalesService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AdminSessionService);
  private readonly base = environment.faucetApi;

  listPurchases(options: { state?: PurchaseOperationState; limit?: number } = {}): Promise<AdminPurchaseOperation[]> {
    let params = new HttpParams().set('limit', String(options.limit ?? 100));
    if (options.state) params = params.set('state', options.state);
    return firstValueFrom(
      this.http.get<PurchaseOperationsResponse>(`${this.base}/admin/sales/purchases`, {
        headers: new HttpHeaders({ Authorization: `Bearer ${this.session.requireJwt()}` }),
        params,
      }),
    ).then((response) => response.purchaseOperations);
  }

  reconcilePurchase(purchaseId: string): Promise<Record<string, unknown>> {
    return firstValueFrom(
      this.http.post<Record<string, unknown>>(
        `${this.base}/admin/sales/purchases/${encodeURIComponent(purchaseId)}/reconcile`,
        {},
        { headers: new HttpHeaders({ Authorization: `Bearer ${this.session.requireJwt()}` }) },
      ),
    );
  }
}
