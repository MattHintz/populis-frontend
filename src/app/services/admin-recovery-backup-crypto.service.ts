import { Injectable } from '@angular/core';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { getAddress } from 'ethers';

import {
  ADMIN_RECOVERY_BLS_PATH_LABEL,
  ADMIN_RECOVERY_EVM_PATH,
} from './admin-recovery-kit.service';

export const ADMIN_RECOVERY_BACKUP_MAX_BYTES = 16 * 1024;
export const ADMIN_RECOVERY_BACKUP_KDF_ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export interface AdminRecoveryBackupEnvelope {
  format: 'solslot-admin-recovery';
  version: 1;
  protocol: 'solslot-v2-rc23';
  network: 'testnet11';
  ceremonyId: string;
  slot: 0 | 1 | 2;
  revision: number;
  recoveryBlsPubkey: string;
  evmGuardian: string;
  createdAt: string;
  updatedAt: string;
  derivation: {
    chia: typeof ADMIN_RECOVERY_BLS_PATH_LABEL;
    evm: typeof ADMIN_RECOVERY_EVM_PATH;
  };
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: 600000;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
  };
  ciphertext: string;
}

interface AdminRecoveryBackupPayload {
  mnemonic: string;
  derivation: AdminRecoveryBackupEnvelope['derivation'];
}

export interface AdminRecoveryBackupExpectedIdentity {
  ceremonyId?: string;
  slot?: 0 | 1 | 2;
  minimumRevision?: number;
  recoveryBlsPubkey?: string;
  evmGuardian?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminRecoveryBackupCryptoService {
  async encrypt(args: {
    mnemonic: string;
    password: string;
    ceremonyId: string;
    slot: 0 | 1 | 2;
    revision: number;
    recoveryBlsPubkey: string;
    evmGuardian: string;
    createdAt?: string;
  }): Promise<AdminRecoveryBackupEnvelope> {
    const mnemonic = normalizeMnemonic(args.mnemonic);
    if (!validateMnemonic(mnemonic, wordlist)) throw invalidBackup('The recovery phrase is invalid.');
    validateBackupPassword(args.password);
    const ceremonyId = normalizeHex(args.ceremonyId, 32, 'ceremony ID');
    const recoveryBlsPubkey = normalizeHex(
      args.recoveryBlsPubkey,
      48,
      'recovery BLS public key',
    );
    const evmGuardian = getAddress(args.evmGuardian);
    if (!Number.isInteger(args.slot) || args.slot < 0 || args.slot > 2) {
      throw invalidBackup();
    }
    if (!Number.isSafeInteger(args.revision) || args.revision < 1) {
      throw invalidBackup();
    }
    const createdAt = args.createdAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();
    validateTimestamp(createdAt);
    validateTimestamp(updatedAt);
    if (Date.parse(createdAt) > Date.parse(updatedAt)) throw invalidBackup();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const metadata = {
      format: 'solslot-admin-recovery' as const,
      version: 1 as const,
      protocol: 'solslot-v2-rc23' as const,
      network: 'testnet11' as const,
      ceremonyId,
      slot: args.slot,
      revision: args.revision,
      recoveryBlsPubkey,
      evmGuardian,
      createdAt,
      updatedAt,
      derivation: recoveryDerivation(),
      kdf: {
        name: 'PBKDF2' as const,
        hash: 'SHA-256' as const,
        iterations: ADMIN_RECOVERY_BACKUP_KDF_ITERATIONS as 600000,
        salt: toBase64(salt),
      },
      cipher: {
        name: 'AES-GCM' as const,
        iv: toBase64(iv),
      },
    };
    const plaintext = encoder.encode(
      JSON.stringify({
        mnemonic,
        derivation: recoveryDerivation(),
      } satisfies AdminRecoveryBackupPayload),
    );
    try {
      const key = await deriveKey(args.password, salt);
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: exactBuffer(iv),
          additionalData: aad(metadata),
          tagLength: 128,
        },
        key,
        exactBuffer(plaintext),
      );
      const envelope = {
        ...metadata,
        ciphertext: toBase64(new Uint8Array(ciphertext)),
      };
      if (serializedBytes(envelope).byteLength > ADMIN_RECOVERY_BACKUP_MAX_BYTES) {
        throw invalidBackup();
      }
      return envelope;
    } finally {
      plaintext.fill(0);
      salt.fill(0);
      iv.fill(0);
    }
  }

  async decrypt(
    value: unknown,
    password: string,
    expected?: AdminRecoveryBackupExpectedIdentity,
  ): Promise<{ mnemonic: string; envelope: AdminRecoveryBackupEnvelope }> {
    const envelope = this.parse(value, expected);
    const salt = fromBase64(envelope.kdf.salt, 16);
    const iv = fromBase64(envelope.cipher.iv, 12);
    const ciphertext = fromBase64(envelope.ciphertext);
    try {
      const key = await deriveKey(password, salt);
      let decrypted: ArrayBuffer;
      try {
        decrypted = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: exactBuffer(iv),
            additionalData: aad(metadataFromEnvelope(envelope)),
            tagLength: 128,
          },
          key,
          exactBuffer(ciphertext),
        );
      } catch {
        throw new AdminRecoveryBackupError(
          'decrypt_failed',
          'The backup password is incorrect or the backup was changed.',
        );
      }
      const plaintext = new Uint8Array(decrypted);
      try {
        const payload = JSON.parse(decoder.decode(plaintext)) as unknown;
        if (
          !isRecord(payload) ||
          !hasExactKeys(payload, ['derivation', 'mnemonic']) ||
          typeof payload['mnemonic'] !== 'string' ||
          !sameDerivation(payload['derivation'])
        ) {
          throw new Error('invalid payload');
        }
        const mnemonic = normalizeMnemonic(payload['mnemonic']);
        if (!validateMnemonic(mnemonic, wordlist)) throw new Error('invalid mnemonic');
        return { mnemonic, envelope };
      } catch (error) {
        if (error instanceof AdminRecoveryBackupError) throw error;
        throw invalidBackup();
      } finally {
        plaintext.fill(0);
      }
    } finally {
      salt.fill(0);
      iv.fill(0);
      ciphertext.fill(0);
    }
  }

  parse(
    value: unknown,
    expected?: AdminRecoveryBackupExpectedIdentity,
  ): AdminRecoveryBackupEnvelope {
    const envelope = parseEnvelope(value);
    if (
      (expected?.ceremonyId &&
        envelope.ceremonyId !== normalizeHex(expected.ceremonyId, 32, 'ceremony ID')) ||
      (expected?.slot !== undefined && envelope.slot !== expected.slot) ||
      (expected?.minimumRevision !== undefined &&
        envelope.revision < expected.minimumRevision) ||
      (expected?.recoveryBlsPubkey &&
        envelope.recoveryBlsPubkey !==
          normalizeHex(expected.recoveryBlsPubkey, 48, 'recovery BLS public key')) ||
      (expected?.evmGuardian &&
        envelope.evmGuardian !== getAddress(expected.evmGuardian))
    ) {
      throw new AdminRecoveryBackupError(
        'identity_mismatch',
        'This backup belongs to another administrator identity or an older recovery revision.',
      );
    }
    return envelope;
  }

  async ciphertextHash(envelope: AdminRecoveryBackupEnvelope): Promise<string> {
    const ciphertext = fromBase64(envelope.ciphertext);
    try {
      const digest = await crypto.subtle.digest('SHA-256', exactBuffer(ciphertext));
      return bytesToHex(new Uint8Array(digest));
    } finally {
      ciphertext.fill(0);
    }
  }
}

