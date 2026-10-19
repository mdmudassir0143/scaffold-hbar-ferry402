# AGENTS.md

Conventions for an agent working in this repo, and a short loop for an agent
that needs to actually pay one of this template's routes (e.g. to consume it
as a paid API, or to verify a change).

## What this repo is

A Scaffold-HBAR community template: a minimal, paid HTTP API built on
`@ferry402/sdk` (merchant + payer side) and `@ferry402/facilitator`
(`/verify` + `/settle`), settling USDC on Base Sepolia into a non-custodial
`Escrow` contract and journaling every payment to a Hedera Consensus Service
topic. See `README.md` first -- it has the full walkthrough, the live
deployed addresses this template targets, and the honest limitations. Read
that before changing anything below.

## Layout

An npm workspaces monorepo. Run every script from the repo root.

| Package | Contents | Check it with |
|---|---|---|
| `packages/api` (`@sh/api`) | Merchant API, facilitator, payer script. The only package with secrets (`packages/api/.env`). | `npm run api:check-types` |
| `packages/nextjs` (`@sh/nextjs`) | Read-only dashboard: bill, Escrow balance, HCS journal reconciled against Base Sepolia. | `npm run next:lint`, `npm run next:build` |
| `packages/foundry` (`@sh/foundry`) | `Escrow.sol`, its test suites, a Base Sepolia deploy script. | `npm run foundry:test`, `npm run foundry:lint` |

`npm run lint` and `npm run build` run every package's checks; both must
pass before you call a change done. Paths in the conventions below are
relative to the package they're in.

## Conventions

- **npm, ESM.** `"type": "module"` throughout. The API runs TypeScript
  directly with `tsx` -- don't add a bundler or a `tsc` build that `dev` or
  `pay` depend on. Don't introduce pnpm or yarn: this template declares
  `npm`, and `create-scaffold-hbar` rewrites commands for the declared
  package manager only.
- **Keep the root script names.** `dev`, `pay`, `next:*` and `foundry:*`
  are referenced by `template.json`'s outro and the README. The CLI also
  rewrites and prunes root scripts by name: it deletes `start` and other
  `next:*` keys when a project is scaffolded with no frontend, which is why
  the API's command is `dev`, not `start`.
- **One process, one command.** `packages/api/src/server.ts` starts both the
  merchant Express app and the facilitator (`src/facilitator.ts`) in the
  same process. Keep it that way unless asked to split them -- it's what
  makes `npm run dev` the one command a newcomer needs.
- **The dashboard stays read-only.** `packages/nextjs` holds no keys and
  signs nothing. It renders with no `.env` at all, and every upstream
  failure (API down, RPC or mirror node unreachable) degrades to a message
  on the page, never a non-200 route. Keep it that way.
- **A journal entry is a claim, not proof.** The HCS topic has no submit
  key, so `packages/nextjs/lib/chain.ts`'s `verifyEntry` checks every entry
  against its settlement transaction: success status, a `PaymentSettled`
  log from the trusted Escrow, same merchant, nonce and amount. Don't
  weaken that check or show an unverified entry as paid.
- **`Escrow.sol` is a copy, and must stay byte-identical to upstream.**
  `packages/foundry/contracts/Escrow.sol` is ferry402's
  `packages/contracts/src/Escrow.sol`. Its nonce derivation
  (`keccak256(abi.encode(merchantEvm, paymentId))`) must match the one in
  `@ferry402/sdk`'s `computeNonce` byte for byte, and
  `test/NonceGoldenVectors.t.sol` pins both to the same literal vectors.
  Never edit the contract or those vectors here; change them upstream in
  ferry402, where the SDK side is tested against the same values, then copy
  them across.
- **`ferry402()` only verifies.** It never calls `/settle`. Any logic that
  actually collects a payment and writes the HCS journal belongs in the
  route handler, after `next()` -- that's `src/settle.ts`'s job
  (`settleAndJournal`). Don't move settlement logic into the middleware
  config.
