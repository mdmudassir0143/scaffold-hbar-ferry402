/**
 * The /verify + /settle service, built with @ferry402/facilitator's
 * `createFacilitatorApp()`. This is the service `ferry402()` (in
 * src/server.ts) calls to check a payment, and the service src/settle.ts
 * calls to actually execute one into the Escrow contract on Base Sepolia.
 *
 * Self-hosted deliberately: nothing in ferry402 requires trusting someone
 * else's facilitator instance. `npm start` (src/server.ts) boots this in
 * the same process as the merchant API, which is simpler for a newcomer
 * than running two terminals -- there is nothing stopping you from running
 * it as its own standalone process later (just call `startFacilitator()`
 * from its own entrypoint).
 *
 * See https://github.com/mdmudassir0143/ferry402/tree/main/packages/facilitator#readme
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createFacilitatorApp } from '@ferry402/facilitator'
import { env } from './env.js'

export interface FacilitatorHandle {
  baseUrl: string
  server: Server
}

/** Starts the facilitator listening on loopback and returns its base URL.
 *  `escrows` is the required, operator-controlled allowlist: `/verify` and
 *  `/settle` are both unauthenticated and take `payTo` from the caller, so
 *  without this allowlist a caller could point settlement at an address
 *  this facilitator never deployed or trusts. See the facilitator's own
 *  README, "The escrows option". */
export async function startFacilitator(): Promise<FacilitatorHandle> {
  const app = createFacilitatorApp({
    escrows: { 'base-sepolia': env.escrowAddress },
    rpcUrls: { 'base-sepolia': env.rpcUrl },
    facilitatorPrivateKey: env.facilitatorPrivateKey,
  })

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(env.facilitatorPort, '127.0.0.1', () => resolve(s))
  })
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, server }
}
