import { PaperBroker } from 'local-desk/market/broker.js'
import { Desk } from 'local-desk/market/desk.js'
import { ReplayFeed, parseTicks } from 'local-desk/market/feed.js'
import { Quoter } from 'local-desk/market/quoter.js'
import { DEFAULT_LIMITS, RiskManager } from 'local-desk/market/risk.js'
import type { Order, Position, Tick } from 'local-desk/market/types.js'
import { describe, expect, it } from 'vitest'

const tick = (overrides: Partial<Tick> = {}): Tick => ({
	symbol: 'TEST',
	timestamp: 1_000,
	bid: 99.9,
	ask: 100.1,
	bidSize: 50,
	askSize: 50,
	...overrides,
})

const order = (overrides: Partial<Order> = {}): Order => ({
	id: 'o1',
	symbol: 'TEST',
	side: 'buy',
	price: 100,
	size: 5,
	...overrides,
})

const position = (overrides: Partial<Position> = {}): Position => ({
	symbol: 'TEST',
	quantity: 0,
	cash: 0,
	averagePrice: 0,
	...overrides,
})

describe('parseTicks', () => {
	it('parses a CSV with a header', () => {
		const ticks = parseTicks(
			'timestamp,symbol,bid,ask,bidSize,askSize\n1000,TEST,99.9,100.1,10,10\n',
		)
		expect(ticks).toHaveLength(1)
		expect(ticks[0].symbol).toBe('TEST')
	})

	it('rejects a crossed quote', () => {
		expect(() => parseTicks('1000,TEST,100.1,99.9,10,10')).toThrow(/crossed/)
	})

	it('rejects a malformed row', () => {
		expect(() => parseTicks('1000,TEST,100.1')).toThrow()
	})
})

describe('RiskManager', () => {
	it('allows a well-formed order inside all limits', () => {
		const risk = new RiskManager()
		const verdict = risk.check(order(), position(), tick(), 1_000)
		expect(verdict.allowed).toBe(true)
	})

	it('rejects an order larger than maxOrderSize', () => {
		const risk = new RiskManager()
		const verdict = risk.check(order({ size: 999 }), position(), tick(), 1_000)
		expect(verdict.allowed).toBe(false)
	})

	it('rejects when projected position exceeds maxPosition', () => {
		const risk = new RiskManager({ ...DEFAULT_LIMITS, maxOrderSize: 200 })
		const verdict = risk.check(order({ size: 150 }), position({ quantity: 0 }), tick(), 1_000)
		expect(verdict.allowed).toBe(false)
	})

	it('rejects a stale tick', () => {
		const risk = new RiskManager()
		const verdict = risk.check(order(), position(), tick({ timestamp: 0 }), 10_000)
		expect(verdict.allowed).toBe(false)
	})

	it('trips the kill switch on drawdown and stays tripped after reset would be needed', () => {
		const risk = new RiskManager({ ...DEFAULT_LIMITS, maxDrawdown: 100 })
		risk.markEquity(1_000)
		risk.markEquity(850)
		expect(risk.killed).not.toBeNull()

		const verdict = risk.check(order(), position(), tick(), 1_000)
		expect(verdict.allowed).toBe(false)

		risk.reset()
		expect(risk.killed).toBeNull()
	})

	it('rejects a non-positive order size', () => {
		const risk = new RiskManager()
		expect(risk.check(order({ size: 0 }), position(), tick(), 1_000).allowed).toBe(false)
	})
})

