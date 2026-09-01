import { tokenize } from './tokenize.js'

export type Scored = { id: string; score: number }

/**
 * Okapi BM25 over an in-memory inverted index.
 *
 * Lexical retrieval is what catches the things dense vectors miss: exact
 * tickers, error codes, function names, anything where the literal string is
 * the point.
 */
export class Bm25Index {
	private readonly postings = new Map<string, Map<string, number>>()
	private readonly lengths = new Map<string, number>()
	private totalLength = 0

	constructor(
		private readonly k1 = 1.2,
		private readonly b = 0.75,
	) {}

	get size(): number {
		return this.lengths.size
	}

	add(id: string, text: string): void {
		if (this.lengths.has(id)) this.remove(id)

		const tokens = tokenize(text)
		for (const token of tokens) {
			let posting = this.postings.get(token)
			if (!posting) {
				posting = new Map()
				this.postings.set(token, posting)
			}
			posting.set(id, (posting.get(id) ?? 0) + 1)
		}

		this.lengths.set(id, tokens.length)
		this.totalLength += tokens.length
	}

	remove(id: string): void {
		const length = this.lengths.get(id)
		if (length === undefined) return

		for (const [token, posting] of this.postings) {
			if (posting.delete(id) && posting.size === 0) this.postings.delete(token)
		}
		this.lengths.delete(id)
		this.totalLength -= length
	}

	search(query: string, limit = 10): Scored[] {
		if (this.lengths.size === 0) return []

		const averageLength = this.totalLength / this.lengths.size
		const scores = new Map<string, number>()

		for (const token of new Set(tokenize(query))) {
			const posting = this.postings.get(token)
			if (!posting) continue

			const idf = Math.log(1 + (this.lengths.size - posting.size + 0.5) / (posting.size + 0.5))

			for (const [id, frequency] of posting) {
				const length = this.lengths.get(id) ?? 0
				const norm = 1 - this.b + (this.b * length) / (averageLength || 1)
				const weight = (frequency * (this.k1 + 1)) / (frequency + this.k1 * norm)
				scores.set(id, (scores.get(id) ?? 0) + idf * weight)
			}
		}

		return rank(scores, limit)
	}
}

export function rank(scores: Map<string, number>, limit: number): Scored[] {
	return [...scores]
		.map(([id, score]) => ({ id, score }))
		.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
		.slice(0, limit)
}

/**
 * Reciprocal Rank Fusion.
 *
 * Merges ranked lists by position rather than by score, so a dense list scored
 * in cosine units and a lexical list scored in BM25 units can be combined
 * without inventing a normalization that would silently favour one of them.
 */
export function fuse(lists: Scored[][], k = 60, weights?: number[]): Scored[] {
	const scores = new Map<string, number>()

	lists.forEach((list, listIndex) => {
		const weight = weights?.[listIndex] ?? 1
		list.forEach((entry, position) => {
			scores.set(entry.id, (scores.get(entry.id) ?? 0) + weight / (k + position + 1))
		})
	})

	return rank(scores, scores.size)
}
