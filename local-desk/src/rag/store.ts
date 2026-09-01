import { type Scored, rank } from './bm25.js'
import type { Chunk } from './chunk.js'
import { cosine } from './embed.js'

export type StoredChunk = Chunk & {
	vector: Float32Array
	metadata: Record<string, string>
}

export type Serialized = {
	version: 1
	embedder: string
	dimensions: number
	chunks: Array<Omit<StoredChunk, 'vector'> & { vector: number[] }>
}

/**
 * Flat in-memory vector store with exact cosine search.
 *
 * Exact search is O(n) per query, which is the right trade below roughly a
 * hundred thousand chunks: no index to build, no recall lost to approximation.
 * Past that, this is the seam to swap in an ANN index.
 */
export class VectorStore {
	private chunks = new Map<string, StoredChunk>()

	constructor(
		readonly embedderName: string,
		readonly dimensions: number,
	) {}

	get size(): number {
		return this.chunks.size
	}

	add(chunk: StoredChunk): void {
		if (chunk.vector.length !== this.dimensions) {
			throw new Error(
				`vector has ${chunk.vector.length} dimensions, store expects ${this.dimensions}`,
			)
		}
		this.chunks.set(chunk.id, chunk)
	}

	get(id: string): StoredChunk | undefined {
		return this.chunks.get(id)
	}

	/** Drops every chunk belonging to a document. Returns how many were removed. */
	removeDocument(docId: string): number {
		let removed = 0
		for (const [id, chunk] of this.chunks) {
			if (chunk.docId === docId && this.chunks.delete(id)) removed++
		}
		return removed
	}

	search(query: Float32Array, limit = 10, filter?: (chunk: StoredChunk) => boolean): Scored[] {
		const scores = new Map<string, number>()
		for (const chunk of this.chunks.values()) {
			if (filter && !filter(chunk)) continue
			scores.set(chunk.id, cosine(query, chunk.vector))
		}
		return rank(scores, limit)
	}

	toJSON(): Serialized {
		return {
			version: 1,
			embedder: this.embedderName,
			dimensions: this.dimensions,
			chunks: [...this.chunks.values()].map((chunk) => ({
				...chunk,
				vector: [...chunk.vector],
			})),
		}
	}

	/**
	 * Rebuilds a store from `toJSON` output. The embedder name is part of the
	 * payload because vectors from two different embedders are not comparable -
	 * loading them into one store would return confident nonsense.
	 */
	static fromJSON(data: Serialized): VectorStore {
		if (data.version !== 1) throw new Error(`unsupported store version ${data.version}`)
		const store = new VectorStore(data.embedder, data.dimensions)
		for (const chunk of data.chunks) {
			store.add({ ...chunk, vector: Float32Array.from(chunk.vector) })
		}
		return store
	}
}
