/**
 * The route-handler half of a ferry402 payment. `ferry402()` (the SDK
 * middleware used in src/server.ts) only calls `/verify` -- actually
 * collecting the payment (`/settle`) and journaling it to Hedera Consensus
 * Service is the route handler's own job, immediately after `next()` runs.
 * This is a straight reuse of the proven shape in ferry402's own
 * `examples/demo/src/lib/flow.ts`, factored out so src/server.ts's route
 * handler stays a few lines.
 */
import { createPublicClient, http, parseEventLogs, type Address, type Hex } from 'viem'
import { baseSepolia } from 'viem/chains'
import { Client, AccountId, PrivateKey } from '@hashgraph/sdk'
import { journalEntryForSettlement, writeEntry, createHederaTopicSubmitter } from '@ferry402/facilitator'
import type { JournalEntry } from '@ferry402/facilitator'
import type { Ferry402Locals } from '@ferry402/sdk'
import { env } from './env.js'

// Minimal hand-written ABI for the one event this template reads --
// Escrow.sol's `PaymentSettled` -- the same convention ferry402's own demo
// uses rather than pulling in a full build artifact just to read one log.
const escrowSettledEventAbi = [
  {
    type: 'event',
    name: 'PaymentSettled',
    anonymous: false,
    inputs: [
      { name: 'merchant', type: 'address', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'bytes32', indexed: false },
    ],
  },
] as const

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(env.rpcUrl) })

// Built lazily (not at module load) so importing this file never requires a
// live Hedera account -- only actually settling a payment does.
let hederaClient: Client | undefined
function getHederaClient(): Client {
  if (!hederaClient) {
    // HEDERA_PRIVATE_KEY from the Hedera portal is typically ECDSA,
    // DER-encoded -- `fromStringDer()` handles that; `fromStringED25519()`
    // would silently derive a DIFFERENT key and every submission would fail
    // with INVALID_SIGNATURE.
    hederaClient = Client.forTestnet().setOperator(AccountId.fromString(env.hederaAccountId), PrivateKey.fromStringDer(env.hederaPrivateKeyDer))
  }
  return hederaClient
}

export type SettleOutcome =
  | {
      ok: true
      transaction: Hex
      network: string
      gasUsed: string
      settledAmount: string
      nonce: Hex
      journal: { topicId: string; sequenceNumber: number; entry: JournalEntry }
    }
  | { ok: false; status: number; error: string }

/**
 * Calls the facilitator's `/settle`, confirms the on-chain `PaymentSettled`
 * log, and journals the settlement to HCS. On any failure, calls
 * `release()` so the (payer, nonce) pair `ferry402()` already consumed is
 * freed -- without this, a payer whose settlement failed for a reason that
 * had nothing to do with them (a flaky RPC, say) would be locked out of
 * retrying for the rest of the derivation window (up to 10 minutes) over a
 * payment that never actually completed.
 */
export async function settleAndJournal(locals: Ferry402Locals, merchantEvm: Address): Promise<SettleOutcome> {
  const { payload, requirements, release } = locals

  const settleRes = await fetch(`http://127.0.0.1:${env.facilitatorPort}/settle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
  })
  const settleJson = (await settleRes.json()) as {
    success: boolean
    errorReason?: string
    transaction: string
    network: string
    payer: string
  }
  if (!settleJson.success) {
    await release()
    return { ok: false, status: 402, error: settleJson.errorReason ?? 'settlement_failed' }
  }

  const receipt = await publicClient.getTransactionReceipt({ hash: settleJson.transaction as Hex })
  const settledLogs = parseEventLogs({ abi: escrowSettledEventAbi, eventName: 'PaymentSettled', logs: receipt.logs })
  const settled = settledLogs[0]
  if (!settled) {
    // Settlement reported success but produced no PaymentSettled log --
    // nothing was actually credited. Same reasoning as above: release it.
    await release()
    return { ok: false, status: 500, error: 'no_settlement_log' }
  }

  const entry = journalEntryForSettlement({
    merchant: env.hederaAccountId,
    merchantEvm,
    sourceChain: 'base-sepolia',
    settlement: {
      settledAmount: settled.args.value,
      nonce: settled.args.nonce,
      transaction: settleJson.transaction,
      payer: settleJson.payer,
    },
  })
  const submitter = createHederaTopicSubmitter(getHederaClient())
  const journalResult = await writeEntry(entry, { topicId: env.topicId, submitter })

  return {
    ok: true,
    transaction: settleJson.transaction as Hex,
    network: settleJson.network,
    gasUsed: receipt.gasUsed.toString(),
    settledAmount: settled.args.value.toString(),
    nonce: settled.args.nonce,
    journal: { topicId: env.topicId, sequenceNumber: journalResult.sequenceNumber, entry },
  }
}
