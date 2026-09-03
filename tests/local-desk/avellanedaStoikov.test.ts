import {
	AvellanedaStoikovQuoter,
	DEFAULT_AS_CONFIG,
	WindowEstimator,
	optimalHalfSpread,
	reservationPrice,
} from 'local-desk/market/avellanedaStoikov.js'
import type { Position, Tick } from 'local-desk/market/types.js'
import { describe, expect, it } from 'vitest'

const config = DEFAULT_AS_CONFIG

describe('reservationPrice', () => {
	it('equals mid price when inventory is flat', () => {
		expect(reservationPrice(100, 0, config, { remaining: 1000, sigma: 0.01, kappa: 1 })).toBe(100)
	})

	it('sits below mid when long', () => {
		const r = reservationPrice(100, 10, config, { remaining: 1000, sigma: 0.01, kappa: 1 })
		expect(r).toBeLessThan(100)
	})

	it('sits above mid when short', () => {
		const r = reservationPrice(100, -10, config, { remaining: 1000, sigma: 0.01, kappa: 1 })
		expect(r).toBeGreaterThan(100)
	})
})

describe('optimalHalfSpread', () => {
	it('widens as volatility rises', () => {
		const low = optimalHalfSpread(config, { remaining: 1000, sigma: 0.005, kappa: 1 })
		const high = optimalHalfSpread(config, { remaining: 1000, sigma: 0.05, kappa: 1 })
		expect(high).toBeGreaterThan(low)
	})

	it('narrows as arrival rate (kappa) rises', () => {
		const slow = optimalHalfSpread(config, { remaining: 1000, sigma: 0.01, kappa: 0.1 })
		const fast = optimalHalfSpread(config, { remaining: 1000, sigma: 0.01, kappa: 10 })
		expect(fast).toBeLessThan(slow)
	})

	it('rejects non-positive kappa', () => {
		expect(() => optimalHalfSpread(config, { remaining: 1000, sigma: 0.01, kappa: 0 })).toThrow()
	})
})

describe('WindowEstimator', () => {
	it('reports zero sigma with fewer than two observations', () => {
		const estimator = new WindowEstimator()
		estimator.observe(tick())
		expect(estimator.sigma()).toBe(0)
	})

	it('sigma rises with more volatile mid-price movement', () => {
		const calm = new WindowEstimator()
		const wild = new WindowEstimator()

		for (let i = 0; i < 20; i++) {
			calm.observe(tick({ bid: 99.99 + i * 0.001, ask: 100.01 + i * 0.001, timestamp: i * 1000 }))
			wild.observe(tick({ bid: 99 + (i % 2) * 2, ask: 101 + (i % 2) * 2, timestamp: i * 1000 }))
		}

		expect(wild.sigma()).toBeGreaterThan(calm.sigma())
	})

	it('kappa defaults to 1 with no observed touch changes', () => {
		const estimator = new WindowEstimator()
		estimator.observe(tick())
		expect(estimator.kappa()).toBe(1)
	})
})

describe('AvellanedaStoikovQuoter', () => {
	it('quotes a positive spread and stays finite through a tick sequence', () => {
		const quoter = new AvellanedaStoikovQuoter()
		let last: ReturnType<AvellanedaStoikovQuoter['quote']> | null = null

		for (let i = 0; i < 30; i++) {
			const t = tick({
				timestamp: i * 1000,
				bid: 99.9 + Math.sin(i / 3) * 0.05,
				ask: 100.1 + Math.sin(i / 3) * 0.05,
			})
			last = quoter.quote(t, position(), config.horizon - i)
			expect(Number.isFinite(last.bid)).toBe(true)
			expect(Number.isFinite(last.ask)).toBe(true)
			expect(last.bid).toBeLessThanOrEqual(last.ask)
		}

		expect(last).not.toBeNull()
	})

	it('tapers size to zero once inventory reaches the limit', () => {
		const quoter = new AvellanedaStoikovQuoter({ ...config, inventoryLimit: 10 })
		const quote = quoter.quote(tick(), position({ quantity: 10 }), 100)
		expect(quote.size).toBe(0)
	})
})

function tick(overrides: Partial<Tick> = {}): Tick {
	return {
		symbol: 'TEST',
		timestamp: 0,
		bid: 99.9,
		ask: 100.1,
		bidSize: 50,
		askSize: 50,
		...overrides,
	}
}

function position(overrides: Partial<Position> = {}): Position {
	return { symbol: 'TEST', quantity: 0, cash: 0, averagePrice: 0, ...overrides }
}
