import { fetchBill, type BillResult } from '~/lib/bill'
import { escrowBalance, verifyEntry, type Verdict } from '~/lib/chain'
import { config, formatUsdc } from '~/lib/config'
import { fetchJournal, type TopicMessage } from '~/lib/journal'

// Every number on this page is live chain or mirror-node state.
export const dynamic = 'force-dynamic'

const verdictLabel: Record<Verdict, string> = {
  verified: 'verified on-chain',
  mismatch: 'no matching settlement',
  reverted: 'tx reverted',
  'not-found': 'tx not found',
  unreachable: 'RPC unreachable',
}

function short(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function Bill({ bill }: { bill: BillResult }) {
  if (bill.kind === 'unreachable') {
    return (
      <p>
        The API isn&apos;t running at <code>{config.apiUrl}</code>. Start it from the repo root with{' '}
        <code>npm run dev</code>, then reload.
      </p>
    )
  }
  if (bill.kind === 'unexpected') {
    return (
      <p>
        <code>GET /api/quote</code> answered HTTP {bill.status}, not 402. Check the API&apos;s terminal for errors.
      </p>
    )
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Network</th>
          <th>Price</th>
          <th>Pay to (Escrow)</th>
          <th>Asset</th>
        </tr>
      </thead>
      <tbody>
        {bill.accepts.map((r) => (
          <tr key={r.network}>
            <td>{r.network}</td>
            <td>{formatUsdc(r.maxAmountRequired)} USDC</td>
            <td className="mono">{short(r.payTo)}</td>
            <td className="mono">{short(r.asset)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

async function Balance() {
  try {
    const balance = await escrowBalance()
    return <p className="figure">{formatUsdc(balance)} USDC</p>
  } catch {
    return <p className="unreachable">Couldn&apos;t reach Base Sepolia at {config.rpcUrl}.</p>
  }
}

async function Journal() {
  let messages: TopicMessage[]
  try {
    messages = await fetchJournal()
  } catch (err) {
    return <p className="unreachable">Couldn&apos;t read the topic: {err instanceof Error ? err.message : 'unknown error'}.</p>
  }
  if (messages.length === 0) {
    return (
      <p className="muted">
        No payments journaled for this merchant yet. Run <code>npm run pay</code> to make one.
      </p>
    )
  }
  const verdicts = await Promise.all(messages.map((m) => verifyEntry(m.entry)))
  return (
    <table>
      <thead>
        <tr>
          <th>Seq</th>
          <th>Amount</th>
          <th>Payer</th>
          <th>Settlement tx</th>
          <th>Chain check</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((m, i) => (
          <tr key={m.sequenceNumber}>
            <td>
              <a href={`https://hashscan.io/testnet/topic/${config.topicId}/message/${m.sequenceNumber}`}>#{m.sequenceNumber}</a>
            </td>
            <td>{formatUsdc(m.entry.amount)} USDC</td>
            <td className="mono">{short(m.entry.payer)}</td>
            <td className="mono">
              <a href={`https://sepolia.basescan.org/tx/${m.entry.txHash}`}>{short(m.entry.txHash)}</a>
            </td>
            <td className={verdicts[i]}>{verdictLabel[verdicts[i]]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function Home() {
  const bill = await fetchBill()
  return (
    <main>
      <h1>ferry402 merchant</h1>
      <p className="muted">
        A paid HTTP API: charged in USDC on Base Sepolia, settled into a non-custodial Escrow, journaled to Hedera
        Consensus Service.
      </p>

      <section className="card">
        <h2>The bill</h2>
        <p className="muted">
          What an unpaid <code>GET /api/quote</code> gets back: HTTP 402 and one entry per chain this merchant accepts.
        </p>
        <Bill bill={bill} />
      </section>

      <section className="card">
        <h2>Escrow ledger balance</h2>
        <p className="muted">
          <code>Escrow.balanceOf({short(config.merchantEvmAddress)})</code> on Base Sepolia: what this merchant can
          withdraw.
        </p>
        <Balance />
      </section>

      <section className="card">
        <h2>HCS journal, reconciled</h2>
        <p className="muted">
          The latest entries for this merchant on topic{' '}
          <a href={`https://hashscan.io/testnet/topic/${config.topicId}`}>{config.topicId}</a>. The topic is open to
          anyone, so an entry only counts once its tx is checked: it must have emitted a matching{' '}
          <code>PaymentSettled</code> from the Escrow.
        </p>
        <Journal />
      </section>
    </main>
  )
}
