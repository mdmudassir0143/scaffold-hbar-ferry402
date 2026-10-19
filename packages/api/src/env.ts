/**
 * Config for the merchant API + facilitator (src/server.ts, src/facilitator.ts,
 * src/settle.ts). `scripts/pay.ts` is a separate actor (the payer) and reads
 * its own, smaller env surface directly -- it has no business needing
 * `HEDERA_PRIVATE_KEY` or `FACILITATOR_PRIVATE_KEY`.
 *
 * Non-secret values (RPC URL, escrow/asset/merchant addresses, HCS topic)
 * default to the live Base Sepolia + Hedera testnet deployment this
 * scaffold targets out of the box -- see README.md "What's already
 * deployed". Secrets have no default and throw a clear error if unset.
 */
import type { Address, Hex } from 'viem'
import { loadDotEnv, requiredEnv, optionalEnv } from './dotenv.js'

loadDotEnv()

export const env = {
  port: Number(optionalEnv('PORT', '3001')),
  facilitatorPort: Number(optionalEnv('FACILITATOR_PORT', '4000')),

  rpcUrl: optionalEnv('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org'),
  escrowAddress: optionalEnv('ESCROW_ADDRESS_BASE_SEPOLIA', '0x99Cd564B21fa7fD8553Cf31F32E448C17BBcC429') as Address,
  usdcAddress: optionalEnv('USDC_ADDRESS_BASE_SEPOLIA', '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address,
  merchantEvmAddress: optionalEnv('MERCHANT_EVM_ADDRESS', '0x86eEa3B06E6994eaF8Ce3Fcfde6A2F8Fb2Ba947b') as Address,
  topicId: optionalEnv('HCS_TOPIC_ID', '0.0.10719807'),

  // Secrets -- no safe default, each throws a clear error if missing.
  hederaAccountId: requiredEnv('HEDERA_ACCOUNT_ID'),
  hederaPrivateKeyDer: requiredEnv('HEDERA_PRIVATE_KEY'),
  facilitatorPrivateKey: requiredEnv('FACILITATOR_PRIVATE_KEY') as Hex,
  ferry402Secret: requiredEnv('FERRY402_SECRET'),
}
