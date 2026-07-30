import { Injectable, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import {
  GOOGLE_VAULT_MAX_BACKUP_BYTES,
  SolslotVaultBackupEnvelope,
  VaultBackupCryptoService,
} from './vault-backup-crypto.service';

const GIS_SCRIPT_ID = 'solslot-google-identity-services';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILE_NAME = 'solslot_vault_backup_v1.json';
export const ADMIN_RECOVERY_BACKUP_FILE_NAME = 'solslot_admin_recovery_v1.json';
const MULTIPART_BOUNDARY_PREFIX = 'solslot-google-vault-';
export type SolslotAppDataFileName =
  | typeof BACKUP_FILE_NAME
  | typeof ADMIN_RECOVERY_BACKUP_FILE_NAME;

@Injectable({ providedIn: 'root' })
export class GoogleDriveVaultService {
  private readonly crypto = inject(VaultBackupCryptoService);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  readonly connected = signal(false);

  async authorize(): Promise<void> {
    this.ensureEnabled();
    const clientId = environment.googleOAuthClientId.trim();
    if (!clientId) {
      throw new GoogleDriveVaultError(
        'not_configured',
        'Google vault sign-in is not configured for this deployment.',
      );
    }
    if (this.accessToken && this.tokenExpiresAt > Date.now() + 30_000) return;
    await loadGoogleIdentityServices();
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      throw new GoogleDriveVaultError('oauth_unavailable', 'Google sign-in did not load.');
    }
    await new Promise<void>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        prompt: '',
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(
              new GoogleDriveVaultError(
                response.error === 'access_denied' ? 'cancelled' : 'oauth_failed',
                response.error === 'access_denied'
                  ? 'Google sign-in was cancelled.'
                  : 'Google did not authorize Drive backup access.',
              ),
            );
            return;
          }
          this.accessToken = response.access_token;
          this.tokenExpiresAt = Date.now() + Math.max(0, response.expires_in || 0) * 1000;
          this.connected.set(true);
          resolve();
        },
        error_callback: (error) => {
          reject(
            new GoogleDriveVaultError(
              error.type === 'popup_closed' ? 'cancelled' : 'oauth_failed',
              error.type === 'popup_closed'
                ? 'Google sign-in was cancelled.'
                : 'Google sign-in could not be completed.',
            ),
          );
        },
      });
      client.requestAccessToken({ prompt: 'select_account consent' });
    });
  }

  async loadBackup(): Promise<SolslotVaultBackupEnvelope | null> {
    const value = await this.loadAppDataDocument(
      BACKUP_FILE_NAME,
      GOOGLE_VAULT_MAX_BACKUP_BYTES,
    );
    if (value === null) return null;
    try {
      return this.crypto.parse(value);
    } catch {
      throw new GoogleDriveVaultError('invalid_backup', 'The Google Drive backup is invalid.');
    }
  }

  async createBackup(envelope: SolslotVaultBackupEnvelope): Promise<void> {
    await this.createAppDataDocument(
      BACKUP_FILE_NAME,
      envelope,
      GOOGLE_VAULT_MAX_BACKUP_BYTES,
    );
  }

  async replaceBackup(envelope: SolslotVaultBackupEnvelope): Promise<void> {
    await this.replaceAppDataDocument(
      BACKUP_FILE_NAME,
      envelope,
      GOOGLE_VAULT_MAX_BACKUP_BYTES,
    );
  }

  async loadAppDataDocument(
    fileName: SolslotAppDataFileName,
    maxBytes: number,
  ): Promise<unknown | null> {
    await this.authorize();
    const files = await this.findBackupFiles(fileName);
    if (files.length === 0) return null;
    if (files.length > 1) {
      throw new GoogleDriveVaultError(
        'duplicate_backup',
        'Multiple Solslot backups of this type were found in this Google account.',
      );
    }
    const file = files[0];
    if (file.size === undefined || Number(file.size) > maxBytes) {
      throw new GoogleDriveVaultError(
        'backup_too_large',
        'The Google Drive backup exceeds the 16 KiB limit.',
      );
    }
    const response = await this.request(
      `${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}?alt=media`,
    );
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await boundedResponseBytes(response, maxBytes),
        ),
      );
    } catch {
      throw new GoogleDriveVaultError('invalid_backup', 'The Google Drive backup is invalid.');
    }
  }

  async createAppDataDocument(
    fileName: SolslotAppDataFileName,
    value: unknown,
    maxBytes: number,
  ): Promise<void> {
    await this.authorize();
    if ((await this.findBackupFiles(fileName)).length !== 0) {
      throw new GoogleDriveVaultError(
        'backup_exists',
        'A Solslot backup of this type already exists in this Google account.',
      );
    }
    const uploaded = await this.upload(fileName, value, null, maxBytes);
    await this.verifyUploadedBackup(uploaded.id, value, maxBytes);
  }

  async replaceAppDataDocument(
    fileName: SolslotAppDataFileName,
    value: unknown,
    maxBytes: number,
  ): Promise<void> {
    await this.authorize();
    const files = await this.findBackupFiles(fileName);
    if (files.length !== 1) {
      throw new GoogleDriveVaultError(
        files.length === 0 ? 'backup_missing' : 'duplicate_backup',
        files.length === 0
          ? 'No Solslot backup of this type exists in this Google account.'
          : 'Multiple Solslot backups of this type were found in this Google account.',
      );
    }
    const uploaded = await this.upload(fileName, value, files[0].id, maxBytes);
    await this.verifyUploadedBackup(uploaded.id, value, maxBytes);
  }

  /** Clears page-memory authorization without changing the user's Google grant. */
  async disconnect(): Promise<void> {
    this.clearAuthorization();
  }

  /** Explicitly revoke the Google access grant after the user confirms that action. */
  async revokeGoogleAccess(): Promise<void> {
    if (!this.accessToken) await this.authorize();
    const token = this.accessToken;
    this.clearAuthorization();
    if (!token) {
      throw new GoogleDriveVaultError('revocation_failed', 'Google access could not be revoked from this page.');
    }
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      throw new GoogleDriveVaultError(
        'revocation_failed',
        'Google access could not be revoked from this page. Remove Solslot in your Google Account permissions.',
      );
    }
    try {
      await new Promise<void>((resolve) => oauth2.revoke(token, resolve));
    } catch {
      throw new GoogleDriveVaultError(
        'revocation_failed',
        'Google access could not be revoked from this page. Remove Solslot in your Google Account permissions.',
      );
    }
  }

  private clearAuthorization(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.connected.set(false);
  }

  private async findBackupFiles(fileName: SolslotAppDataFileName): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name = '${fileName}' and trashed = false`,
      fields: 'files(id,name,modifiedTime,size)',
      pageSize: '10',
    });
    const response = await this.request(`${DRIVE_FILES_URL}?${params.toString()}`);
    const value = (await response.json()) as { files?: unknown };
    if (!Array.isArray(value.files)) {
      throw new GoogleDriveVaultError('drive_failed', 'Google Drive returned an invalid response.');
    }
    return value.files.filter((file) => isDriveFile(file, fileName));
  }

  private async upload(
    fileName: SolslotAppDataFileName,
    value: unknown,
    fileId: string | null,
    maxBytes: number,
  ): Promise<DriveFile> {
    const documentBytes = serializedDocumentBytes(value);
    if (documentBytes.byteLength > maxBytes) {
      throw new GoogleDriveVaultError(
        'backup_too_large',
        'The Google Drive backup exceeds the 16 KiB limit.',
      );
    }
    const body = relatedMultipartBody(
      fileId
        ? { name: fileName, mimeType: 'application/json' }
        : { name: fileName, mimeType: 'application/json', parents: ['appDataFolder'] },
      new TextDecoder().decode(documentBytes),
    );
    if (body.bytes.byteLength > maxBytes + 1024) {
      throw new GoogleDriveVaultError('backup_too_large', 'The Google Drive backup exceeds the 16 KiB limit.');
    }
    const url = fileId
      ? `${DRIVE_UPLOAD_URL}/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,size`
      : `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,size`;
    const response = await this.request(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${body.boundary}` },
      body: exactBuffer(body.bytes),
    });
    const responseValue = await response.json();
    if (!isDriveFile(responseValue, fileName)) {
      throw new GoogleDriveVaultError('drive_failed', 'Google Drive did not return the uploaded backup metadata.');
    }
    return responseValue;
  }

  private async verifyUploadedBackup(
    fileId: string,
    expected: unknown,
    maxBytes: number,
  ): Promise<void> {
    const response = await this.request(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`);
    try {
      const value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await boundedResponseBytes(response, maxBytes),
        ),
      );
      if (!sameDocument(value, expected)) throw new Error('mismatch');
    } catch {
      throw new GoogleDriveVaultError(
        'verification_failed',
        'Google Drive did not return the vault backup that was uploaded.',
      );
    }
  }

  private ensureEnabled(): void {
    if (!environment.googleVaultEnabled || environment.chiaNetwork !== 'testnet11') {
      throw new GoogleDriveVaultError(
        'disabled',
        'Google Vault is available only in the enabled Testnet11 deployment.',
      );
    }
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new GoogleDriveVaultError('oauth_failed', 'Google Drive is not authorized.');
    }
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${this.accessToken}` },
      });
    } catch {
      throw new GoogleDriveVaultError('network_failed', 'Google Drive could not be reached.');
    }
    if (response.ok) return response;
    if (response.status === 401) {
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      this.connected.set(false);
      throw new GoogleDriveVaultError(
        'token_expired',
        'The Google session expired. Sign in again.',
      );
    }
    if (response.status === 403) {
      throw new GoogleDriveVaultError(
        'drive_forbidden',
        'Google Drive backup access is unavailable. Confirm that Drive API access is enabled.',
      );
    }
    if (response.status === 429) {
      throw new GoogleDriveVaultError('quota_exceeded', 'Google Drive is busy. Try again shortly.');
    }
    throw new GoogleDriveVaultError('drive_failed', 'Google Drive could not complete the request.');
  }
}

