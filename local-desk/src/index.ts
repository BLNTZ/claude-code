// Local desk: hybrid RAG + a paper-traded market-making desk. No hosted LLM,
// no external market API - everything here runs against local data.

export { RagPipeline, packContext, type Document, type Retrieved } from './rag/pipeline.js'
export { HashingEmbedder, OllamaEmbedder, type Embedder } from './rag/embed.js'
export { chunk, type Chunk } from './rag/chunk.js'

export { Desk } from './market/desk.js'
export { ReplayFeed, parseTicks, type Feed } from './market/feed.js'
export { RiskManager, DEFAULT_LIMITS, type RiskLimits } from './market/risk.js'
export { Quoter, DEFAULT_QUOTER } from './market/quoter.js'
export {
	AvellanedaStoikovQuoter,
	WindowEstimator,
	reservationPrice,
	optimalHalfSpread,
	DEFAULT_AS_CONFIG,
	type AvellanedaStoikovConfig,
} from './market/avellanedaStoikov.js'
export { PaperBroker, DEFAULT_PAPER_CONFIG } from './market/broker.js'
export type { Tick, Order, Fill, Position, Quote, Side } from './market/types.js'

export { Bus } from './core/bus.js'
