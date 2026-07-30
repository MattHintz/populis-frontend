import {
  AbiCoder,
  computeAddress,
  concat,
  getAddress,
  getBytes,
  keccak256,
  sha256,
  toUtf8Bytes,
} from 'ethers';

import {
  AdminKeyChangeIntentV1,
  AdminRecoveryCase,
  ChiaSigningAction,
  EvmRecoveryAction,
  PreparedKeyChange,
  RecoveryDrillChallenge,
} from './admin-security.service';
import { Eip712TypedData } from './solslot-api.service';

const PURPOSE = 'Solslot administrator second-device recovery test' as const;
const LOST_KEY_PURPOSE = 'Solslot administrator lost-wallet recovery' as const;
const GUARDIAN_ACTION_PURPOSE =
  'Solslot administrator recovery-kit guardian action' as const;
const CHIA_RECOVERY_ACTION_PURPOSE =
  'Solslot administrator Testnet11 recovery action' as const;
const MAX_HANDOFF_BYTES = 32 * 1024;
const INTENT_TYPE_HASH = keccak256(toUtf8Bytes('SolslotAdminKeyChangeIntentV1'));
const INTENT_ABI_TYPES = [
  'bytes32',
  'uint8',
  'uint8',
  'address',
  'address',
  'bytes32',
  'bytes32',
  'address',
  'address',
  'bytes32',
  'bytes32',
  'bytes32[3]',
  'address[3]',
  'bytes32',
  'address',
  'address',
  'bytes32',
  'uint256',
  'bytes32',
  'uint256',
  'uint64',
  'uint64',
] as const;

export interface AdminRecoveryDrillPackage {
  schemaVersion: 1;
  purpose: typeof PURPOSE;
  challenge: RecoveryDrillChallenge;
  checksum: string;
}

export interface AdminRecoveryDrillResult {
  challengeId: string;
  evmSignature: string;
  blsSignature: string;
}

export interface AdminLostRecoveryPackage {
  schemaVersion: 1;
  purpose: typeof LOST_KEY_PURPOSE;
  intent: AdminKeyChangeIntentV1;
  intentHash: string;
  coordinator: string;
  guardianTypedData: Eip712TypedData;
  recoveryBlsDigest: string;
  checksum: string;
}

export interface AdminLostRecoveryResult {
  intentHash: string;
  guardianSignature: string;
  recoveryBlsSignature: string;
}

export interface AdminRecoveryGuardianActionPackage {
  schemaVersion: 1;
  purpose: typeof GUARDIAN_ACTION_PURPOSE;
  caseId: string;
  action: 'ACCEPT' | 'VETO';
  intent: AdminKeyChangeIntentV1;
  intentHash: string;
  coordinator: string;
  expectedGuardian: string;
  guardianTypedData: Eip712TypedData;
  checksum: string;
}

export interface AdminRecoveryGuardianActionResult {
  caseId: string;
  action: 'ACCEPT' | 'VETO';
  intentHash: string;
  guardianSignature: string;
}

export interface AdminChiaRecoveryActionPackage {
  schemaVersion: 1;
  purpose: typeof CHIA_RECOVERY_ACTION_PURPOSE;
  caseId: string;
  intent: AdminKeyChangeIntentV1;
  intentHash: string;
  action: ChiaSigningAction;
  checksum: string;
}

export interface AdminChiaRecoveryActionResult {
  caseId: string;
  intentHash: string;
  actionId: string;
  messageHash: string;
  signature: string;
}

export function createAdminRecoveryDrillPackage(
  challenge: RecoveryDrillChallenge,
): AdminRecoveryDrillPackage {
  const body = {
    schemaVersion: 1 as const,
    purpose: PURPOSE,
    challenge,
  };
  return {
    ...body,
    checksum: checksum(body),
  };
}

