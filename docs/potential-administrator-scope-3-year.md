# Solslot Protocol Administrator

## Three-Year Role Brief and Scope of Work

**Document status:** Candidate discussion draft  
**Proposed term:** 36 months from the effective date  
**Current environment:** Solslot V2 Testnet11 Alpha  
**Role:** Independent co-administrator  

This document explains the expected work, authority boundaries, security
standards, and time commitment for a potential Solslot protocol
administrator. It is an operational role brief, not an employment agreement,
offer of compensation, legal opinion, or grant of authority. Final
compensation, indemnification, insurance, confidentiality, intellectual
property, termination, and governing-law terms must be stated in a separate
signed agreement reviewed by counsel.

## 1. Purpose of the Role

Solslot uses three distinct administrator wallets:

- one owner/issuer administrator in permanent slot 1; and
- two independent co-administrators in slots 2 and 3.

Consequential administrator actions normally require the owner plus at least
one co-administrator. The candidate's job is to provide an informed,
independent check before an action proceeds. The candidate is expected to
review evidence, ask questions, refuse incomplete requests, sign only the
exact operation reviewed, and help preserve reliable records.

The role is not honorary. A signature may help authorize irreversible
blockchain activity, protocol configuration, property issuance, payment-rail
administration, or emergency action.

## 2. Authority Boundaries

An administrator wallet does not provide unrestricted control over Solslot.
The candidate:

- does not receive the owner's wallet, seed phrase, or private keys;
- does not receive validator, Key of Solomon, Samuel, server, or customer
  wallet private keys;
- cannot unilaterally mint, transfer customer assets, change protocol rules,
  move treasury funds, approve a property, or bypass zkPassport eligibility;
- cannot substitute API records, browser data, or personal instructions for
  confirmed on-chain state;
- is not automatically a governance committee member, validator, issuer,
  investment adviser, broker, attorney, or company officer; and
- receives only the access required for the assigned administrator duties.

Protocol consensus rules, the current administrator authority, governance
approval, Safe thresholds, timelocks, feature gates, and chain confirmation
remain authoritative. The administrator must never attempt to work around
them.

## 3. Initial Onboarding

Before enrollment, the candidate will:

1. Review this scope, the current release summary, the administrator signing
   procedure, the incident process, and the key-compromise procedure.
2. Disclose relevant financial, business, family, property, vendor, or
   governance conflicts.
3. Establish a dedicated EIP-712-capable administrator wallet that is not
   shared with another person or used for ordinary trading.
4. Protect administrative accounts with phishing-resistant MFA, preferably
   hardware security keys, and maintain an offline recovery method.
5. Complete a supervised Testnet11 rehearsal covering login, evidence review,
   transaction simulation, refusal of a mismatched request, signing, chain
   confirmation, and incident reporting.
6. Enroll through the live genesis ceremony using a fresh, single-use
   invitation and the candidate's own device.
7. Independently verify the enrolled wallet address, authority slot, network,
   release identity, and signed ceremony artifact before accepting the role.

No private key, mnemonic, raw identity document, OAuth token, JWT, ceremony
credential, or recovery secret may be sent to Solslot or another
administrator.

## 4. Core Duties

### A. Release and Ceremony Review

The candidate will review the exact release presented by the administrator
UI, including:

- full source commit identifiers and release checksums;
- network and protocol version;
- protocol and EVM deployment coordinates;
- puzzle and runtime bytecode hashes;
- funding-input status and predicted outputs;
- validator health and quorum evidence;
- security review status and unresolved release blockers; and
- whether all write, minting, purchase, and ceremony gates are in the
  intended state.

During a fresh genesis ceremony, the candidate may be asked to sign the
deterministic plan and final public artifact. The candidate must sign only
after independently reviewing the displayed hash and evidence. A rejected,
timed-out, partial, or ambiguous ceremony is abandoned; the candidate must not
approve manual database repair, artifact editing, or reuse of affected
ceremony inputs.

### B. Property Collection and SmartDeed Review

For a proposed property collection, the candidate will independently review:

- property class, project stage, ownership, and issuer identity;
- media, valuation, title, debt, operating, legal, and risk disclosures;
- class- and stage-specific diligence requirements;
- source documents and the distinction between private originals and public
  redacted copies;
