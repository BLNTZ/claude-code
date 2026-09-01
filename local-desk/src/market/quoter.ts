import type { Position, Quote, Tick } from './types.js'
import { mid, spread } from './types.js'

export type QuoterConfig = {
	/** Half-spread the desk wants to earn, as a fraction of mid. */
	targetEdge: number
	/** Inventory at which quotes are fully skewed to one side. */
	inventoryLimit: number
	/** How hard inventory pushes the reservation price, 0..1. */
	skew: number
	baseSize: number
}

export const DEFAULT_QUOTER: QuoterConfig = {
	targetEdge: 0.0008,
	inventoryLimit: 100,
	skew: 0.5,
	baseSize: 10,
}

/**
 * Inventory-skewed two-sided quoter.
 *
 * The idea is the standard one: quote around a reservation price shifted away
 * from current inventory, so the side that would flatten the book is priced
 * more aggressively and the side that would add to it is priced away. Sizes
 * taper as inventory approaches its limit, so the desk slows down before risk
 * has to say no.
 */
export class Quoter {
	constructor(private readonly config: QuoterConfig = DEFAULT_QUOTER) {}

	quote(tick: Tick, position: Position): Quote {
		const reference = mid(tick)
		const pressure = clamp(position.quantity / this.config.inventoryLimit, -1, 1)

		// Long inventory pulls the reservation price down: sells get cheaper and
		// more likely to fill, buys get further away.
		const reservation = reference * (1 - pressure * this.config.skew * this.config.targetEdge)

		// Never quote inside a spread narrower than the edge we are trying to earn.
		const edge = Math.max(this.config.targetEdge * reference, spread(tick) / 2)

		return {
			symbol: tick.symbol,
			bid: round(reservation - edge),
			ask: round(reservation + edge),
			size: this.size(pressure, tick),
		}
	}

	/**
	 * Size tapers linearly to zero as inventory reaches its limit, and never
	 * exceeds what is showing at the touch.
	 */
	private size(pressure: number, tick: Tick): number {
		const taper = 1 - Math.abs(pressure)
		const available = Math.min(tick.bidSize, tick.askSize)
		const sized = Math.min(this.config.baseSize * taper, available)
		return Math.max(0, Math.floor(sized))
	}
}

const clamp = (value: number, low: number, high: number): number =>
	Math.min(high, Math.max(low, value))

const round = (value: number): number => Math.round(value * 1e8) / 1e8