export function parseAdminRecoveryDrillPackage(value: string): AdminRecoveryDrillPackage {
  if (new TextEncoder().encode(value).byteLength > MAX_HANDOFF_BYTES) {
    throw new Error('The recovery test package is too large.');
  }
  const parsed = parseJsonObject(value, 'The recovery test package is not valid JSON.');
  if (
    !hasExactKeys(parsed, ['challenge', 'checksum', 'purpose', 'schemaVersion']) ||
    parsed['schemaVersion'] !== 1 ||
    parsed['purpose'] !== PURPOSE ||
    typeof parsed['checksum'] !== 'string' ||
    !/^0x[0-9a-f]{64}$/i.test(parsed['checksum']) ||
    !isRecord(parsed['challenge'])
  ) {
    throw new Error('The recovery test package has an unexpected shape.');
  }
  const body = {
    schemaVersion: 1 as const,
    purpose: PURPOSE,
    challenge: parsed['challenge'] as unknown as RecoveryDrillChallenge,
  };
  if (checksum(body).toLowerCase() !== parsed['checksum'].toLowerCase()) {
    throw new Error('The recovery test checksum does not match. Do not sign it.');
  }
  validateChallengeEnvelope(body.challenge);
  return {
    ...body,
    checksum: parsed['checksum'].toLowerCase(),
  };
}

export function createAdminRecoveryDrillResult(
  challengeId: string,
  signatures: { evmSignature: string; blsSignature: string },
): AdminRecoveryDrillResult {
  return parseAdminRecoveryDrillResult(
    JSON.stringify({
      challengeId,
      evmSignature: signatures.evmSignature,
      blsSignature: signatures.blsSignature,
    }),
    challengeId,
  );
}

export function parseAdminRecoveryDrillResult(
  value: string,
  expectedChallengeId: string,
): AdminRecoveryDrillResult {
  const parsed = parseJsonObject(value, 'The signed second-device result is not valid JSON.');
  if (
    !hasExactKeys(parsed, ['blsSignature', 'challengeId', 'evmSignature']) ||
    parsed['challengeId'] !== expectedChallengeId ||
    typeof parsed['evmSignature'] !== 'string' ||
    !/^0x[0-9a-f]{130}$/i.test(parsed['evmSignature']) ||
    typeof parsed['blsSignature'] !== 'string' ||
    !/^0x[0-9a-f]{192}$/i.test(parsed['blsSignature'])
  ) {
    throw new Error('The signed result does not match this one-time recovery test.');
  }
  return parsed as unknown as AdminRecoveryDrillResult;
}

export function createAdminLostRecoveryPackage(
  prepared: PreparedKeyChange,
): AdminLostRecoveryPackage {
  if (!prepared.guardianTypedData || !prepared.recoveryBlsDigest) {
    throw new Error('The lost-wallet recovery package is incomplete.');
  }
  const body = {
    schemaVersion: 1 as const,
    purpose: LOST_KEY_PURPOSE,
    intent: prepared.intent,
    intentHash: prepared.intentHash,
    coordinator: prepared.coordinator,
    guardianTypedData: prepared.guardianTypedData,
    recoveryBlsDigest: prepared.recoveryBlsDigest,
  };
  validateLostRecoveryBody(body);
  return { ...body, checksum: checksum(body) };
}

export function parseAdminLostRecoveryPackage(value: string): AdminLostRecoveryPackage {
  if (new TextEncoder().encode(value).byteLength > MAX_HANDOFF_BYTES) {
    throw new Error('The lost-wallet recovery package is too large.');
  }
  const parsed = parseJsonObject(
    value,
    'The lost-wallet recovery package is not valid JSON.',
  );
  if (
    !hasExactKeys(parsed, [
      'checksum',
      'coordinator',
      'guardianTypedData',
      'intent',
      'intentHash',
      'purpose',
      'recoveryBlsDigest',
      'schemaVersion',
    ]) ||
    parsed['schemaVersion'] !== 1 ||
    parsed['purpose'] !== LOST_KEY_PURPOSE ||
    !isRecord(parsed['intent']) ||
    !isRecord(parsed['guardianTypedData']) ||
    typeof parsed['intentHash'] !== 'string' ||
    typeof parsed['coordinator'] !== 'string' ||
    typeof parsed['recoveryBlsDigest'] !== 'string' ||
    typeof parsed['checksum'] !== 'string' ||
    !isHex(parsed['checksum'], 32)
  ) {
    throw new Error('The lost-wallet recovery package has an unexpected shape.');
  }
  const body = {
    schemaVersion: 1 as const,
    purpose: LOST_KEY_PURPOSE,
    intent: parsed['intent'] as unknown as AdminKeyChangeIntentV1,
    intentHash: parsed['intentHash'],
    coordinator: parsed['coordinator'],
    guardianTypedData: parsed['guardianTypedData'] as unknown as Eip712TypedData,
    recoveryBlsDigest: parsed['recoveryBlsDigest'],
  };
  if (checksum(body).toLowerCase() !== parsed['checksum'].toLowerCase()) {
    throw new Error('The lost-wallet recovery checksum does not match. Do not sign it.');
  }
  validateLostRecoveryBody(body);
  return { ...body, checksum: parsed['checksum'].toLowerCase() };
}