- deed identifiers, allocation totals, pricing, technology fees, and
  treasury destination;
- canonical metadata, media hashes, allocation root, metadata root, and
  payload size;
- reviewer comments and unresolved blocking issues;
- governance proposal terms and resulting SmartDeed rights; and
- the public investor preview for accuracy and consistency.

The candidate must not rubber-stamp the owner's submission. Material
questions must be recorded in the collection desk and resolved before the
candidate approves an owner-plus-one operation. The candidate must disclose a
conflict and abstain when independence is impaired.

Administrator approval confirms that the reviewed evidence matches the
proposed operation. It does not replace property-level legal advice,
valuation work, governance approval, or on-chain execution requirements.

### C. Payment Rails, Presales, and Treasury Controls

When separately assigned to a payment or Safe operation, the candidate will:

- verify network, token, amount, recipient, payment ID, contract, nonce,
  operation hash, and timelock;
- confirm that the displayed transaction exactly matches the reviewed
  proposal and evidence;
- verify zkPassport-approved vault and SmartDeed delivery constraints;
- check refund destinations and confirm that refunds return to the original
  payer;
- avoid signing blind messages, unlimited approvals, changed calldata, or
  transactions received outside the administrator UI; and
- wait for authoritative chain confirmation before treating an action as
  complete.

The candidate must never accept a request to bypass the 24-hour timelock,
Safe threshold, eligibility gate, approved price, inventory order, or
reconciliation state.

### D. Ongoing Oversight

The candidate will participate in:

- monthly review of administrator access, wallet readiness, unresolved
  security items, and non-terminal payments;
- release review before consequential upgrades;
- quarterly recovery and incident-response exercises;
- review of reconciliation mismatches, stale payments, refunds, bridge
  inventory, validator quorum, and customer-impacting incidents;
- annual review of this scope, access, conflicts, and continuing suitability;
  and
- orderly offboarding or replacement when the engagement ends.

## 5. Signing Standard

Before every signature, the candidate must verify:

- the correct Solslot domain and expected website origin;
- Testnet11 or the expressly approved network;
- the current release and signed artifact;
- the candidate's expected wallet and administrator slot;
- the action type and plain-English purpose;
- all addresses, amounts, hashes, revisions, nonces, and expiry times;
- whether the action is a message signature or a transaction;
- the required co-signers and timelock; and
- the expected chain result.

If any field is missing, unexpected, changed, unreadable, or inconsistent,
the candidate will stop and request clarification through the approved
out-of-band channel. Urgency is never a reason to sign an unclear request.

## 6. Security and Conduct Expectations

The candidate agrees to:

- use a dedicated device profile and keep operating systems, browsers, wallet
  software, and security tools supported and current;
- use unique passwords stored in a reputable password manager and
  phishing-resistant MFA for email, GitHub, Cloudflare, and other assigned
  administrative services;
- keep wallet recovery material offline, private, and physically protected;
- confirm sensitive requests through a second communication channel;
- report suspected phishing, device loss, key exposure, unauthorized login,
  or mistaken signature immediately;
- preserve relevant evidence without editing logs or shared state;
- avoid front-running, self-dealing, undisclosed referral payments, bribes,
  or trading based on nonpublic property or protocol information;
- protect confidential business, security, customer, and property
  information; and
- use candidate access only for authorized Solslot work.

The candidate must never share credentials, export a private key for another
person, paste secrets into chat or tickets, disable a safety gate for
convenience, modify a production database manually, or represent a
transaction as confirmed before chain evidence exists.

## 7. Availability and Service Expectations

The proposed operating expectation is:

- **Onboarding and rehearsals:** approximately 8-12 hours during the first
  month.
- **Normal operations:** approximately 2-4 hours per week, varying with
  collections and releases.
- **Major release or ceremony:** approximately 4-8 scheduled hours per event,
  with documents supplied far enough in advance for independent review.
- **Routine approval request:** acknowledge within two business days.
- **Urgent security or payment incident:** acknowledge within 60 minutes
  during the candidate's agreed coverage windows.
- **Planned unavailability:** provide advance notice when practical so the
  other administrators can avoid beginning a time-sensitive operation.

