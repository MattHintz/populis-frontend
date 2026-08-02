import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { ChiaWalletService } from './chia-wallet.service';
import { EvmWalletService } from './evm-wallet.service';
import { SessionService } from './session.service';
import { Eip712TypedData } from './solslot-api.service';

export interface VaultOwnerChallenge {
  challengeId: string;
  vaultLauncherId: string;
  action: 'session_login';
  payloadHash: string;
  authType: 'evm' | 'chia_bls';
  expiresAt: number;
  typedData?: Eip712TypedData | null;
  messageHex?: string | null;
}

export interface VaultOwnerSession {
  vaultLauncherId: string;
  authType: 'evm' | 'chia_bls';
  network: 'testnet11';
  protocolVersion: 'solslot-v2';
  expiresAt: number;
}

/** Reuses the zkPassport vault-owner challenge and HttpOnly session cookie. */
@Injectable({ providedIn: 'root' })
export class VaultOwnerSessionService {
  private readonly http = inject(HttpClient);
  private readonly sessions = inject(SessionService);
  private readonly chia = inject(ChiaWalletService);
  private readonly evm = inject(EvmWalletService);
  private readonly base = environment.faucetApi;
  private readonly active = new Map<string, VaultOwnerSession>();

  async ensure(vaultLauncherId: string): Promise<VaultOwnerSession> {
    const launcher = normalizeHex32(vaultLauncherId);
    const current = this.sessions.session();
    if (!current || normalizeHex32(current.vaultLauncherId) !== launcher) {
      throw new Error('Connect the wallet that owns this protocol vault before voting.');
    }

    const now = Math.floor(Date.now() / 1000);
    const cached = this.active.get(launcher);
    if (cached && cached.expiresAt > now + 15) return cached;

    const recovered = await this.get(launcher);
    if (recovered) return this.accept(recovered, launcher, current.authType);

    const challenge = await firstValueFrom(
      this.http.post<VaultOwnerChallenge>(
        `${this.base}/zkpassport/enrollments/${encodeURIComponent(launcher)}/session/challenge`,
        {},
        { withCredentials: true },
      ),
    );
    this.validateChallenge(challenge, launcher, current.authType);

    let signature: string;
    if (challenge.authType === 'chia_bls') {
      if (!challenge.messageHex) throw new Error('The API did not return a Chia owner challenge.');
      signature = await this.chia.signMessage(challenge.messageHex);
    } else {
      if (!challenge.typedData) throw new Error('The API did not return an EVM owner challenge.');
      signature = await this.evm.signTypedData(challenge.typedData);
    }

    const created = await firstValueFrom(
      this.http.post<VaultOwnerSession>(
        `${this.base}/zkpassport/enrollments/${encodeURIComponent(launcher)}/session`,
        { ownerAuth: { challengeId: challenge.challengeId, signature: normalizeHex(signature) } },
        { withCredentials: true },
      ),
    );
    return this.accept(created, launcher, current.authType);
  }

  private async get(launcher: string): Promise<VaultOwnerSession | null> {
    try {
      return await firstValueFrom(
        this.http.get<VaultOwnerSession>(
          `${this.base}/zkpassport/enrollments/${encodeURIComponent(launcher)}/session`,
          { withCredentials: true },
        ),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) return null;
      throw error;
    }
  }

  private accept(
    session: VaultOwnerSession,
    launcher: string,
    authType: string,
  ): VaultOwnerSession {
    if (
      normalizeHex32(session.vaultLauncherId) !== launcher ||
      session.authType !== authType ||
      session.network !== 'testnet11' ||
      session.protocolVersion !== 'solslot-v2' ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      throw new Error('The API returned an invalid vault-owner session.');
    }
    this.active.set(launcher, session);
    return session;
  }

  private validateChallenge(
    challenge: VaultOwnerChallenge,
    launcher: string,
    authType: string,
  ): void {
    if (
      normalizeHex32(challenge.vaultLauncherId) !== launcher ||
      challenge.action !== 'session_login' ||
      challenge.authType !== authType ||
      challenge.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      throw new Error('The API returned an invalid or expired owner challenge.');
    }
  }
}

function normalizeHex(value: string): string {
  return `0x${value.trim().toLowerCase().replace(/^0x/, '')}`;
}

function normalizeHex32(value: string): string {
  const normalized = normalizeHex(value);
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Vault launcher ID must be 32-byte hexadecimal.');
  }
  return normalized;
}