export function createAdminLostRecoveryResult(
  intentHash: string,
  signatures: {
    guardianSignature: string;
    recoveryBlsSignature: string;
  },
): AdminLostRecoveryResult {
  return parseAdminLostRecoveryResult(
    JSON.stringify({ intentHash, ...signatures }),
    intentHash,
  );
}

export function parseAdminLostRecoveryResult(
  value: string,
  expectedIntentHash: string,
): AdminLostRecoveryResult {
  const parsed = parseJsonObject(
    value,
    'The signed lost-wallet recovery result is not valid JSON.',
  );
  if (
    !hasExactKeys(parsed, [
      'guardianSignature',
      'intentHash',
      'recoveryBlsSignature',
    ]) ||
    String(parsed['intentHash']).toLowerCase() !== expectedIntentHash.toLowerCase() ||
    typeof parsed['guardianSignature'] !== 'string' ||
    !isHex(parsed['guardianSignature'], 65) ||
    typeof parsed['recoveryBlsSignature'] !== 'string' ||
    !isHex(parsed['recoveryBlsSignature'], 96)
  ) {
    throw new Error('The signed result does not match this lost-wallet recovery.');
  }
  return parsed as unknown as AdminLostRecoveryResult;
}

export function createAdminRecoveryGuardianActionPackage(
  recovery: AdminRecoveryCase,
  action: EvmRecoveryAction,
): AdminRecoveryGuardianActionPackage {
  if (
    action.execution !== 'OFFLINE_RELAY' ||
    !action.authorizationAction ||
    !action.typedData
  ) {
    throw new Error('This case action is not an offline recovery-kit action.');
  }
  const body: Omit<AdminRecoveryGuardianActionPackage, 'checksum'> = {
    schemaVersion: 1 as const,
    purpose: GUARDIAN_ACTION_PURPOSE,
    caseId: recovery.caseId,
    action: action.authorizationAction,
    intent: recovery.intent,
    intentHash: recovery.intentHash,
    coordinator: action.to,
    expectedGuardian: action.signer,
    guardianTypedData: action.typedData,
  };
  validateRecoveryGuardianActionBody(body);
  return { ...body, checksum: checksum(body) };
}

export function parseAdminRecoveryGuardianActionPackage(
  value: string,
): AdminRecoveryGuardianActionPackage {
  if (new TextEncoder().encode(value).byteLength > MAX_HANDOFF_BYTES) {
    throw new Error('The recovery-kit action package is too large.');
  }
  const parsed = parseJsonObject(
    value,
    'The recovery-kit action package is not valid JSON.',
  );
  if (
    !hasExactKeys(parsed, [
      'action',
      'caseId',
      'checksum',
      'coordinator',
      'expectedGuardian',
      'guardianTypedData',
      'intent',
      'intentHash',
      'purpose',
      'schemaVersion',
    ]) ||
    parsed['schemaVersion'] !== 1 ||
    parsed['purpose'] !== GUARDIAN_ACTION_PURPOSE ||
    (parsed['action'] !== 'ACCEPT' && parsed['action'] !== 'VETO') ||
    typeof parsed['caseId'] !== 'string' ||
    !/^recovery-[0-9a-f]{64}$/i.test(parsed['caseId']) ||
    !isRecord(parsed['intent']) ||
    !isRecord(parsed['guardianTypedData']) ||
    typeof parsed['intentHash'] !== 'string' ||
    typeof parsed['coordinator'] !== 'string' ||
    typeof parsed['expectedGuardian'] !== 'string' ||
    typeof parsed['checksum'] !== 'string' ||
    !isHex(parsed['checksum'], 32)
  ) {
    throw new Error('The recovery-kit action package has an unexpected shape.');
  }
  const body = {
    schemaVersion: 1 as const,
    purpose: GUARDIAN_ACTION_PURPOSE,
    caseId: parsed['caseId'],
    action: parsed['action'] as 'ACCEPT' | 'VETO',
    intent: parsed['intent'] as unknown as AdminKeyChangeIntentV1,
    intentHash: parsed['intentHash'],
    coordinator: parsed['coordinator'],
    expectedGuardian: parsed['expectedGuardian'],
    guardianTypedData:
      parsed['guardianTypedData'] as unknown as Eip712TypedData,
  };
  if (checksum(body).toLowerCase() !== parsed['checksum'].toLowerCase()) {
    throw new Error(
      'The recovery-kit action checksum does not match. Do not sign it.',
    );
  }
  validateRecoveryGuardianActionBody(body);
  return { ...body, checksum: parsed['checksum'].toLowerCase() };
}

