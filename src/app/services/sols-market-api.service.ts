import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SolsMarketApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.faucetApi.replace(/\/$/, '');

  readMarket(): Promise<SolsMarketSnapshot> {
    return firstValueFrom(
      this.http.get<SolsMarketSnapshot>(`${this.base}/sols/market`, {
        withCredentials: true,
      }),
    );
  }
}

export type SolsMarketOutcome = 'READY' | 'WAITING' | 'PAUSED' | 'LOCKED';

export interface SolsMarketOpportunity {
  deedId: string;
  deedLauncherId: string;
  deedCoinId: string;
  collectionId: string;
  collectionSlug: string;
  collectionTitle: string;
  metadataRoot: string;
  sharePpm: number;
  navValueMojos: string;
  totalSolsMojos: string;
  chainVerified: true;
  confirmedHeight: number;
}

export interface SolsMarketSnapshot {
  schemaVersion: 1;
  network: 'testnet11';
  outcome: SolsMarketOutcome;
  title: string;
  body: string;
  pool: Record<string, unknown> | null;
  navRegistry: Record<string, unknown> | null;
  opportunities: SolsMarketOpportunity[];
  verifiedOpportunityCount: number;
  rejectedCandidateCount: number;
  provider?: Record<string, unknown>;
}