This role does not require one person to provide continuous 24/7 coverage.
Coverage windows, escalation contacts, holidays, travel, and backup
arrangements must be agreed in writing.

The candidate is evaluated on accuracy and independence, not signature count
or speed. Refusing an unsafe or insufficiently documented request is
successful performance.

## 8. Incident Responsibilities

For a suspected compromise or operational incident, the candidate will:

1. Stop signing and notify the designated incident channel.
2. State what device, account, wallet, operation, and time may be affected.
3. Preserve screenshots, transaction hashes, messages, and relevant logs.
4. Help identify the last confirmed state using chain evidence and the global
   operation or payment ID.
5. Participate in containment, key or access rotation, reconciliation, and
   documented recovery.
6. Resume signing only after the affected authority and device are verified
   or replaced through the approved process.

The candidate must not improvise a replacement transaction, generate a second
payment ID for an in-flight payment, erase evidence, or privately negotiate a
customer refund outside the approved workflow.

## 9. Records and Confidentiality

Administrator decisions must be recorded in the designated Solslot UI or
approved evidence archive. Records should identify the action, evidence
reviewed, questions raised, signer, timestamp, transaction or operation hash,
and final chain status.

Public chain data and published property materials are not confidential.
Private diligence documents, security architecture, incident details,
credentials, customer information, unpublished collections, and nonpublic
financial information must be treated as confidential throughout the term
and after it ends, subject to the final written agreement and applicable law.

## 10. Three-Year Term and Offboarding

The proposed term is 36 months, subject to:

- a formal review after the first 90 days;
- annual review of performance, conflicts, access, security readiness, and
  continued consent;
- immediate suspension of signing after suspected key compromise or serious
  policy breach; and
- replacement or removal through the protocol's reviewed authority process.

Either party's ordinary termination notice, cure rights, compensation after
termination, and removal mechanics must be stated in the final agreement.
Written resignation alone does not change on-chain authority. The departing
administrator must cooperate with the reviewed replacement/removal
transaction, return or delete company-controlled data and access, preserve
required records, and confirm revocation of assigned accounts. The candidate
must not destroy the wallet or recovery material until on-chain removal is
confirmed.

## 11. Matters Requiring a Separate Agreement

Before the engagement begins, the parties should execute a written agreement
covering:

- compensation and payment schedule;
- approved expenses;
- employee, contractor, adviser, or other legal classification;
- confidentiality and data handling;
- intellectual-property ownership, if any work product is expected;
- conflicts, prohibited transactions, and required disclosures;
- indemnification, limitation of liability, insurance, and legal-defense
  procedures;
- tax responsibility;
- governing law and dispute resolution;
- termination notice and emergency suspension; and
- survival of confidentiality, records, and cooperation duties.

No candidate should accept blockchain signing authority based only on this
role brief.

## 12. Candidate Acknowledgment

The candidate should be able to answer yes to each statement before
enrollment:

- I understand that I am expected to independently review and may refuse an
  operation.
- I understand that my wallet signature can contribute to irreversible
  blockchain activity.
- I will use my own dedicated wallet and will not share its private material.
- I can meet the proposed availability and incident expectations.
- I will disclose conflicts and abstain when appropriate.
- I understand that API access or an administrator login is not authority to
  bypass protocol, governance, Safe, timelock, eligibility, or chain checks.
- I have received enough information to evaluate the role and will obtain my
  own legal, tax, and financial advice as needed.

**Candidate:** ______________________________________

**Proposed effective date:** _________________________

**Solslot representative:** __________________________

Signatures, if requested, acknowledge receipt and discussion only. Binding
engagement terms belong in the separate final agreement.

## Security References

- CISA recommends phishing-resistant MFA, especially for administrators:
  https://www.cisa.gov/audiences/small-and-medium-businesses/secure-your-business/require-multifactor-authentication
- NIST SP 800-61r3 provides current incident-response recommendations:
  https://www.nist.gov/publications/incident-response-recommendations-and-considerations-cybersecurity-risk-management-csf
- Safe explains owners, thresholds, and transaction confirmation:
  https://docs.safe.global/advanced/smart-account-concepts
- OpenZeppelin documents timelocked multisig control:
  https://docs.openzeppelin.com/contracts/5.x/api/governance