export function createAdminRecoveryGuardianActionResult(
  recoveryPackage: AdminRecoveryGuardianActionPackage,
  guardianSignature: string,
): AdminRecoveryGuardianActionResult {
  return parseAdminRecoveryGuardianActionResult(
    JSON.stringify({
      caseId: recoveryPackage.caseId,
      action: recoveryPackage.action,
      intentHash: recoveryPackage.intentHash,
      guardianSignature,
    }),
    recoveryPackage,
  );
}

export function parseAdminRecoveryGuardianActionResult(
  value: string,
  expected: Pick<
    AdminRecoveryGuardianActionPackage,
    'caseId' | 'action' | 'intentHash'
  >,
): AdminRecoveryGuardianActionResult {
  const parsed = parseJsonObject(
    value,
    'The signed recovery-kit action result is not valid JSON.',
  );
  if (
    !hasExactKeys(parsed, [
      'action',
      'caseId',
      'guardianSignature',
      'intentHash',
    ]) ||
    parsed['caseId'] !== expected.caseId ||
    parsed['action'] !== expected.action ||
    String(parsed['intentHash']).toLowerCase() !==
      expected.intentHash.toLowerCase() ||
    typeof parsed['guardianSignature'] !== 'string' ||
    !isHex(parsed['guardianSignature'], 65)
  ) {
    throw new Error(
      'The signed result does not match this recovery-kit action.',
    );
  }
  return parsed as unknown as AdminRecoveryGuardianActionResult;
}

export function createAdminChiaRecoveryActionPackage(
  recovery: AdminRecoveryCase,
  action: ChiaSigningAction,
): AdminChiaRecoveryActionPackage {
  const body: Omit<AdminChiaRecoveryActionPackage, 'checksum'> = {
    schemaVersion: 1,
    purpose: CHIA_RECOVERY_ACTION_PURPOSE,
    caseId: recovery.caseId,
    intent: recovery.intent,
    intentHash: recovery.intentHash,
    action,
  };
  validateChiaRecoveryActionBody(body);
  return { ...body, checksum: checksum(body) };
}

export function parseAdminChiaRecoveryActionPackage(
  value: string,
): AdminChiaRecoveryActionPackage {
  if (new TextEncoder().encode(value).byteLength > MAX_HANDOFF_BYTES) {
    throw new Error('The Testnet11 recovery action package is too large.');
  }
  const parsed = parseJsonObject(
    value,
    'The Testnet11 recovery action package is not valid JSON.',
  );
  if (
    !hasExactKeys(parsed, [
      'action',
      'caseId',
      'checksum',
      'intent',
      'intentHash',
      'purpose',
      'schemaVersion',
    ]) ||
    parsed['schemaVersion'] !== 1 ||
    parsed['purpose'] !== CHIA_RECOVERY_ACTION_PURPOSE ||
    typeof parsed['caseId'] !== 'string' ||
    !isRecord(parsed['intent']) ||
    typeof parsed['intentHash'] !== 'string' ||
    !isRecord(parsed['action']) ||
    typeof parsed['checksum'] !== 'string' ||
    !isHex(parsed['checksum'], 32)
  ) {
    throw new Error('The Testnet11 recovery action package has an unexpected shape.');
  }
  const body: Omit<AdminChiaRecoveryActionPackage, 'checksum'> = {
    schemaVersion: 1,
    purpose: CHIA_RECOVERY_ACTION_PURPOSE,
    caseId: parsed['caseId'],
    intent: parsed['intent'] as unknown as AdminKeyChangeIntentV1,
    intentHash: parsed['intentHash'],
    action: parsed['action'] as unknown as ChiaSigningAction,
  };
  if (checksum(body).toLowerCase() !== parsed['checksum'].toLowerCase()) {
    throw new Error(
      'The Testnet11 recovery action checksum does not match. Do not sign it.',
    );
  }
  validateChiaRecoveryActionBody(body);
  return { ...body, checksum: parsed['checksum'].toLowerCase() };
}