export class AdminRecoveryBackupError extends Error {
  constructor(
    readonly code: 'invalid_backup' | 'weak_password' | 'decrypt_failed' | 'identity_mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'AdminRecoveryBackupError';
  }
}

function parseEnvelope(value: unknown): AdminRecoveryBackupEnvelope {
  if (
    !isRecord(value) ||
    serializedBytes(value).byteLength > ADMIN_RECOVERY_BACKUP_MAX_BYTES ||
    !hasExactKeys(value, [
      'cipher',
      'ciphertext',
      'createdAt',
      'derivation',
      'evmGuardian',
      'format',
      'kdf',
      'network',
      'protocol',
      'recoveryBlsPubkey',
      'revision',
      'slot',
      'ceremonyId',
      'updatedAt',
      'version',
    ])
  ) {
    throw invalidBackup();
  }
  const kdf = value['kdf'];
  const cipher = value['cipher'];
  if (
    value['format'] !== 'solslot-admin-recovery' ||
    value['version'] !== 1 ||
    value['protocol'] !== 'solslot-v2-rc23' ||
    value['network'] !== 'testnet11' ||
    typeof value['ceremonyId'] !== 'string' ||
    typeof value['recoveryBlsPubkey'] !== 'string' ||
    typeof value['evmGuardian'] !== 'string' ||
    typeof value['createdAt'] !== 'string' ||
    typeof value['updatedAt'] !== 'string' ||
    typeof value['ciphertext'] !== 'string' ||
    typeof value['slot'] !== 'number' ||
    !Number.isInteger(value['slot']) ||
    Number(value['slot']) < 0 ||
    Number(value['slot']) > 2 ||
    typeof value['revision'] !== 'number' ||
    !Number.isSafeInteger(value['revision']) ||
    Number(value['revision']) < 1 ||
    !sameDerivation(value['derivation']) ||
    !isRecord(kdf) ||
    !hasExactKeys(kdf, ['hash', 'iterations', 'name', 'salt']) ||
    kdf['name'] !== 'PBKDF2' ||
    kdf['hash'] !== 'SHA-256' ||
    kdf['iterations'] !== ADMIN_RECOVERY_BACKUP_KDF_ITERATIONS ||
    typeof kdf['salt'] !== 'string' ||
    !isRecord(cipher) ||
    !hasExactKeys(cipher, ['iv', 'name']) ||
    cipher['name'] !== 'AES-GCM' ||
    typeof cipher['iv'] !== 'string'
  ) {
    throw invalidBackup();
  }
  normalizeHex(value['ceremonyId'], 32, 'ceremony ID');
  normalizeHex(value['recoveryBlsPubkey'], 48, 'recovery BLS public key');
  if (getAddress(value['evmGuardian']) !== value['evmGuardian']) throw invalidBackup();
  validateTimestamp(value['createdAt']);
  validateTimestamp(value['updatedAt']);
  if (Date.parse(value['createdAt']) > Date.parse(value['updatedAt'])) throw invalidBackup();
  fromBase64(kdf['salt'], 16).fill(0);
  fromBase64(cipher['iv'], 12).fill(0);
  fromBase64(value['ciphertext']).fill(0);
  return value as unknown as AdminRecoveryBackupEnvelope;
}