- **Always call `release()` on a settlement-failure path.** `ferry402()`
  consumes the (payer, nonce) pair before your handler runs; if your
  handler's own `/settle` call then fails for any reason, call
  `release()` from `res.locals.x402` before responding, or that payer is
  locked out of retrying for the rest of the derivation window. See
  `src/settle.ts` for the two places this already happens
  (`settlement_failed`, `no_settlement_log`) -- any new failure branch you
  add needs the same treatment.
- **Keep settlements sequential.** Never fire two `/settle` calls
  concurrently against the same facilitator, and never run two payer
  scripts (`npm run pay`) against the same resource at the same time.
- **Never commit a secret.** `.env` is gitignored. Don't print a private key
  to logs, commit messages, or this file. If you add a new required
  credential, document it in both `packages/api/.env.example` (with a
  comment on how to get it) and `README.md`'s environment variable table -- never hardcode a
  real key anywhere in source.
- **Don't invent addresses, hashes, or block numbers.** Every address and
  transaction this template references is real and verified (see
  `README.md`'s "What's already deployed" and ferry402's
  `docs/deployments.md`). If you add a new claim about on-chain state,
  verify it against a live node or the mirror node first.
- **The same URL can't be paid twice within ~5 minutes by the same payer.**
  The payment nonce derives from `merchantEvm | resource | time bucket`
  with no random component. If you add a new paid route meant to be called
  repeatedly with no natural per-call parameter, vary the resource (a query
  string, as `scripts/pay.ts` does) rather than treating a same-bucket
  replay rejection as a bug.

## A payer loop for an agent

If you (an agent) need to pay one of this template's routes programmatically
-- e.g. consuming it as a paid API dependency rather than running
`npm run pay` interactively -- the loop is:

```ts
import { createPaymentHeader } from '@ferry402/sdk'
import { privateKeyToAccount } from 'viem/accounts'

const account = privateKeyToAccount(process.env.PAYER_PRIVATE_KEY as `0x${string}`)
const baseUrl = 'http://localhost:3001' // packages/api; the dashboard is on 3000

async function payOnce(path: string): Promise<unknown> {
  // 1. Unpaid request -> 402 challenge. Append a cache-busting query string
  //    if you expect to call the SAME path again within ~5 minutes.
  const challengeRes = await fetch(`${baseUrl}${path}`)
  if (challengeRes.status !== 402) {
    throw new Error(`expected 402, got ${challengeRes.status}`)
  }
  const { accepts } = await challengeRes.json()
  const requirement = accepts[0] // one entry per accepted chain; this template only lists base-sepolia

  // 2. Sign the EIP-3009 authorization. Values below match this template's
  //    deployment (Base Sepolia, Circle USDC) -- see README.md.
  const header = await createPaymentHeader(requirement, account, {
    tokenName: 'USDC',
    tokenVersion: '2',
    chainId: 84532,
  })

  // 3. Retry with X-PAYMENT. Verify + settle + journal happen server-side,
  //    in this one round trip.
  const paidRes = await fetch(`${baseUrl}${path}`, { headers: { 'X-PAYMENT': header } })
  if (!paidRes.ok) {
    throw new Error(`payment failed: HTTP ${paidRes.status}`)
  }
  return paidRes.json()
}
```

Rules for an agent running this loop:

- **Never call `payOnce` concurrently** for the same path (or in a
  `Promise.all`) -- settlements must stay sequential per facilitator, and
  concurrent requests for the identical un-cache-busted path within one
  time bucket will race over the same derived nonce.
- **Never hardcode or print `PAYER_PRIVATE_KEY`.** Read it from the
  environment only; if you're asked to pay from a specific account, ask the
  user to set it in `packages/api/.env` rather than taking a key as a
  literal argument.
- **A 402 with `error: "invalid_payment"` on retry of the exact same path
  usually just means the 5-minute window reused a nonce** -- not a bug to
  chase. Vary the path (query string) and retry.
- **Treat a real payment as spending real testnet funds.** Don't loop
  `payOnce` more times than the task actually needs.
