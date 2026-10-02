# scaffold-hbar-ferry402

A starter for a Hedera developer who wants **a paid HTTP API**: routes that
charge per call in USDC on Base, settle into a non-custodial escrow, and
journal every payment to Hedera Consensus Service (HCS) for reconciliation.

Built on [`@ferry402/sdk`](https://www.npmjs.com/package/@ferry402/sdk) and
[`@ferry402/facilitator`](https://github.com/mdmudassir0143/ferry402/tree/main/packages/facilitator),
both from [ferry402](https://github.com/mdmudassir0143/ferry402) -- an x402
implementation that settles across chains: your API can be paid in USDC on
Base while the clearing record lives on Hedera.

This README assumes you've never seen ferry402 before. If you get stuck,
every claim here links to the real code or a real transaction you can check
yourself.

## What this template gives you

- **A paid route** (`GET /api/quote`): an unpaid request gets back an HTTP
  `402 Payment Required` with a machine-readable bill (which chain, which
  token, how much, where to send it). A request carrying a valid payment
  header gets served.
- **A self-hosted facilitator**: the service that verifies a payer's signed
  authorization and submits the actual settlement transaction, so your
  merchant backend never holds a private key that moves customer funds.
- **A Hedera journal**: every settled payment is written to an HCS topic --
  an ordered, independently queryable record you (or anyone) can reconcile
  against the real on-chain escrow balance.
- **A payer script** (`npm run pay`) that proves the whole thing end to end:
  it signs a real payment and pays your own route for real USDC on testnet.

Nothing here is a simulation. `npm run dev` talks to real Base Sepolia and
Hedera testnet infrastructure from the first request.

## What's already deployed

This template does not deploy anything -- it points at an already-deployed,
non-custodial `Escrow` contract and an already-created HCS topic, both live
on testnet:

| What | Value |
|---|---|
| Escrow (Base Sepolia) | [`0x99Cd564B21fa7fD8553Cf31F32E448C17BBcC429`](https://sepolia.basescan.org/address/0x99Cd564B21fa7fD8553Cf31F32E448C17BBcC429) |
| USDC (Base Sepolia) | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |
| Example merchant EVM address | [`0x86eEa3B06E6994eaF8Ce3Fcfde6A2F8Fb2Ba947b`](https://sepolia.basescan.org/address/0x86eEa3B06E6994eaF8Ce3Fcfde6A2F8Fb2Ba947b) |
| Example Hedera account | `0.0.9823488` |
| HCS journal topic | [`0.0.10719807`](https://hashscan.io/testnet/topic/0.0.10719807) |
| Example settlement tx | [`0xc700a2c466d5666c9af0a624075a167d016a9ef88f65f602b60081e5669e499a`](https://sepolia.basescan.org/tx/0xc700a2c466d5666c9af0a624075a167d016a9ef88f65f602b60081e5669e499a) (block 47558459) |

The `Escrow` contract is merchant-agnostic -- any EVM address can be credited
through it, so you don't need to deploy your own to try this. The HCS
topic's `submit_key` is `null`, meaning there's no gate on who can write to
it, which is exactly what makes a zero-setup quickstart possible. See
[ferry402's `docs/deployments.md`](https://github.com/mdmudassir0143/ferry402/blob/main/docs/deployments.md)
for the full, independently-verifiable transaction history (every tx hash,
block, gas figure) behind these numbers -- nothing above is invented or
rounded.

When you're past the quickstart, deploy your own `Escrow` and create your
own topic (both covered in that same doc's "Deploy your own" section) so
your merchant has exclusive control over its own allowlist and journal.

## Prerequisites

- Node.js **>= 20.18.3**
- npm (this is a plain npm project -- no pnpm, no workspaces)
- A little Base Sepolia testnet ETH (for the facilitator's gas) and testnet
  USDC (for the payer script) -- both free, see below
- A free Hedera testnet account (also free, see below)

## Environment variables

```bash
cp .env.example .env
```

Then fill in the blanks. `.env` is gitignored -- never commit it.

| Variable | Required for | How to get it |
|---|---|---|
| `FACILITATOR_PRIVATE_KEY` | `npm run dev` | Generate a fresh EVM key (e.g. `cast wallet new`, or any wallet's "create account"). Fund it with Base Sepolia ETH from the [Alchemy faucet](https://www.alchemy.com/faucets/base-sepolia). This wallet pays gas on every settlement -- that's what makes paying gasless for your customers. |
| `PAYER_PRIVATE_KEY` | `npm run pay` only | Generate another fresh EVM key. Fund it with Base Sepolia testnet USDC from [Circle's faucet](https://faucet.circle.com) (select Base Sepolia). Not needed to run the server itself. |
| `HEDERA_ACCOUNT_ID` | `npm run dev` | Create a free testnet account at the [Hedera portal](https://portal.hedera.com) -- it auto-funds with testnet HBAR. |
| `HEDERA_PRIVATE_KEY` | `npm run dev` | From the same portal signup. It's typically ECDSA, DER-encoded (starts `3030020100300706...`) -- this template loads it correctly with `PrivateKey.fromStringDer()`. (Loading a DER key as ED25519 silently derives the *wrong* key and every HCS submission fails with `INVALID_SIGNATURE` -- a known footgun, already handled here.) |
| `FERRY402_SECRET` | `npm run dev` | An HMAC key, not a wallet -- it's what lets the server derive and check payment challenges with zero storage. Generate with `openssl rand -hex 32`. Must stay identical across every process serving this merchant. |

Everything else in `.env.example` (`BASE_SEPOLIA_RPC_URL`,
`ESCROW_ADDRESS_BASE_SEPOLIA`, `USDC_ADDRESS_BASE_SEPOLIA`,
`MERCHANT_EVM_ADDRESS`, `HCS_TOPIC_ID`, `PORT`, `FACILITATOR_PORT`) is
already filled in with working defaults -- the deployed infrastructure
above. They aren't secrets; override them only once you deploy your own
escrow and topic.

## Run it

```bash
npm install
npm run dev
```

This one command starts **both** the merchant API and the facilitator, in
one process, listening on `http://localhost:3000` and
`http://localhost:4000`. You should see:

```
[facilitator] listening on http://127.0.0.1:4000

scaffold-hbar-ferry402 -- paid API listening on http://localhost:3000

  curl -s http://localhost:3000/api/quote

Expect HTTP 402 with an `accepts` array -- that is the bill.
Run `npm run pay` in another terminal to pay it for real.
```

In another terminal, confirm the bill:

```bash
curl -s http://localhost:3000/api/quote
```

You get back HTTP **402** with a body shaped like:

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",
      "resource": "http://localhost:3000/api/quote",
      "payTo": "0x99Cd564B21fa7fD8553Cf31F32E448C17BBcC429",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "settleTo": "hedera",
        "merchant": "0.0.9823488",
        "merchantEvm": "0x86eEa3B06E6994eaF8Ce3Fcfde6A2F8Fb2Ba947b",
        "paymentId": "0x..."
      }
    }
  ]
}
```

No wallet, no funded account, and no blockchain call were needed to produce
that -- issuing a 402 is pure computation (an HMAC over
`merchantEvm | resource | 5-minute time bucket`), so it costs nothing and
scales to any number of anonymous requests.

## Make a real payment

With `npm run dev` still running in one terminal:

```bash
npm run pay
```

This script (`scripts/pay.ts`) plays the payer:

1. GETs `/api/quote` with no payment, reads the 402's `accepts` array.
2. Signs an EIP-3009 `ReceiveWithAuthorization` over the bill using
   `createPaymentHeader()` from `@ferry402/sdk` -- the only client that can
   pay a ferry402 route (see "Honest limitations" below for why a stock
   x402 client can't).
3. Retries the same URL with an `X-PAYMENT` header. In that one HTTP round
   trip, your server verifies the signature, settles the payment into the
   `Escrow` contract on Base Sepolia, and journals it to Hedera -- then
   serves the resource.

On success you'll see the real settlement transaction hash and the HCS
journal sequence number, e.g.:

```
PAID. HTTP 200
  settled:      10000 atomic USDC (gas used: 107700)
  tx:           0x...
  basescan:     https://sepolia.basescan.org/tx/0x...
  HCS journal:  topic 0.0.10719807, sequence #9
  hashscan:     https://hashscan.io/testnet/topic/0.0.10719807
```

Open the `basescan` link to see the real settlement on Base Sepolia, and the
`hashscan` link to see your merchant's full journal on Hedera. For a sense
of what a settled run looks like against this exact deployment, see the
[example settlement transaction](https://sepolia.basescan.org/tx/0xc700a2c466d5666c9af0a624075a167d016a9ef88f65f602b60081e5669e499a)
and [the live topic](https://hashscan.io/testnet/topic/0.0.10719807) linked
above.

## How a payment moves through the system

```
payer                    merchant (src/server.ts)         facilitator (src/facilitator.ts)
  |-- GET /api/quote -------->|                                    |
  |<-- 402 + accepts ---------|   (ferry402(), pure computation)   |
  |                           |                                    |
  |-- sign EIP-3009 auth -----|                                    |
  |                           |                                    |
  |-- GET w/ X-PAYMENT ------>|-- POST /verify ------------------->|
  |                           |<-- verified -----------------------|
  |                           |  (src/settle.ts, after next())     |
  |                           |-- POST /settle -------------------->|
  |                           |                           (submits tx to Escrow,
  |                           |                            Base Sepolia)
  |                           |<-- settlement result ---------------|
  |                           |-- write HCS journal entry ------------------> Hedera
  |<-- 200 + resource --------|                                    |
```

If `/settle` fails for any reason, `src/settle.ts` calls `release()` on
`res.locals.x402` -- this frees the (payer, nonce) pair `ferry402()` already
consumed before handing off, so a payer whose settlement failed isn't locked
out of retrying for the rest of the derivation window over a payment that
never completed.

## Honest limitations

- **Base and Base Sepolia only.** The SDK's types allow Polygon too, but
  `@ferry402/facilitator` only serves Base networks today -- advertising
  Polygon produces a 402 no payment can satisfy.
- **Testnet, unaudited.** Nothing here has been audited, and nothing in this
  template is intended for mainnet funds. See
  [ferry402's `SECURITY.md`](https://github.com/mdmudassir0143/ferry402/blob/main/SECURITY.md).
- **The same payer cannot buy the identical URL twice within ~5 minutes.**
  The payment nonce derives deterministically from
  `merchantEvm | resource | 5-minute time bucket`, with no random or
  per-purchase component -- an identical repeat request in the same window
  produces an identical nonce and is rejected as a replay
  (`invalid_payment`). `scripts/pay.ts` works around this for repeat demo
  runs by appending a cache-busting query string; a route your clients call
  repeatedly with no parameters of its own needs the same trick (or a
  varying query/path per call).
- **The HCS journal is an index, not proof on its own.** This topic's
  `submit_key` is `null`, so anyone with a Hedera account could submit a
  message shaped like a real journal entry. Treat journal entries as a
  pointer to verify against Base Sepolia (by `txHash`), never as standalone
  evidence of payment -- see ferry402's `docs/deployments.md` for the full
  reconciliation method.
- **Replay protection is per-process.** The default `ConsumedNonceStore` is
  in-memory and resets on restart; a multi-instance deployment needs a
  shared store (Redis, a database) passed to `ferry402(config, {
  consumedNonceStore })`.
- **Keep settlements sequential.** Don't fire concurrent `/settle` calls
  against the same facilitator for the same payer; `scripts/pay.ts` makes
  one payment at a time by design.

## Learn more

- [ferry402 (root repo)](https://github.com/mdmudassir0143/ferry402) -- the
  full system this template is built on.
- [`@ferry402/sdk` README](https://github.com/mdmudassir0143/ferry402/tree/main/packages/sdk#readme) -- the merchant/payer-side API this template's `src/server.ts` and `scripts/pay.ts` use.
- [`@ferry402/facilitator` README](https://github.com/mdmudassir0143/ferry402/tree/main/packages/facilitator#readme) -- the `/verify` + `/settle` service this template's `src/facilitator.ts` wraps.
- [Architecture](https://github.com/mdmudassir0143/ferry402/blob/main/docs/architecture.md) -- how a payment moves, and the trust model.
- [Deployments](https://github.com/mdmudassir0143/ferry402/blob/main/docs/deployments.md) -- every verified transaction behind the addresses in this README.
- [Troubleshooting](https://github.com/mdmudassir0143/ferry402/blob/main/docs/troubleshooting.md) -- real failure modes and fixes.

## License

MIT -- see [LICENSE](./LICENSE).