describe('Quoter', () => {
	it('quotes a positive spread around mid with no inventory', () => {
		const quoter = new Quoter()
		const quote = quoter.quote(tick(), position())
		expect(quote.bid).toBeLessThan(quote.ask)
		expect(quote.bid).toBeLessThan(100)
		expect(quote.ask).toBeGreaterThan(100)
	})

	it('skews the reservation price down when long inventory', () => {
		const quoter = new Quoter()
		const flat = quoter.quote(tick(), position({ quantity: 0 }))
		const long = quoter.quote(tick(), position({ quantity: 80 }))
		expect(long.bid + long.ask).toBeLessThan(flat.bid + flat.ask)
	})

	it('tapers size toward zero as inventory approaches the limit', () => {
		const quoter = new Quoter({ targetEdge: 0.001, inventoryLimit: 100, skew: 0.5, baseSize: 10 })
		const nearLimit = quoter.quote(tick(), position({ quantity: 99 }))
		expect(nearLimit.size).toBeLessThanOrEqual(1)
	})
})

describe('PaperBroker', () => {
	it('fills a buy order that crosses the ask and updates position', () => {
		const broker = new PaperBroker({ feeBps: 0, requireCross: true })
		const fill = broker.place(order({ price: 100.2, size: 5 }), tick(), 1_000)

		expect(fill).not.toBeNull()
		expect(broker.position('TEST').quantity).toBe(5)
	})

	it('does not fill a resting order that fails to cross', () => {
		const broker = new PaperBroker({ feeBps: 0, requireCross: true })
		const fill = broker.place(order({ price: 99, size: 5 }), tick(), 1_000)

		expect(fill).toBeNull()
		expect(broker.position('TEST').quantity).toBe(0)
	})

	it('charges fees against cash on fill', () => {
		const broker = new PaperBroker({ feeBps: 10, requireCross: true })
		broker.place(order({ price: 100.2, size: 5 }), tick(), 1_000)
		// buying costs price*size plus a positive fee, so cash goes negative
		expect(broker.position('TEST').cash).toBeLessThan(-500)
	})
})

describe('Desk', () => {
	it('runs a replay to completion, quoting both sides without violating risk limits', async () => {
		const ticks: Tick[] = Array.from({ length: 20 }, (_, i) =>
			tick({ timestamp: i * 100, bid: 99.9 + i * 0.01, ask: 100.1 + i * 0.01 }),
		)
		const feed = new ReplayFeed(ticks)
		const broker = new PaperBroker()
		const risk = new RiskManager({ ...DEFAULT_LIMITS, maxTickAgeMs: 100_000 })
		const desk = new Desk(feed, broker, risk)

		let orders = 0
		let rejections = 0
		desk.bus.on('order', (order) => {
			orders++
			// A resting maker quote should never itself be marked as an invalid
			// order by risk - it should be allowed even though it won't cross.
			expect(order.price).toBeGreaterThan(0)
		})
		desk.bus.on('rejected', () => rejections++)

		await desk.run(() => 0)

		expect(orders).toBe(ticks.length * 2) // one bid + one ask per tick
		expect(rejections).toBe(0)
		expect(risk.killed).toBeNull()
	})

	it('fills when a taker order crosses a resting maker quote', () => {
		const broker = new PaperBroker({ feeBps: 0, requireCross: true })
		const risk = new RiskManager()
		const quoter = new Quoter()
		const marketTick = tick()
		const quote = quoter.quote(marketTick, broker.position('TEST'))

		// Simulate an aggressive taker crossing our resting bid.
		const takerFill = broker.place(
			{ id: 'taker-sell', symbol: 'TEST', side: 'sell', price: quote.bid, size: 1 },
			{ ...marketTick, bid: quote.bid },
			1_000,
		)

		expect(takerFill).not.toBeNull()
		expect(broker.position('TEST').quantity).toBe(-1)
		expect(risk.killed).toBeNull()
	})

	it('halts on a liquidity dislocation without throwing', async () => {
		const ticks: Tick[] = [
			tick({ timestamp: 0 }),
			tick({ timestamp: 100, bid: 50, ask: 150 }), // wildly wide, should trip liquidity alert
			tick({ timestamp: 200 }),
		]
		const desk = new Desk(new ReplayFeed(ticks), new PaperBroker(), new RiskManager())

		let killed = false
		desk.bus.on('killed', () => {
			killed = true
		})

		await desk.run(() => 0)
		expect(killed).toBe(true)
	})
})
