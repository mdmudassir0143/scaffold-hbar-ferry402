/**
 * Asks packages/api for its paid route with no payment attached, exactly as
 * a payer would. A healthy API answers 402 with the bill; anything else is
 * reported as-is so the page can tell the developer what to fix.
 */
import { config, fetchWithTimeout } from './config'

export interface PaymentRequirement {
  network: string
  maxAmountRequired: string
  payTo: string
  asset: string
  resource: string
  description?: string
}

export type BillResult =
  | { kind: 'bill'; accepts: PaymentRequirement[] }
  | { kind: 'unexpected'; status: number }
  | { kind: 'unreachable' }

export async function fetchBill(): Promise<BillResult> {
  try {
    const res = await fetchWithTimeout(`${config.apiUrl}/api/quote`)
    if (res.status !== 402) return { kind: 'unexpected', status: res.status }
    const body = (await res.json()) as { accepts?: PaymentRequirement[] }
    return { kind: 'bill', accepts: body.accepts ?? [] }
  } catch {
    return { kind: 'unreachable' }
  }
}
