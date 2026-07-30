import { Injectable, inject } from '@angular/core';

import {
  ADMIN_RECOVERY_BACKUP_MAX_BYTES,
  AdminRecoveryBackupCryptoService,
  AdminRecoveryBackupEnvelope,
  AdminRecoveryBackupError,
  AdminRecoveryBackupExpectedIdentity,
} from './admin-recovery-backup-crypto.service';
import {
  ADMIN_RECOVERY_BACKUP_FILE_NAME,
  GoogleDriveVaultService,
} from './google-drive-vault.service';

@Injectable({ providedIn: 'root' })
export class AdminRecoveryDriveService {
  private readonly drive = inject(GoogleDriveVaultService);
  private readonly crypto = inject(AdminRecoveryBackupCryptoService);

  async load(
    expected?: AdminRecoveryBackupExpectedIdentity,
  ): Promise<AdminRecoveryBackupEnvelope | null> {
    const value = await this.drive.loadAppDataDocument(
      ADMIN_RECOVERY_BACKUP_FILE_NAME,
      ADMIN_RECOVERY_BACKUP_MAX_BYTES,
    );
    return value === null ? null : this.crypto.parse(value, expected);
  }

  async restore(
    password: string,
    expected?: AdminRecoveryBackupExpectedIdentity,
  ): Promise<{ mnemonic: string; envelope: AdminRecoveryBackupEnvelope }> {
    const value = await this.drive.loadAppDataDocument(
      ADMIN_RECOVERY_BACKUP_FILE_NAME,
      ADMIN_RECOVERY_BACKUP_MAX_BYTES,
    );
    if (value === null) {
      throw new AdminRecoveryBackupError(
        'invalid_backup',
        'No administrator recovery backup was found in this Google account.',
      );
    }
    return this.crypto.decrypt(value, password, expected);
  }

  async create(envelope: AdminRecoveryBackupEnvelope): Promise<void> {
    const parsed = this.crypto.parse(envelope);
    await this.drive.createAppDataDocument(
      ADMIN_RECOVERY_BACKUP_FILE_NAME,
      parsed,
      ADMIN_RECOVERY_BACKUP_MAX_BYTES,
    );
  }

  async replace(
    envelope: AdminRecoveryBackupEnvelope,
    expected?: AdminRecoveryBackupExpectedIdentity,
  ): Promise<void> {
    const replacement = this.crypto.parse(envelope, expected);
    const current = await this.load({
      ceremonyId: replacement.ceremonyId,
      slot: replacement.slot,
      recoveryBlsPubkey: expected?.recoveryBlsPubkey,
      evmGuardian: expected?.evmGuardian,
    });
    if (!current) {
      throw new AdminRecoveryBackupError(
        'invalid_backup',
        'No administrator recovery backup was found in this Google account.',
      );
    }
    if (replacement.revision < current.revision) {
      throw new AdminRecoveryBackupError(
        'identity_mismatch',
        'An older administrator recovery backup cannot replace a newer revision.',
      );
    }
    await this.drive.replaceAppDataDocument(
      ADMIN_RECOVERY_BACKUP_FILE_NAME,
      replacement,
      ADMIN_RECOVERY_BACKUP_MAX_BYTES,
    );
  }

  ciphertextHash(envelope: AdminRecoveryBackupEnvelope): Promise<string> {
    return this.crypto.ciphertextHash(envelope);
  }

  disconnect(): Promise<void> {
    return this.drive.disconnect();
  }

  revokeGoogleAccess(): Promise<void> {
    return this.drive.revokeGoogleAccess();
  }
}
