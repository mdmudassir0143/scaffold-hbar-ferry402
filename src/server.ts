/**
 * The merchant API: one paid route, guarded by `ferry402()` from
 * @ferry402/sdk. `npm start` runs this file, which also boots the
 * facilitator (src/facilitator.ts) in the same process -- one command
 * starts everything, which is simpler for a newcomer than two terminals.
 *
 * Run with: `npm install && npm start` (see README.md for prerequisites).
 * Then: `curl -s http://localhost:3000/api/quote` (expect HTTP 402), or
 * `npm run pay` to pay it for real.
 */
import express from 'express'
import { ferry402 } from '@ferry402/sdk'
import type { Ferry402Config, Ferry402Locals } from '@ferry402/sdk'
import { startFacilitator } from './facilitator.js'
import { settleAndJournal } from './settle.js'
import { env } from './env.js'

async function main(): Promise<void> {
  // Start the facilitator first: ferry402()'s own /verify call (below) and
  // this route's /settle call (src/settle.ts) both need it up already.
  const facilitator = await startFacilitator()
  console.log(`[facilitator] listening on ${facilitator.baseUrl}`)

  const config: Ferry402Config = {
    price: '$0.01',
    accept: ['base-sepolia'],
    settleTo: 'hedera',
    merchant: env.hederaAccountId,
    merchantEvm: { 'base-sepolia': env.merchantEvmAddress },
    facilitator: facilitator.baseUrl,
    escrows: { 'base-sepolia': env.escrowAddress },
    assets: { 'base-sepolia': env.usdcAddress },
    secret: env.ferry402Secret,
  }

  const app = express()

  // The entire merchant-side integration: one middleware. `ferry402()`
  // issues the 402 challenge and verifies a presented payment; everything
  // after `next()` -- settling into the Escrow and journaling to HCS --
  // is this handler's own job (settleAndJournal, src/settle.ts).
  app.get('/api/quote', ferry402(config), async (_req, res) => {
    const locals = res.locals.x402 as Ferry402Locals
    const outcome = await settleAndJournal(locals, env.merchantEvmAddress)

    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.error })
      return
    }

    res.status(200).json({
      resource: '/api/quote',
      quote: { pair: 'HBAR/USD', price: '0.0734', asOf: new Date().toISOString() },
      settlement: {
        transaction: outcome.transaction,
        network: outcome.network,
        gasUsed: outcome.gasUsed,
        settledAmount: outcome.settledAmount,
        nonce: outcome.nonce,
      },
      journal: outcome.journal,
    })
  })

  app.listen(env.port, () => {
    console.log(`\nscaffold-hbar-ferry402 -- paid API listening on http://localhost:${env.port}`)
    console.log(`\n  curl -s http://localhost:${env.port}/api/quote\n`)
    console.log('Expect HTTP 402 with an `accepts` array -- that is the bill.')
    console.log('Run `npm run pay` in another terminal to pay it for real.\n')
  })
}

main().catch((err) => {
  console.error('fatal:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exitCode = 1
})