export function createAdminChiaRecoveryActionResult(
  recoveryPackage: AdminChiaRecoveryActionPackage,
  signature: string,
): AdminChiaRecoveryActionResult {
  return parseAdminChiaRecoveryActionResult(
    JSON.stringify({
      caseId: recoveryPackage.caseId,
      intentHash: recoveryPackage.intentHash,
      actionId: recoveryPackage.action.actionId,
      messageHash: recoveryPackage.action.messageHash,
      signature,
    }),
    recoveryPackage,
  );
}

export function parseAdminChiaRecoveryActionResult(
  value: string,
  expected: Pick<
    AdminChiaRecoveryActionPackage,
    'caseId' | 'intentHash' | 'action'
  >,
): AdminChiaRecoveryActionResult {
  const parsed = parseJsonObject(
    value,
    'The signed Testnet11 recovery result is not valid JSON.',
  );
  if (
    !hasExactKeys(parsed, [
      'actionId',
      'caseId',
      'intentHash',
      'messageHash',
      'signature',
    ]) ||
    parsed['caseId'] !== expected.caseId ||
    String(parsed['intentHash']).toLowerCase() !==
      expected.intentHash.toLowerCase() ||
    String(parsed['actionId']).toLowerCase() !==
      expected.action.actionId.toLowerCase() ||
    String(parsed['messageHash']).toLowerCase() !==
      expected.action.messageHash.toLowerCase() ||
    typeof parsed['signature'] !== 'string' ||
    !isHex(parsed['signature'], 96)
  ) {
    throw new Error(
      'The signed result does not match this Testnet11 recovery action.',
    );
  }
  return parsed as unknown as AdminChiaRecoveryActionResult;
}

export function hashAdminKeyChangeIntent(intent: AdminKeyChangeIntentV1): string {
  const kind = { ROUTINE: 1, LOST: 2, RECOVERY_KIT: 3 }[intent.kind];
  if (!kind) throw new Error('Administrator key-change kind is invalid.');
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(INTENT_ABI_TYPES, [
      INTENT_TYPE_HASH,
      intent.slot,
      kind,
      intent.oldDailyEvmKey,
      intent.newDailyEvmKey,
      keccak256(intent.oldDailyChiaKey),
      keccak256(intent.newDailyChiaKey),
      intent.oldRecoveryGuardian,
      intent.newRecoveryGuardian,
      keccak256(intent.oldRecoveryBlsKey),
      keccak256(intent.newRecoveryBlsKey),
      intent.identityLauncherIds,
      intent.identitySafes,
      intent.authorityLauncherId,
      intent.coadminSafe,
      intent.rootSafe,
      keccak256(toUtf8Bytes(intent.chiaNetwork)),
      intent.evmChainId,
      intent.sourceManifestHash,
      intent.nonce,
      intent.expiresAt,
      intent.recoveryKeyRevision,
    ]),
  );
}

export function recoveryIntentBlsDigest(intentHash: string): string {
  if (!isHex(intentHash, 32)) throw new Error('Recovery intent hash is invalid.');
  const message = pairHash(
    atomHash(toUtf8Bytes('SolslotAdminKeyChangeIntentV1')),
    atomHash(getBytes(intentHash)),
  );
  return pairHash(
    atomHash(toUtf8Bytes('Chia Signed Message')),
    atomHash(getBytes(message)),
  );
}

