import type { Order, Position, Tick } from './types.js'
import { mid, spreadBps } from './types.js'

export type RiskLimits = {
	/** Largest absolute inventory allowed in any one symbol. */
	maxPosition: number
	/** Largest single order size. */
	maxOrderSize: number
	/** Loss at which the desk stops quoting for the session, in cash terms. */
	maxDrawdown: number
	/** Refuse to quote when the book is wider than this - a sign of a dislocation. */
	maxSpreadBps: number
	/** Refuse to act on a tick older than this many milliseconds. */
	maxTickAgeMs: number
}

export const DEFAULT_LIMITS: RiskLimits = {
	maxPosition: 100,
	maxOrderSize: 25,
	maxDrawdown: 1_000,
	maxSpreadBps: 200,
	maxTickAgeMs: 5_000,
}

export type Verdict = { allowed: true } | { allowed: false; reason: string }

const REJECT = (reason: string): Verdict => ({ allowed: false, reason })
const ALLOW: Verdict = { allowed: true }

/**
 * Pre-trade risk gate and session kill switch.
 *
 * Every order passes through `check` before it can reach a broker, and the
 * gate is fail-closed: anything it cannot evaluate is rejected. Once tripped,
 * the kill switch stays tripped until a human calls `reset` - an automatic
 * recovery would just re-enter the conditions that tripped it.
 */
export class RiskManager {
	private tripped: string | null = null
	private peakEquity = 0

	constructor(private readonly limits: RiskLimits = DEFAULT_LIMITS) {}

	get killed(): string | null {
		return this.tripped
	}

	/** Updates the high-water mark and trips the switch on excessive drawdown. */
	markEquity(equity: number): void {
		this.peakEquity = Math.max(this.peakEquity, equity)
		const drawdown = this.peakEquity - equity
		if (drawdown > this.limits.maxDrawdown && !this.tripped) {
			this.tripped = `drawdown ${drawdown.toFixed(2)} exceeds limit ${this.limits.maxDrawdown}`
		}
	}

	check(order: Order, position: Position, tick: Tick, now: number): Verdict {
		if (this.tripped) return REJECT(`kill switch: ${this.tripped}`)

		if (!(order.size > 0)) return REJECT(`non-positive size ${order.size}`)
		if (!Number.isFinite(order.price) || order.price <= 0) {
			return REJECT(`invalid price ${order.price}`)
		}
		if (order.size > this.limits.maxOrderSize) {
			return REJECT(`order size ${order.size} exceeds ${this.limits.maxOrderSize}`)
		}

		const age = now - tick.timestamp
		if (age > this.limits.maxTickAgeMs) {
			return REJECT(`stale tick, ${age}ms old`)
		}

		const bps = spreadBps(tick)
		if (bps > this.limits.maxSpreadBps) {
			return REJECT(`spread ${bps.toFixed(1)}bps exceeds ${this.limits.maxSpreadBps}bps`)
		}

		// A quote far from mid either misprices the risk or is a fat finger.
		const distance = Math.abs(order.price - mid(tick)) / mid(tick)
		if (distance > 0.1) {
			return REJECT(`price ${order.price} is ${(distance * 100).toFixed(1)}% from mid`)
		}

		const projected = position.quantity + (order.side === 'buy' ? order.size : -order.size)
		if (Math.abs(projected) > this.limits.maxPosition) {
			return REJECT(`projected position ${projected} exceeds ${this.limits.maxPosition}`)
		}

		return ALLOW
	}

	/** Trips the switch by hand. Used by operators and by the coordinator on feed loss. */
	kill(reason: string): void {
		this.tripped ??= reason
	}

	reset(): void {
		this.tripped = null
		this.peakEquity = 0
	}
}
