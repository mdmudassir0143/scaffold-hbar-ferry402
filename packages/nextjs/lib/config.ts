/**
 * Server-only config for the dashboard. Every value defaults to the shared
 * testnet deployment packages/api targets (see packages/api/.env.example),
 * so the page renders with no .env at all. Nothing here is a secret: the
 * dashboard only reads public chain and mirror-node state.
 */
import type { Address } from 'viem'

function env(name: string, fallback: string): string {
  return process.env[name] || fallback
}

export const config = {
  apiUrl: env('API_URL', 'http://localhost:3001'),
  rpcUrl: env('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org'),
  escrowAddress: env('ESCROW_ADDRESS_BASE_SEPOLIA', '0x99Cd564B21fa7fD8553Cf31F32E448C17BBcC429') as Address,
  merchantEvmAddress: env('MERCHANT_EVM_ADDRESS', '0x86eEa3B06E6994eaF8Ce3Fcfde6A2F8Fb2Ba947b') as Address,
  topicId: env('HCS_TOPIC_ID', '0.0.10719807'),
  mirrorNodeUrl: env('HEDERA_MIRROR_NODE_URL', 'https://testnet.mirrornode.hedera.com'),
}

/** USDC has 6 decimals; amounts on the wire and on-chain are atomic units. */
export function formatUsdc(atomic: bigint | string): string {
  const value = typeof atomic === 'bigint' ? atomic : BigInt(atomic)
  const whole = value / 1_000_000n
  const fraction = (value % 1_000_000n).toString().padStart(6, '0')
  return `${whole}.${fraction}`
}

/** fetch() that gives up after `ms`, so one slow upstream can't hang the page. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 4000): Promise<Response> {
  return fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(ms) })
}