function validateChallengeEnvelope(challenge: RecoveryDrillChallenge): void {
  if (
    !hasExactKeys(challenge as unknown as Record<string, unknown>, [
      'blsSigningDigest',
      'challengeHash',
      'challengeId',
      'evmTypedData',
      'expiresAt',
      'recoveryBlsPath',
      'recoveryEvmPath',
      'revision',
    ]) ||
    !isHex(challenge.challengeId, 32) ||
    !isHex(challenge.challengeHash, 32) ||
    !isHex(challenge.blsSigningDigest, 32) ||
    !Number.isSafeInteger(challenge.expiresAt) ||
    !Number.isSafeInteger(challenge.revision) ||
    challenge.revision < 1 ||
    challenge.recoveryBlsPath !== 'm/12381/8444/2/0-unhardened' ||
    challenge.recoveryEvmPath !== "m/44'/60'/0'/0/0" ||
    !isRecord(challenge.evmTypedData)
  ) {
    throw new Error('The recovery test challenge is malformed.');
  }
}

function validateLostRecoveryBody(
  body: Omit<AdminLostRecoveryPackage, 'checksum'>,
): void {
  validateLostIntent(body.intent);
  const intentHash = hashAdminKeyChangeIntent(body.intent);
  const typedData = body.guardianTypedData;
  const domainFields = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ];
  const authorizationFields = [{ name: 'intentHash', type: 'bytes32' }];
  if (
    body.schemaVersion !== 1 ||
    body.purpose !== LOST_KEY_PURPOSE ||
    intentHash.toLowerCase() !== body.intentHash.toLowerCase() ||
    recoveryIntentBlsDigest(intentHash).toLowerCase() !==
      body.recoveryBlsDigest.toLowerCase() ||
    getAddress(body.coordinator) !== body.coordinator ||
    typedData.primaryType !== 'SolslotLostKeyPrepare' ||
    !hasExactKeys(typedData.domain as Record<string, unknown>, [
      'chainId',
      'name',
      'verifyingContract',
      'version',
    ]) ||
    typedData.domain.name !== 'Solslot Admin Recovery' ||
    typedData.domain.version !== '1' ||
    Number(typedData.domain.chainId) !== 84532 ||
    getAddress(String(typedData.domain.verifyingContract)) !== body.coordinator ||
    !hasExactKeys(typedData.types, [
      'EIP712Domain',
      'SolslotLostKeyPrepare',
    ]) ||
    JSON.stringify(typedData.types['EIP712Domain']) !== JSON.stringify(domainFields) ||
    JSON.stringify(typedData.types['SolslotLostKeyPrepare']) !==
      JSON.stringify(authorizationFields) ||
    !hasExactKeys(typedData.message, ['intentHash']) ||
    String(typedData.message['intentHash']).toLowerCase() !== intentHash.toLowerCase()
  ) {
    throw new Error('The lost-wallet recovery package does not match its exact intent.');
  }
}

function validateRecoveryGuardianActionBody(
  body: Omit<AdminRecoveryGuardianActionPackage, 'checksum'>,
): void {
  validateRecoveryKitIntent(body.intent);
  const intentHash = hashAdminKeyChangeIntent(body.intent);
  const primaryType =
    body.action === 'ACCEPT'
      ? 'SolslotRecoveryGuardianAccept'
      : 'SolslotRecoveryGuardianVeto';
  const expectedGuardian =
    body.action === 'ACCEPT'
      ? body.intent.newRecoveryGuardian
      : body.intent.oldRecoveryGuardian;
  const domainFields = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ];
  const authorizationFields = [{ name: 'intentHash', type: 'bytes32' }];
  const typedData = body.guardianTypedData;
  if (
    body.schemaVersion !== 1 ||
    body.purpose !== GUARDIAN_ACTION_PURPOSE ||
    body.caseId.toLowerCase() !== `recovery-${intentHash.slice(2)}` ||
    body.intentHash.toLowerCase() !== intentHash.toLowerCase() ||
    getAddress(body.coordinator) !== body.coordinator ||
    getAddress(body.expectedGuardian) !== getAddress(expectedGuardian) ||
    typedData.primaryType !== primaryType ||
    !hasExactKeys(typedData.domain as Record<string, unknown>, [
      'chainId',
      'name',
      'verifyingContract',
      'version',
    ]) ||
    typedData.domain.name !== 'Solslot Admin Recovery' ||
    typedData.domain.version !== '1' ||
    Number(typedData.domain.chainId) !== 84532 ||
    getAddress(String(typedData.domain.verifyingContract)) !== body.coordinator ||
    !hasExactKeys(typedData.types, ['EIP712Domain', primaryType]) ||
    JSON.stringify(typedData.types['EIP712Domain']) !== JSON.stringify(domainFields) ||
    JSON.stringify(typedData.types[primaryType]) !==
      JSON.stringify(authorizationFields) ||
    !hasExactKeys(typedData.message, ['intentHash']) ||
    String(typedData.message['intentHash']).toLowerCase() !== intentHash.toLowerCase()
  ) {
    throw new Error(
      'The recovery-kit guardian package does not match its exact intent.',
    );
  }
}

