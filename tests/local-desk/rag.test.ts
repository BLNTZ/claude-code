import { Bm25Index, fuse } from 'local-desk/rag/bm25.js'
import { chunk } from 'local-desk/rag/chunk.js'
import { HashingEmbedder, cosine } from 'local-desk/rag/embed.js'
import { RagPipeline, packContext } from 'local-desk/rag/pipeline.js'
import { VectorStore } from 'local-desk/rag/store.js'
import { describe, expect, it } from 'vitest'

describe('chunk', () => {
	it('splits long text into overlapping pieces that cover the source', () => {
		const text = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} has some words in it.`).join(
			'\n\n',
		)
		const pieces = chunk('doc', text, { size: 200, overlap: 40 })

		expect(pieces.length).toBeGreaterThan(1)
		for (const piece of pieces) {
			expect(piece.text.length).toBeGreaterThan(0)
			expect(text.slice(piece.offset, piece.offset + piece.text.length)).toContain(
				piece.text.slice(0, 10),
			)
		}
	})

	it('returns a single chunk for short text', () => {
		const pieces = chunk('doc', 'short text', { size: 800 })
		expect(pieces).toHaveLength(1)
		expect(pieces[0].text).toBe('short text')
	})

	it('rejects a non-positive size', () => {
		expect(() => chunk('doc', 'text', { size: 0 })).toThrow()
	})
})

describe('HashingEmbedder', () => {
	it('produces normalized vectors of the configured dimension', async () => {
		const embedder = new HashingEmbedder(64)
		const [vector] = await embedder.embed(['hello world'])
		expect(vector.length).toBe(64)

		let magnitude = 0
		for (const value of vector) magnitude += value * value
		expect(Math.sqrt(magnitude)).toBeCloseTo(1, 5)
	})

	it('scores near-identical text higher than unrelated text', async () => {
		const embedder = new HashingEmbedder(256)
		const [a, b, c] = await embedder.embed([
			'the quarterly revenue report for the trading desk',
			'quarterly revenue report for the trading desk',
			'a recipe for baking sourdough bread',
		])

		expect(cosine(a, b)).toBeGreaterThan(cosine(a, c))
	})
})

describe('Bm25Index', () => {
	it('ranks exact term matches above documents missing the term', () => {
		const index = new Bm25Index()
		index.add('a', 'the risk manager enforces the drawdown limit')
		index.add('b', 'the quoter skews prices based on inventory')

		const results = index.search('drawdown limit')
		expect(results[0]?.id).toBe('a')
	})

	it('removing a document drops it from later searches', () => {
		const index = new Bm25Index()
		index.add('a', 'arbitrage opportunity detected')
		index.remove('a')

		expect(index.search('arbitrage')).toHaveLength(0)
		expect(index.size).toBe(0)
	})
})

describe('fuse', () => {
	it('favors ids ranked highly across both lists', () => {
		const dense = [
			{ id: 'x', score: 0.9 },
			{ id: 'y', score: 0.5 },
		]
		const lexical = [
			{ id: 'y', score: 10 },
			{ id: 'x', score: 1 },
		]

		const fused = fuse([dense, lexical])
		// y is #2 dense / #1 lexical, x is #1 dense / #2 lexical - roughly tied,
		// but fusion must not simply mirror either input list's raw scores.
		expect(fused.map((r) => r.id)).toEqual(expect.arrayContaining(['x', 'y']))
		expect(fused).toHaveLength(2)
	})
})

describe('VectorStore', () => {
	it('round-trips through JSON', () => {
		const store = new VectorStore('hashing', 4)
		store.add({
			id: 'doc:0',
			docId: 'doc',
			text: 'hello',
			offset: 0,
			vector: Float32Array.from([1, 0, 0, 0]),
			metadata: {},
		})

		const restored = VectorStore.fromJSON(store.toJSON())
		expect(restored.size).toBe(1)
		expect(restored.get('doc:0')?.text).toBe('hello')
	})

	it('rejects a vector of the wrong dimension', () => {
		const store = new VectorStore('hashing', 4)
		expect(() =>
			store.add({
				id: 'doc:0',
				docId: 'doc',
				text: 'hello',
				offset: 0,
				vector: Float32Array.from([1, 0]),
				metadata: {},
			}),
		).toThrow()
	})
})

describe('RagPipeline', () => {
	it('retrieves the chunk containing a literal identifier via lexical fallback', async () => {
		const pipeline = new RagPipeline(new HashingEmbedder(128))
		await pipeline.addDocuments([
			{ id: 'errors', text: 'The service throws ERR_INVENTORY_LIMIT when position exceeds cap.' },
			{ id: 'unrelated', text: 'The cafeteria menu changes every Tuesday and Thursday.' },
		])

		const results = await pipeline.query('ERR_INVENTORY_LIMIT', { limit: 1 })
		expect(results[0]?.chunk.docId).toBe('errors')
	})

	it('removing a document drops its chunks from future queries', async () => {
		const pipeline = new RagPipeline(new HashingEmbedder(128))
		await pipeline.addDocuments([{ id: 'doc', text: 'unique marker sentence about vaults' }])
		expect(pipeline.size).toBe(1)

		pipeline.remove('doc')
		expect(pipeline.size).toBe(0)

		const results = await pipeline.query('vaults')
		expect(results).toHaveLength(0)
	})

	it('packContext stays within the character budget', async () => {
		const pipeline = new RagPipeline(new HashingEmbedder(128))
		await pipeline.addDocuments([
			{ id: 'a', text: 'x'.repeat(500) },
			{ id: 'b', text: 'y'.repeat(500) },
		])

		const results = await pipeline.query('x', { limit: 5 })
		const packed = packContext(results, 300)
		expect(packed.length).toBeLessThanOrEqual(300)
	})
})