export class GoogleDriveVaultError extends Error {
  constructor(
    readonly code:
      | 'not_configured'
      | 'disabled'
      | 'oauth_unavailable'
      | 'cancelled'
      | 'oauth_failed'
      | 'token_expired'
      | 'drive_forbidden'
      | 'quota_exceeded'
      | 'network_failed'
      | 'drive_failed'
      | 'backup_missing'
      | 'backup_exists'
      | 'duplicate_backup'
      | 'invalid_backup'
      | 'backup_too_large'
      | 'revocation_failed'
      | 'verification_failed',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleDriveVaultError';
  }
}

interface DriveFile {
  id: string;
  name: string;
  size?: number | string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleOAuth2Api {
  initTokenClient(options: {
    client_id: string;
    scope: string;
    prompt?: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type: string }) => void;
  }): GoogleTokenClient;
  revoke(token: string, callback: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2Api } };
  }
}

let gisLoadPromise: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadPromise = null;
      reject(new GoogleDriveVaultError('oauth_unavailable', 'Google sign-in did not load.'));
    };
    if (!existing) document.head.appendChild(script);
  });
  return gisLoadPromise;
}

function isDriveFile(
  value: unknown,
  expectedName: SolslotAppDataFileName,
): value is DriveFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Record<string, unknown>;
  if (typeof file['id'] !== 'string' || file['name'] !== expectedName) return false;
  if (file['size'] === undefined) return true;
  const size = Number(file['size']);
  return Number.isSafeInteger(size) && size >= 0;
}

function relatedMultipartBody(metadata: Record<string, unknown>, documentJson: string): {
  boundary: string;
  bytes: Uint8Array;
} {
  const boundary = `${MULTIPART_BOUNDARY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`;
  const text =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${documentJson}\r\n` +
    `--${boundary}--\r\n`;
  return { boundary, bytes: new TextEncoder().encode(text) };
}

async function boundedResponseBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = response.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new Error('oversized response');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error('oversized response');
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('oversized response');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function sameDocument(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function serializedDocumentBytes(value: unknown): Uint8Array {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('not serializable');
    return new TextEncoder().encode(serialized);
  } catch {
    throw new GoogleDriveVaultError(
      'invalid_backup',
      'The Google Drive backup is invalid.',
    );
  }
}

function exactBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer as ArrayBuffer;
}