function validateChiaRecoveryActionBody(
  body: Omit<AdminChiaRecoveryActionPackage, 'checksum'>,
): void {
  validateLostIntent(body.intent);
  const intentHash = hashAdminKeyChangeIntent(body.intent);
  const action = body.action;
  const pairs = action.blsPairs;
  const wirePairs = pairs.map((pair) => [pair.publicKey, pair.message]);
  const expectedMessageHash = checksum({
    schemaVersion: 1,
    kind: 'AuthorityV3BlsMessages',
    pairs: wirePairs,
  });
  const expectedActionId = checksum({
    schemaVersion: 1,
    phase: 'PREPARE',
    role: 'lost-key-recovery',
    slot: body.intent.slot,
    publicKey: body.intent.oldRecoveryBlsKey,
    messageHash: expectedMessageHash,
    pairs: wirePairs,
  });
  if (
    body.schemaVersion !== 1 ||
    body.purpose !== CHIA_RECOVERY_ACTION_PURPOSE ||
    body.caseId.toLowerCase() !== `recovery-${intentHash.slice(2)}` ||
    body.intentHash.toLowerCase() !== intentHash.toLowerCase() ||
    action.phase !== 'PREPARE' ||
    action.signerKind !== 'BLS_RECOVERY' ||
    action.signerSlot !== body.intent.slot ||
    action.signerPublicKey.toLowerCase() !==
      body.intent.oldRecoveryBlsKey.toLowerCase() ||
    action.network !== 'Testnet11' ||
    action.typedData !== null ||
    action.coinId !== null ||
    action.delegatedPuzzleHash !== null ||
    action.signed ||
    !Array.isArray(pairs) ||
    pairs.length < 1 ||
    pairs.length > 8 ||
    pairs.some(
      (pair) =>
        !isHex(pair.publicKey, 48) ||
        pair.publicKey.toLowerCase() !==
          body.intent.oldRecoveryBlsKey.toLowerCase() ||
        !isBoundedHexMessage(pair.message),
    ) ||
    action.messageHash.toLowerCase() !== expectedMessageHash.toLowerCase() ||
    action.actionId.toLowerCase() !== expectedActionId.toLowerCase()
  ) {
    throw new Error(
      'The Testnet11 recovery action does not match its exact lost-wallet intent.',
    );
  }
}

function validateRecoveryKitIntent(intent: AdminKeyChangeIntentV1): void {
  validateIntentShape(intent);
  if (
    intent.kind !== 'RECOVERY_KIT' ||
    getAddress(intent.oldDailyEvmKey) !== getAddress(intent.newDailyEvmKey) ||
    intent.oldDailyChiaKey.toLowerCase() !== intent.newDailyChiaKey.toLowerCase() ||
    getAddress(intent.oldRecoveryGuardian) ===
      getAddress(intent.newRecoveryGuardian) ||
    intent.oldRecoveryBlsKey.toLowerCase() ===
      intent.newRecoveryBlsKey.toLowerCase()
  ) {
    throw new Error('The recovery-kit replacement intent is malformed.');
  }
}

function validateLostIntent(intent: AdminKeyChangeIntentV1): void {
  validateIntentShape(intent);
  if (
    intent.kind !== 'LOST' ||
    getAddress(intent.oldDailyEvmKey) === getAddress(intent.newDailyEvmKey) ||
    intent.oldRecoveryBlsKey.toLowerCase() !== intent.newRecoveryBlsKey.toLowerCase() ||
    getAddress(intent.oldRecoveryGuardian) !== getAddress(intent.newRecoveryGuardian)
  ) {
    throw new Error('The lost-wallet recovery intent is malformed.');
  }
}

