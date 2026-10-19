/**
 * Reads ferry402 journal entries from the HCS topic through the public
 * Hedera mirror node. The topic's submit key is null, so anyone can write
 * to it: entries are filtered to this merchant here, and every one is still
 * only a claim until lib/chain.ts checks it against Base Sepolia.
 */
import { config, fetchWithTimeout } from './config'

export interface JournalEntry {
  type: 'payment'
  merchant: string
  merchantEvm: string
  sourceChain: string
  asset: string
  amount: string
  payer: string
  txHash: string
  nonce: string
  ts: string
}

export interface TopicMessage {
  sequenceNumber: number
  consensusTimestamp: string
  entry: JournalEntry
}

interface MirrorMessage {
  sequence_number: number
  consensus_timestamp: string
  message: string
}

function decodeEntry(base64: string): JournalEntry | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Partial<JournalEntry>
    if (parsed.type !== 'payment' || !parsed.merchantEvm || !parsed.txHash || !parsed.nonce || !parsed.amount) return undefined
    return parsed as JournalEntry
  } catch {
    return undefined // Not JSON, or not ours: an open topic carries anything.
  }
}

/** The most recent payment entries for this merchant, newest first. */
export async function fetchJournal(limit = 10): Promise<TopicMessage[]> {
  const url = `${config.mirrorNodeUrl}/api/v1/topics/${config.topicId}/messages?limit=100&order=desc`
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`mirror node returned HTTP ${res.status}`)
  const body = (await res.json()) as { messages: MirrorMessage[] }

  const merchant = config.merchantEvmAddress.toLowerCase()
  const out: TopicMessage[] = []
  for (const m of body.messages) {
    const entry = decodeEntry(m.message)
    if (!entry || entry.merchantEvm.toLowerCase() !== merchant) continue
    out.push({ sequenceNumber: m.sequence_number, consensusTimestamp: m.consensus_timestamp, entry })
    if (out.length === limit) break
  }
  return out
}
