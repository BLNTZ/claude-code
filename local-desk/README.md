# local-desk

A fully local, offline-first hybrid RAG pipeline and a paper-traded
market-making desk. No hosted LLM API, no live exchange connection, no
external network calls by default.

## Why this exists

This was built after two rounds of AI-hype marketing copy (a "mining" token
site and a "300-bot Grok Bot swarm" trading guide) asked for the underlying
system to be "reverse engineered." Neither post had real technical content
behind it - no repo, no code, no verifiable mechanism. What *was* real and
worth using: the public, decades-old **Avellaneda-Stoikov** market-making
model the trading post name-dropped, and standard hybrid-retrieval RAG
practice. Both are implemented here properly, locally, and with tests -
without the swarm-of-bots framing, the live-capital instructions, or the
unverifiable numbers.

## `src/rag/`

Hybrid retrieval: BM25 (lexical) + a hashing embedder (dense, fully
offline) fused with Reciprocal Rank Fusion, then diversified with maximal
marginal relevance so results aren't five near-duplicate chunks.

- `chunk.ts` - paragraph/sentence-aware overlapping chunker
- `tokenize.ts` - shared tokenizer for BM25 and the hashing embedder
- `embed.ts` - `HashingEmbedder` (zero deps, zero network) and
  `OllamaEmbedder` (talks to a **local** Ollama instance only - the host is
  validated to be 127.0.0.1/localhost)
- `bm25.ts` - Okapi BM25 index plus Reciprocal Rank Fusion
- `store.ts` - flat in-memory vector store, JSON-serializable
- `pipeline.ts` - wires it together: `RagPipeline.query()` and
  `packContext()` for building a citation-tagged context budget

## `src/market/`

A small paper-trading desk: five roles coordinated over a typed event bus
instead of a "300 bot swarm" - a price/liquidity watcher, a quoter, risk,
and a broker.

- `types.ts` - `Tick`, `Order`, `Fill`, `Position`, `Quote`
- `feed.ts` - `ReplayFeed` (the only feed shipped - backtest before live)
  and a strict CSV tick parser that rejects crossed/malformed rows
- `risk.ts` - `RiskManager`: pre-trade gate (size, price sanity, staleness,
  spread, position limits) plus a fail-closed drawdown kill switch that
  only a human can reset
- `quoter.ts` - simple linear inventory-skew quoter
- `avellanedaStoikov.ts` - the real Avellaneda & Stoikov (2008) model:
  reservation price, optimal half-spread, and an online volatility/arrival
  rate estimator from the tick stream
- `broker.ts` - `PaperBroker`: simulated maker fills against replayed
  ticks, fees/rebates, weighted-average position tracking
- `desk.ts` - `Desk`: coordinates feed -> liquidity check -> quote -> risk
  gate -> broker, emitting every step on `desk.bus` for observability

## What this deliberately does not do

No live exchange/broker integration ships here. No API keys, no order
routing to a real venue. `ReplayFeed` and `PaperBroker` are the only feed
and broker implementations - wiring in a real venue is a deliberate,
separate step outside this module's scope.

## Tests

```
bunx vitest run tests/local-desk
```
