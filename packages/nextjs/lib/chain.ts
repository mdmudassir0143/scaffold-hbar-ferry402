/**
 * Base Sepolia reads: the merchant's Escrow ledger balance, and a check of
 * each journal entry against the settlement transaction it names. The chain
 * is the source of truth -- a journal entry counts only if its tx emitted a
 * matching PaymentSettled log from the trusted Escrow.
 */
import { createPublicClient, http, isAddressEqual, parseEventLogs, type Hex } from 'viem'
import { baseSepolia } from 'viem/chains'
import { config } from './config'
import type { JournalEntry } from './journal'

const escrowAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'merchant', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
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

const client = createPublicClient({ chain: baseSepolia, transport: http(config.rpcUrl, { timeout: 5000 }) })

export async function escrowBalance(): Promise<bigint> {
  return client.readContract({
    address: config.escrowAddress,
    abi: escrowAbi,
    functionName: 'balanceOf',
    args: [config.merchantEvmAddress],
  })
}

export type Verdict = 'verified' | 'mismatch' | 'reverted' | 'not-found' | 'unreachable'

export async function verifyEntry(entry: JournalEntry): Promise<Verdict> {
  let receipt
  try {
    receipt = await client.getTransactionReceipt({ hash: entry.txHash as Hex })
  } catch (err) {
    return err instanceof Error && err.name === 'TransactionReceiptNotFoundError' ? 'not-found' : 'unreachable'
  }
  if (receipt.status !== 'success') return 'reverted'

  const fromEscrow = receipt.logs.filter((log) => isAddressEqual(log.address, config.escrowAddress))
  const settled = parseEventLogs({ abi: escrowAbi, eventName: 'PaymentSettled', logs: fromEscrow })
  const match = settled.find(
    (log) =>
      isAddressEqual(log.args.merchant, config.merchantEvmAddress) &&
      log.args.nonce.toLowerCase() === entry.nonce.toLowerCase() &&
      log.args.value === BigInt(entry.amount),
  )
  return match ? 'verified' : 'mismatch'
}
