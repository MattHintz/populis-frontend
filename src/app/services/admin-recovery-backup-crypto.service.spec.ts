import { TestBed } from '@angular/core/testing';

import {
  ADMIN_RECOVERY_BACKUP_MAX_BYTES,
  AdminRecoveryBackupCryptoService,
  AdminRecoveryBackupEnvelope,
} from './admin-recovery-backup-crypto.service';

describe('AdminRecoveryBackupCryptoService', () => {
  let service: AdminRecoveryBackupCryptoService;
  const mnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const password = 'abandon ability able about above absent';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AdminRecoveryBackupCryptoService);
  });

  it('round-trips the strict RC23 encrypted envelope', async () => {
    const envelope = await service.encrypt(args());
    const restored = await service.decrypt(envelope, password, {
      ceremonyId: args().ceremonyId,
      slot: 0,
      minimumRevision: 1,
      recoveryBlsPubkey: args().recoveryBlsPubkey,
      evmGuardian: args().evmGuardian,
    });

    expect(restored.mnemonic).toBe(mnemonic);
    expect(envelope.kdf.iterations).toBe(600_000);
    expect(envelope.derivation.chia).toBe('m/12381/8444/2/0-unhardened');
    expect(new TextEncoder().encode(JSON.stringify(envelope)).byteLength).toBeLessThan(
      ADMIN_RECOVERY_BACKUP_MAX_BYTES,
    );
  });

  it('rejects weaker KDF settings and stale revisions before decryption', async () => {
    const envelope = await service.encrypt(args());
    const weak = structuredClone(envelope) as AdminRecoveryBackupEnvelope;
    (weak.kdf as { iterations: number }).iterations = 100_000;

    expect(() => service.parse(weak)).toThrowError(/invalid/i);
    expect(() => service.parse(envelope, { minimumRevision: 2 })).toThrowError(
      /older recovery revision/i,
    );
  });

  it('rejects changed metadata and wrong passwords', async () => {
    const envelope = await service.encrypt(args());
    const changed = structuredClone(envelope);
    changed.slot = 1;

    await expectAsync(service.decrypt(changed, password)).toBeRejectedWithError(
      /incorrect or the backup was changed/i,
    );
    await expectAsync(service.decrypt(envelope, 'absorb abstract absurd abuse access accident')).toBeRejectedWithError(
      /incorrect or the backup was changed/i,
    );
  });

  function args() {
    return {
      mnemonic,
      password,
      ceremonyId: `0x${'11'.repeat(32)}`,
      slot: 0 as const,
      revision: 1,
      recoveryBlsPubkey: `0x${'22'.repeat(48)}`,
      evmGuardian: '0x1111111111111111111111111111111111111111',
    };
  }
});
