import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AdminSessionService } from './admin-session.service';
import { SignedSpendBundle } from './chia-wallet.service';

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

export interface RedemptionFundingDestination {
  network: string;
  asset: 'wUSDC.b';
  assetId: string;
  recipientPuzzleHash: string;
  recipientAddress: string;
  catPuzzleHash: string;
}

export interface RedemptionFundingOperation {
  operationHash: string;
  status: 'PREPARED' | 'SUBMITTING' | 'SUBMITTED' | 'CONFIRMED';
  paymentAmount: string;
  paymentAssetId: string;
  recipientPuzzleHash: string;
  expectedFundingCoinId: string;
  transactionId: string | null;
  feeMojos: string | null;
  feeTargetSeconds: number | null;
  submissionProvider: string | null;
  mempoolObservedAt: string | null;
  confirmedHeight: number | null;
  updatedAt: number;
}

export interface AdminFundedRedemption {
  id: string;
  kind: 'FUNDED_REDEMPTION';
  state: 'DRAFT' | 'READY' | 'ACTIVE' | 'EXECUTED' | 'FAILED' | 'CANCELED';
  title: string;
  bill: {
    collectionWorkspaceId: string;
    settlementId: string;
    totalPaymentAmount: string;
    deedCount: number;
    allocations: Array<{
      deedLauncherId: string;
      sharePpm: number;
      paymentAmount: string;
    }>;
  };
  revision: number;
  queuePosition: number;
  expectedOutputCoinIds: string[];
  offers?: Array<{ coinId: string; confirmedHeight: number; spentHeight: number }>;
  availableOfferCount?: number;
  chainState?: string;
  executionBlocker?: string | null;
  funding?: RedemptionFundingOperation | null;
}

interface FundedRedemptionsResponse {
  redemptions: AdminFundedRedemption[];
  funding: RedemptionFundingDestination;
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

  listRedemptions(): Promise<FundedRedemptionsResponse> {
    return firstValueFrom(
      this.http.get<FundedRedemptionsResponse>(`${this.base}/admin/redemptions`, {
        headers: this.headers(),
      }),
    );
  }

  fundingDestination(): Promise<RedemptionFundingDestination> {
    return firstValueFrom(
      this.http.get<RedemptionFundingDestination>(
        `${this.base}/admin/redemptions/funding-destination`,
        { headers: this.headers() },
      ),
    );
  }

  createRedemption(input: {
    collectionId: string;
    title: string;
    totalPaymentUsd: string;
  }): Promise<{ redemption: AdminFundedRedemption; funding: RedemptionFundingDestination }> {
    return firstValueFrom(
      this.http.post<{ redemption: AdminFundedRedemption; funding: RedemptionFundingDestination }>(
        `${this.base}/admin/redemptions`,
        input,
        { headers: this.headers() },
      ),
    );
  }

  submitRedemptionFunding(
    proposalId: string,
    bundle: SignedSpendBundle,
  ): Promise<{
    proposalId: string;
    chainState: string;
    funding: RedemptionFundingOperation;
  }> {
    return firstValueFrom(
      this.http.post<{
        proposalId: string;
        chainState: string;
        funding: RedemptionFundingOperation;
      }>(
        `${this.base}/admin/redemptions/${encodeURIComponent(proposalId)}/funding/submit`,
        { spendBundle: toWireSpendBundle(bundle) },
        { headers: this.headers() },
      ),
    );
  }

  resumeRedemptionFunding(proposalId: string): Promise<{
    proposalId: string;
    chainState: string;
    funding: RedemptionFundingOperation;
  }> {
    return firstValueFrom(
      this.http.post<{
        proposalId: string;
        chainState: string;
        funding: RedemptionFundingOperation;
      }>(
        `${this.base}/admin/redemptions/${encodeURIComponent(proposalId)}/funding/submit`,
        {},
        { headers: this.headers() },
      ),
    );
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.session.requireJwt()}` });
  }
}

function toWireSpendBundle(bundle: SignedSpendBundle): Record<string, unknown> {
  return {
    coin_spends: bundle.coinSpends.map((spend) => ({
      coin: {
        parent_coin_info: normalizeHex(spend.coin.parentCoinInfo),
        puzzle_hash: normalizeHex(spend.coin.puzzleHash),
        amount: Number(spend.coin.amount),
      },
      puzzle_reveal: normalizeHex(spend.puzzleReveal),
      solution: normalizeHex(spend.solution),
    })),
    aggregated_signature: normalizeHex(bundle.aggregatedSignature),
  };
}

function normalizeHex(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X')
    ? `0x${value.slice(2).toLowerCase()}`
    : `0x${value.toLowerCase()}`;
}