function validateIntentShape(intent: AdminKeyChangeIntentV1): void {
  const expectedKeys = [
    'authorityLauncherId',
    'chiaNetwork',
    'coadminSafe',
    'evmChainId',
    'expiresAt',
    'identityLauncherIds',
    'identitySafes',
    'kind',
    'newDailyChiaKey',
    'newDailyEvmKey',
    'newRecoveryBlsKey',
    'newRecoveryGuardian',
    'nonce',
    'oldDailyChiaKey',
    'oldDailyEvmKey',
    'oldRecoveryBlsKey',
    'oldRecoveryGuardian',
    'recoveryKeyRevision',
    'rootSafe',
    'schemaVersion',
    'slot',
    'sourceManifestHash',
  ];
  const launchers = intent.identityLauncherIds;
  const safes = intent.identitySafes;
  if (
    !hasExactKeys(intent as unknown as Record<string, unknown>, expectedKeys) ||
    intent.schemaVersion !== 1 ||
    !Number.isInteger(intent.slot) ||
    intent.slot < 0 ||
    intent.slot > 2 ||
    intent.chiaNetwork !== 'testnet11' ||
    intent.evmChainId !== 84532 ||
    !Number.isSafeInteger(intent.nonce) ||
    intent.nonce < 1 ||
    !Number.isSafeInteger(intent.expiresAt) ||
    intent.expiresAt < 1 ||
    !Number.isSafeInteger(intent.recoveryKeyRevision) ||
    intent.recoveryKeyRevision < 1 ||
    !isCompressedKey(intent.oldDailyChiaKey) ||
    !isCompressedKey(intent.newDailyChiaKey) ||
    computeAddress(intent.oldDailyChiaKey) !== getAddress(intent.oldDailyEvmKey) ||
    computeAddress(intent.newDailyChiaKey) !== getAddress(intent.newDailyEvmKey) ||
    !isHex(intent.oldRecoveryBlsKey, 48) ||
    !isHex(intent.newRecoveryBlsKey, 48) ||
    getAddress(intent.oldRecoveryGuardian) !== intent.oldRecoveryGuardian ||
    getAddress(intent.newRecoveryGuardian) !== intent.newRecoveryGuardian ||
    !Array.isArray(launchers) ||
    launchers.length !== 3 ||
    !launchers.every((value) => isHex(value, 32)) ||
    new Set(launchers.map((value) => value.toLowerCase())).size !== 3 ||
    !Array.isArray(safes) ||
    safes.length !== 3 ||
    safes.some((value) => getAddress(value) !== value) ||
    new Set(safes.map((value) => value.toLowerCase())).size !== 3 ||
    !isHex(intent.authorityLauncherId, 32) ||
    !isHex(intent.sourceManifestHash, 32) ||
    getAddress(intent.coadminSafe) !== intent.coadminSafe ||
    getAddress(intent.rootSafe) !== intent.rootSafe
  ) {
    throw new Error('The administrator key-change intent is malformed.');
  }
}

function atomHash(value: Uint8Array): string {
  return sha256(concat([new Uint8Array([1]), value]));
}

function pairHash(left: string, right: string): string {
  return sha256(concat([new Uint8Array([2]), getBytes(left), getBytes(right)]));
}

function isCompressedKey(value: unknown): value is string {
  return typeof value === 'string' && /^0x0[23][0-9a-f]{64}$/i.test(value);
}

function checksum(value: unknown): string {
  return sha256(toUtf8Bytes(stableJson(value)));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Recovery package contains an invalid number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  throw new Error('Recovery package contains an unsupported value.');
}

function parseJsonObject(value: string, message: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new Error(message);
  }
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isHex(value: unknown, bytes: number): value is string {
  return typeof value === 'string' && new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, 'i').test(value);
}

function isBoundedHexMessage(value: unknown): value is string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(value)) {
    return false;
  }
  const bytes = (value.length - 2) / 2;
  return bytes >= 1 && bytes <= 1024;
}
