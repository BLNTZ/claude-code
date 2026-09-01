import { tokenize } from './tokenize.js'

export type Embedder = {
	readonly name: string
	readonly dimensions: number
	embed(texts: string[]): Promise<Float32Array[]>
}

/**
 * Fully offline embedder: hashed bag of tokens plus character trigrams,
 * projected into a fixed-width vector and L2-normalized.
 *
 * This is a lexical signal in dense clothing - it captures term overlap and
 * survives typos through the trigrams, but it has no semantic understanding,
 * so "car" and "automobile" stay far apart. It exists so the pipeline runs
 * with zero dependencies and zero network; use OllamaEmbedder against a local
 * model when you want real semantic recall.
 */
export class HashingEmbedder implements Embedder {
	readonly name = 'hashing'

	constructor(readonly dimensions = 512) {
		if (dimensions <= 0) throw new Error('dimensions must be positive')
	}

	async embed(texts: string[]): Promise<Float32Array[]> {
		return texts.map((text) => this.embedOne(text))
	}

	private embedOne(text: string): Float32Array {
		const vector = new Float32Array(this.dimensions)

		for (const token of tokenize(text)) {
			this.add(vector, token, 1)
			for (const gram of trigrams(token)) this.add(vector, gram, 0.35)
		}

		return normalize(vector)
	}

	private add(vector: Float32Array, term: string, weight: number): void {
		const index = fnv1a(term) % this.dimensions
		// The low bit of an independent hash decides the sign, which keeps
		// unrelated collisions cancelling out instead of compounding.
		const sign = (fnv1a(` ${term}`) & 1) === 0 ? 1 : -1
		vector[index] += weight * sign
	}
}

/** Embeds via a locally running Ollama instance. No hosted API is contacted. */
export class OllamaEmbedder implements Embedder {
	readonly name: string

	constructor(
		private readonly model = 'nomic-embed-text',
		readonly dimensions = 768,
		private readonly host = 'http://127.0.0.1:11434',
	) {
		this.name = `ollama:${model}`
		const hostname = new URL(host).hostname
		if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
			throw new Error(`OllamaEmbedder host must be local, got ${hostname}`)
		}
	}

	async embed(texts: string[]): Promise<Float32Array[]> {
		const vectors: Float32Array[] = []
		for (const text of texts) {
			const response = await fetch(`${this.host}/api/embeddings`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ model: this.model, prompt: text }),
			})
			if (!response.ok) {
				throw new Error(`ollama embeddings failed: ${response.status} ${response.statusText}`)
			}
			const body = (await response.json()) as { embedding?: number[] }
			if (!body.embedding) throw new Error('ollama returned no embedding')
			vectors.push(normalize(Float32Array.from(body.embedding)))
		}
		return vectors
	}
}

/** Cosine similarity of two already-normalized vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
	if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`)
	let dot = 0
	for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
	return dot
}

function normalize(vector: Float32Array): Float32Array {
	let sum = 0
	for (const value of vector) sum += value * value
	const magnitude = Math.sqrt(sum)
	if (magnitude === 0) return vector
	for (let i = 0; i < vector.length; i++) vector[i] /= magnitude
	return vector
}

function* trigrams(token: string): Generator<string> {
	const padded = `<${token}>`
	for (let i = 0; i + 3 <= padded.length; i++) yield padded.slice(i, i + 3)
}

function fnv1a(text: string): number {
	let hash = 0x811c9dc5
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return hash
}
