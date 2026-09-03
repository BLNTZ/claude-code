import type { Fill, Order, Position, Tick } from './types.js'

export type Broker = {
	readonly name: string
	place(order: Order, tick: Tick, now: number): Fill | null
	position(symbol: string): Position
	equity(tick: Tick): number
}

export type PaperBrokerConfig = {
	/** Fee/rebate in basis points of notional. Negative is a maker rebate. */
	feeBps: number
	/**
	 * Only fills when our price crosses the touch, i.e. we behave as a maker
	 * resting in the book rather than a taker that always gets filled.
	 */
	requireCross: boolean
}

export const DEFAULT_PAPER_CONFIG: PaperBrokerConfig = {
	feeBps: -1.5,
	requireCross: true,
}

/**
 * Simulated fills against replayed ticks. No network, no exchange - this is
 * where every strategy proves itself before anything is wired to a real
 * venue, which this desk deliberately does not ship.
 */
export class PaperBroker implements Broker {
	readonly name = 'paper'
	private readonly positions = new Map<string, Position>()
	private readonly fills: Fill[] = []
	private nextFillId = 0

	constructor(private readonly config: PaperBrokerConfig = DEFAULT_PAPER_CONFIG) {}

	place(order: Order, tick: Tick, now: number): Fill | null {
		if (this.config.requireCross) {
			const crosses =
				(order.side === 'buy' && order.price >= tick.ask) ||
				(order.side === 'sell' && order.price <= tick.bid)
			if (!crosses) return null
		}

		const fillPrice =
			order.side === 'buy' ? Math.min(order.price, tick.ask) : Math.max(order.price, tick.bid)
		const notional = fillPrice * order.size
		const fee = (notional * this.config.feeBps) / 10_000

		const fill: Fill = {
			orderId: order.id,
			symbol: order.symbol,
			side: order.side,
			price: fillPrice,
			size: order.size,
			timestamp: now,
			fee,
		}

		this.apply(fill)
		this.fills.push(fill)
		return fill
	}

	private apply(fill: Fill): void {
		const position = this.position(fill.symbol)
		const signedSize = fill.side === 'buy' ? fill.size : -fill.size
		const newQuantity = position.quantity + signedSize

		// Weighted average price only moves when we add to the position in the
		// same direction; a reduction or flip realizes against the old average.
		const sameDirection =
			Math.sign(signedSize) === Math.sign(position.quantity) || position.quantity === 0
		const averagePrice = sameDirection
			? (position.averagePrice * Math.abs(position.quantity) + fill.price * fill.size) /
				Math.max(Math.abs(newQuantity), 1e-9)
			: newQuantity === 0
				? 0
				: position.averagePrice

		this.positions.set(fill.symbol, {
			symbol: fill.symbol,
			quantity: newQuantity,
			cash: position.cash - signedSize * fill.price - fill.fee,
			averagePrice,
		})
	}

	position(symbol: string): Position {
		return this.positions.get(symbol) ?? { symbol, quantity: 0, cash: 0, averagePrice: 0 }
	}

	equity(tick: Tick): number {
		const position = this.position(tick.symbol)
		const markPrice = (tick.bid + tick.ask) / 2
		return position.cash + position.quantity * markPrice
	}

	fillHistory(): readonly Fill[] {
		return this.fills
	}

	nextOrderId(): string {
		return `paper-${this.nextFillId++}`
	}
}
