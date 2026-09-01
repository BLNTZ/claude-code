import { Bm25Index, type Scored, fuse } from './bm25.js'
import { type ChunkOptions, chunk } from './chunk.js'
import { type Embedder, HashingEmbedder, cosine } from './embed.js'
import { type StoredChunk, VectorStore } from './store.js'

export type Document = {
	id: string
	text: string
	metadata?: Record<string, string>
}

export type Retrieved = {
	chunk: StoredChunk
	score: number
	/** Which retrievers surfaced this chunk, for debugging recall problems. */
	sources: Array<'dense' | 'lexical'>
}

export type QueryOptions = {
	limit?: number
	/** Candidates pulled from each retriever before fusion. */
	candidates?: number
	/**
	 * Diversity knob for maximal marginal relevance, 0..1. At 1 results are
	 * ranked purely by relevance; lower values trade relevance for coverage,
	 * which is what stops five near-identical chunks filling the context.
	 */
	relevance?: number
	filter?: (chunk: StoredChunk) => boolean
}

/**
 * Hybrid retrieval pipeline: dense vectors and BM25 in parallel, fused by
 * reciprocal rank, then diversified with MMR.
 *
 * Each stage covers a different failure of the one before it. Dense alone
 * misses literal identifiers; lexical alone misses paraphrase; fused results
 * still cluster around near-duplicate chunks until MMR spreads them out.
 */
export class RagPipeline {
	private readonly store: VectorStore
	private readonly lexical = new Bm25Index()

	constructor(
		private readonly embedder: Embedder = new HashingEmbedder(),
		private readonly chunkOptions: ChunkOptions = {},
	) {
		this.store = new VectorStore(embedder.name, embedder.dimensions)
	}

	get size(): number {
		return this.store.size
	}

	async addDocuments(documents: Document[]): Promise<number> {
		const pending: Array<Omit<StoredChunk, 'vector'>> = []

		for (const document of documents) {
			this.remove(document.id)
			for (const piece of chunk(document.id, document.text, this.chunkOptions)) {
				pending.push({ ...piece, metadata: document.metadata ?? {} })
			}
		}

		if (pending.length === 0) return 0

		const vectors = await this.embedder.embed(pending.map((piece) => piece.text))
		pending.forEach((piece, index) => {
			this.store.add({ ...piece, vector: vectors[index] })
			this.lexical.add(piece.id, piece.text)
		})

		return pending.length
	}

	remove(docId: string): void {
		for (let index = 0; ; index++) {
			const id = `${docId}:${index}`
			if (!this.store.get(id)) break
			this.lexical.remove(id)
		}
		this.store.removeDocument(docId)
	}

	async query(text: string, options: QueryOptions = {}): Promise<Retrieved[]> {
		const limit = options.limit ?? 5
		const candidates = options.candidates ?? Math.max(limit * 4, 20)
		const relevance = options.relevance ?? 0.7

		const [queryVector] = await this.embedder.embed([text])
		const dense = this.store.search(queryVector, candidates, options.filter)
		const lexical = this.filterLexical(this.lexical.search(text, candidates), options.filter)

		const sources = new Map<string, Array<'dense' | 'lexical'>>()
		for (const entry of dense) sources.set(entry.id, ['dense'])
		for (const entry of lexical)
			sources.set(entry.id, [...(sources.get(entry.id) ?? []), 'lexical'])

		const fused = fuse([dense, lexical])
		return this.diversify(fused, limit, relevance).map((entry) => ({
			// Every fused id came from a retriever that read it out of the store.
			chunk: this.store.get(entry.id)!,
			score: entry.score,
			sources: sources.get(entry.id) ?? [],
		}))
	}

	/**
	 * Maximal marginal relevance: repeatedly take the candidate with the best
	 * blend of fused rank and distance from what has already been selected.
	 */
	private diversify(candidates: Scored[], limit: number, relevance: number): Scored[] {
		const pool = [...candidates]
		const selected: Scored[] = []

		while (selected.length < limit && pool.length > 0) {
			let bestIndex = 0
			let bestScore = Number.NEGATIVE_INFINITY

			pool.forEach((candidate, index) => {
				const vector = this.store.get(candidate.id)?.vector
				if (!vector) return

				let redundancy = 0
				for (const chosen of selected) {
					const other = this.store.get(chosen.id)?.vector
					if (other) redundancy = Math.max(redundancy, cosine(vector, other))
				}

				const score = relevance * candidate.score - (1 - relevance) * redundancy * candidate.score
				if (score > bestScore) {
					bestScore = score
					bestIndex = index
				}
			})

			selected.push(pool.splice(bestIndex, 1)[0])
		}

		return selected
	}

	private filterLexical(results: Scored[], filter?: (chunk: StoredChunk) => boolean): Scored[] {
		if (!filter) return results
		return results.filter((entry) => {
			const stored = this.store.get(entry.id)
			return stored ? filter(stored) : false
		})
	}
}

/**
 * Packs retrieved chunks into a character budget, cited by document and offset
 * so an answer built on them can be traced back to its source.
 */
export function packContext(results: Retrieved[], budget = 6000): string {
	const blocks: string[] = []
	let used = 0

	for (const result of results) {
		const block = `[${result.chunk.docId}@${result.chunk.offset}]\n${result.chunk.text}`
		if (used + block.length > budget) break
		blocks.push(block)
		used += block.length + 2
	}

	return blocks.join('\n\n')
}