function metadataFromEnvelope(
  envelope: AdminRecoveryBackupEnvelope,
): Omit<AdminRecoveryBackupEnvelope, 'ciphertext'> {
  const { ciphertext: _ciphertext, ...metadata } = envelope;
  return metadata;
}

function recoveryDerivation(): AdminRecoveryBackupEnvelope['derivation'] {
  return {
    chia: ADMIN_RECOVERY_BLS_PATH_LABEL,
    evm: ADMIN_RECOVERY_EVM_PATH,
  };
}

function sameDerivation(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['chia', 'evm']) &&
    value['chia'] === ADMIN_RECOVERY_BLS_PATH_LABEL &&
    value['evm'] === ADMIN_RECOVERY_EVM_PATH
  );
}

function validateBackupPassword(value: string): void {
  const words = value.trim().toLowerCase().split(/\s+/);
  if (words.length !== 6 || words.some((word) => !wordlist.includes(word))) {
    throw new AdminRecoveryBackupError(
      'weak_password',
      'Use the separate six-word backup password generated by Solslot.',
    );
  }
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  validateBackupPassword(password);
  const passwordBytes = encoder.encode(password.normalize('NFKC'));
  try {
    const material = await crypto.subtle.importKey(
      'raw',
      exactBuffer(passwordBytes),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: exactBuffer(salt),
        iterations: ADMIN_RECOVERY_BACKUP_KDF_ITERATIONS,
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    passwordBytes.fill(0);
  }
}

function aad(
  metadata: Omit<AdminRecoveryBackupEnvelope, 'ciphertext'>,
): ArrayBuffer {
  return exactBuffer(encoder.encode(JSON.stringify(metadata)));
}

function normalizeMnemonic(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeHex(value: string, bytes: number, label: string): string {
  const normalized = `0x${String(value).toLowerCase().replace(/^0x/, '')}`;
  if (!new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(normalized)) {
    throw invalidBackup(`${label} is invalid.`);
  }
  return normalized;
}

function validateTimestamp(value: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw invalidBackup();
  }
}

function toBase64(value: Uint8Array): string {
  let result = '';
  for (const byte of value) result += String.fromCharCode(byte);
  return btoa(result);
}

function fromBase64(value: string, expectedLength?: number): Uint8Array {
  try {
    if (value.length > Math.ceil((ADMIN_RECOVERY_BACKUP_MAX_BYTES * 4) / 3) + 4) {
      throw new Error('oversized');
    }
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > ADMIN_RECOVERY_BACKUP_MAX_BYTES ||
      (expectedLength !== undefined && bytes.byteLength !== expectedLength)
    ) {
      throw new Error('invalid length');
    }
    return bytes;
  } catch {
    throw invalidBackup();
  }
}

function serializedBytes(value: unknown): Uint8Array {
  try {
    return encoder.encode(JSON.stringify(value));
  } catch {
    throw invalidBackup();
  }
}

function bytesToHex(value: Uint8Array): string {
  return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlyArray<string>,
): boolean {
  return JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expected].sort());
}

function exactBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer as ArrayBuffer;
}

function invalidBackup(message = 'The administrator recovery backup is invalid.'): AdminRecoveryBackupError {
  return new AdminRecoveryBackupError('invalid_backup', message);
}
