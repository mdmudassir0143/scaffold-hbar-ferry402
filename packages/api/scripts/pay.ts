/**
 * A payer client -- proves the scaffold end to end by actually paying one of
 * its routes. Run `npm run dev` in one terminal, then `npm run pay` in
 * another.
 *
 * Uses `createPaymentHeader()` from @ferry402/sdk. This is the ONLY client
 * that can pay a ferry402 route: ferry402 binds the EIP-3009 authorization's
 * nonce to the merchant it was issued for
 * (`nonce = keccak256(abi.encode(merchantEvm, paymentId))`), instead of
 * letting the payer mint random bytes the way stock x402 clients
 * (`x402-fetch`, `x402-axios`) do. A stock client's self-invented nonce will
 * never match what this server's `ferry402()` middleware derived, and fails
 * closed with `invalid_payment`.
 *
 * This is a single, sequential payment by design -- never run two of these
 * concurrently against the same resource (see README.md "Honest
 * limitations": the same payer can't buy the identical URL twice within the
 * ~5-minute derivation window, and settlements should stay sequential per
 * facilitator).
 */
import { loadDotEnv, requiredEnv, optionalEnv } from '../src/dotenv.js'

loadDotEnv()

import { createPaymentHeader } from '@ferry402/sdk'
import type { PaymentRequirements } from '@ferry402/sdk'
import { privateKeyToAccount } from 'viem/accounts'

const PORT = Number(optionalEnv('PORT', '3001'))
const BASE_URL = `http://localhost:${PORT}`
const RESOURCE_PATH = optionalEnv('PAY_RESOURCE', '/api/quote')

// This deployment's USDC domain -- see README.md "What's already deployed".
const USDC_NAME = 'USDC'
const USDC_VERSION = '2'
const BASE_SEPOLIA_CHAIN_ID = 84532

interface PaidSuccessBody {
  resource: string
  quote: Record<string, unknown>
  settlement: { transaction: string; network: string; gasUsed: string; settledAmount: string; nonce: string }
  journal: { topicId: string; sequenceNumber: number; entry: Record<string, unknown> }
}

async function main(): Promise<void> {
  const account = privateKeyToAccount(requiredEnv('PAYER_PRIVATE_KEY') as `0x${string}`)
  console.log(`payer: ${account.address}`)

  // A fresh query string guarantees a fresh nonce on every run of this
  // script, regardless of the current 5-minute time bucket -- without it,
  // re-running `npm run pay` twice in quick succession against the exact
  // same URL would derive the IDENTICAL nonce and the second run would fail
  // as a replay, which is correct behavior, not a bug (see README.md).
  const requestPath = `${RESOURCE_PATH}?run=${Date.now()}`

  console.log(`\nSTEP 1: GET ${requestPath} with no payment`)
  const challengeRes = await fetch(`${BASE_URL}${requestPath}`)
  if (challengeRes.status !== 402) {
    throw new Error(`expected HTTP 402, got ${challengeRes.status} -- is \`npm run dev\` running in another terminal?`)
  }
  const challengeBody = (await challengeRes.json()) as { x402Version: number; accepts: PaymentRequirements[] }
  const requirement = challengeBody.accepts[0]
  console.log(`  HTTP 402 -- ${requirement.maxAmountRequired} atomic USDC on ${requirement.network}, payTo ${requirement.payTo}`)

  console.log('\nSTEP 2: sign the EIP-3009 authorization')
  const header = await createPaymentHeader(requirement, account, {
    tokenName: USDC_NAME,
    tokenVersion: USDC_VERSION,
    chainId: BASE_SEPOLIA_CHAIN_ID,
  })
  console.log(`  signed by ${account.address}`)

  console.log('\nSTEP 3: retry with X-PAYMENT -- verify, settle, and journal all happen in this one round trip')
  const paidRes = await fetch(`${BASE_URL}${requestPath}`, { headers: { 'X-PAYMENT': header } })
  const paidBody = (await paidRes.json()) as PaidSuccessBody | { error?: string }

  if (!paidRes.ok) {
    console.error(`\nPAYMENT FAILED: HTTP ${paidRes.status}`, paidBody)
    console.error('\nCommon causes: PAYER_PRIVATE_KEY has no Base Sepolia testnet USDC (get some from')
    console.error('https://faucet.circle.com), or the facilitator/merchant rejected the settlement.')
    process.exitCode = 1
    return
  }

  const body = paidBody as PaidSuccessBody
  console.log(`\nPAID. HTTP ${paidRes.status}`)
  console.log(`  quote:        ${JSON.stringify(body.quote)}`)
  console.log(`  settled:      ${body.settlement.settledAmount} atomic USDC (gas used: ${body.settlement.gasUsed})`)
  console.log(`  tx:           ${body.settlement.transaction}`)
  console.log(`  basescan:     https://sepolia.basescan.org/tx/${body.settlement.transaction}`)
  console.log(`  HCS journal:  topic ${body.journal.topicId}, sequence #${body.journal.sequenceNumber}`)
  console.log(`  hashscan:     https://hashscan.io/testnet/topic/${body.journal.topicId}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err)
  process.exitCode = 1
})
