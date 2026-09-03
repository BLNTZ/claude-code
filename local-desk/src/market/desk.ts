import { Bus } from '../core/bus.js'
import type { Broker } from './broker.js'
import type { Feed } from './feed.js'
import { Quoter } from './quoter.js'
import type { RiskManager } from './risk.js'
import type { Fill, Order, Position, Quote, Tick } from './types.js'
import { spreadBps } from './types.js'

export type DeskEvents = {
	tick: Tick
	quote: Quote
	order: Order
	fill: Fill
	rejected: { order: Order; reason: string }
	killed: { reason: string }
	equity: { symbol: string; equity: number; timestamp: number }
}

export type DeskConfig = {
	/** Widen quotes automatically once the book is this wide - liquidity monitor's job. */
	liquidityAlertBps: number
}

/**
 * Coordinates the desk's workers over the bus: a price watcher that ingests
 * ticks, a liquidity monitor that flags wide books, a quoter that decides
 * prices, risk that gates every order, and the broker that fills them.
 *
 * This is five roles, not five hundred bots - the roles are what the "300
 * bot swarm" pitch was gesturing at, and five well-separated ones cover the
 * same ground with an auditable path from tick to fill.
 */
export class Desk {
	readonly bus = new Bus<DeskEvents>()
	private lastTick = new Map<string, Tick>()

	constructor(
		private readonly feed: Feed,
		private readonly broker: Broker,
		private readonly risk: RiskManager,
		private readonly quoter: Quoter = new Quoter(),
		private readonly config: DeskConfig = { liquidityAlertBps: 150 },
	) {}

	async run(now: () => number = Date.now): Promise<void> {
		for await (const tick of this.feed.ticks()) {
			if (this.risk.killed) {
				this.bus.emit('killed', { reason: this.risk.killed })
				return
			}

			this.lastTick.set(tick.symbol, tick)
			this.bus.emit('tick', tick)

			// Liquidity monitor: an abnormally wide book is treated as a
			// dislocation, not an opportunity, and halts the desk for safety.
			const bps = spreadBps(tick)
			if (bps > this.config.liquidityAlertBps) {
				this.risk.kill(`liquidity alert: spread ${bps.toFixed(1)}bps on ${tick.symbol}`)
				continue
			}

			this.quoteAndTrade(tick, now())
		}
	}

	private quoteAndTrade(tick: Tick, timestamp: number): void {
		const position = this.broker.position(tick.symbol)
		const quote = this.quoter.quote(tick, position)
		this.bus.emit('quote', quote)

		if (quote.size > 0) {
			for (const side of ['buy', 'sell'] as const) {
				this.placeSide(side, quote, tick, position, timestamp)
			}
		}

		const equity = this.broker.equity(tick)
		this.risk.markEquity(equity)
		this.bus.emit('equity', { symbol: tick.symbol, equity, timestamp })
	}

	private placeSide(
		side: Order['side'],
		quote: Quote,
		tick: Tick,
		position: Position,
		timestamp: number,
	): void {
		const order: Order = {
			id: `${tick.symbol}-${side}-${timestamp}`,
			symbol: tick.symbol,
			side,
			price: side === 'buy' ? quote.bid : quote.ask,
			size: quote.size,
		}

		const verdict = this.risk.check(order, position, tick, timestamp)
		this.bus.emit('order', order)

		if (!verdict.allowed) {
			this.bus.emit('rejected', { order, reason: verdict.reason })
			return
		}

		const fill = this.broker.place(order, tick, timestamp)
		if (fill) this.bus.emit('fill', fill)
	}
}
