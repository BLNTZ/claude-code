import type { Position, Quote, Tick } from './types.js'
import { mid } from './types.js'

/**
 * Avellaneda-Stoikov market making model (Avellaneda & Stoikov, "High
 * Frequency Trading in a Limit Order Book", Quantitative Finance, 2008).
 *
 * Two formulas:
 *
 *   reservation price:  r = s - q * gamma * sigma^2 * (T - t)
 *   optimal half-spread: delta = gamma * sigma^2 * (T - t) + (2/gamma) * ln(1 + gamma/kappa)
 *
 * where s is mid price, q is signed inventory, gamma is risk aversion,
 * sigma is volatility, (T - t) is remaining time in the trading horizon, and
 * kappa is the order-arrival-rate parameter of the book's liquidity.
 *
 * Both are public, well-studied formulas - the value here is in estimating
 * their inputs (sigma, kappa) honestly from data rather than the algebra,
 * which is a few lines.
 */
export type AvellanedaStoikovConfig = {
	/** Risk aversion. Higher pulls the reservation price harder off mid and widens quotes. */
	gamma: number
	/** Trading horizon in the same time units as `remaining`, e.g. seconds in a session. */
	horizon: number
	baseSize: number
	inventoryLimit: number
}

export const DEFAULT_AS_CONFIG: AvellanedaStoikovConfig = {
	gamma: 0.1,
	horizon: 3600,
	baseSize: 10,
	inventoryLimit: 100,
}

export type AvellanedaStoikovInputs = {
	/** Seconds remaining in the trading horizon, 0..config.horizon. */
	remaining: number
	/** Volatility of returns, same convention as the estimator that feeds it. */
	sigma: number
	/** Order arrival rate parameter - how quickly the book fills at a given depth. */
	kappa: number
}

export function reservationPrice(
	midPrice: number,
	inventory: number,
	config: AvellanedaStoikovConfig,
	inputs: AvellanedaStoikovInputs,
): number {
	return midPrice - inventory * config.gamma * inputs.sigma ** 2 * inputs.remaining
}

export function optimalHalfSpread(
	config: AvellanedaStoikovConfig,
	inputs: AvellanedaStoikovInputs,
): number {
	if (config.gamma <= 0) throw new Error('gamma must be positive')
	if (inputs.kappa <= 0) throw new Error('kappa must be positive')

	const inventoryTerm = config.gamma * inputs.sigma ** 2 * inputs.remaining
	const spreadTerm = (2 / config.gamma) * Math.log(1 + config.gamma / inputs.kappa)
	return inventoryTerm + spreadTerm
}

/**
 * Estimates sigma (annualization-free, per-tick) as the sample standard
 * deviation of mid-price log returns over a trailing window, and kappa as
 * the inverse of the mean time between the touch changing - a rough proxy
 * for how quickly the book refreshes, since we don't have a real trade tape
 * in a tick-only feed.
 */
export class WindowEstimator {
	private readonly returns: number[] = []
	private lastMid: number | null = null
	private lastChangeAt: number | null = null
	private readonly gaps: number[] = []

	constructor(private readonly windowSize = 60) {}

	observe(tick: Tick): void {
		const current = mid(tick)

		if (this.lastMid !== null && this.lastMid > 0) {
			this.push(this.returns, Math.log(current / this.lastMid))
		}

		if (this.lastMid !== null && current !== this.lastMid && this.lastChangeAt !== null) {
			this.push(this.gaps, tick.timestamp - this.lastChangeAt)
		}
		if (this.lastMid === null || current !== this.lastMid) {
			this.lastChangeAt = tick.timestamp
		}

		this.lastMid = current
	}

	private push(list: number[], value: number): void {
		list.push(value)
		if (list.length > this.windowSize) list.shift()
	}

	sigma(): number {
		if (this.returns.length < 2) return 0
		const mean = this.returns.reduce((sum, r) => sum + r, 0) / this.returns.length
		const variance =
			this.returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (this.returns.length - 1)
		return Math.sqrt(Math.max(variance, 0))
	}

	/** Order arrival rate: inverse of the mean gap between touch changes, floored to avoid a div-by-zero blowup. */
	kappa(): number {
		if (this.gaps.length === 0) return 1
		const meanGapMs = this.gaps.reduce((sum, g) => sum + g, 0) / this.gaps.length
		return meanGapMs > 0 ? 1000 / meanGapMs : 1
	}
}

/**
 * Quoter implementing the Avellaneda-Stoikov model, with volatility and
 * arrival-rate estimated online from the tick stream via `WindowEstimator`.
 *
 * `remainingSeconds` should be wall-clock seconds left in the session (falls
 * back to a full horizon at the start and floors at a small positive value
 * near the close, since the formula degenerates to zero spread at t = T).
 */
export class AvellanedaStoikovQuoter {
	private readonly estimator: WindowEstimator

	constructor(
		private readonly config: AvellanedaStoikovConfig = DEFAULT_AS_CONFIG,
		windowSize = 60,
	) {
		this.estimator = new WindowEstimator(windowSize)
	}

	quote(tick: Tick, position: Position, remainingSeconds: number): Quote {
		this.estimator.observe(tick)

		const remaining = Math.max(remainingSeconds, 1e-6)
		const inputs: AvellanedaStoikovInputs = {
			remaining,
			sigma: this.estimator.sigma(),
			kappa: Math.max(this.estimator.kappa(), 1e-6),
		}

		const midPrice = mid(tick)
		const reservation = reservationPrice(midPrice, position.quantity, this.config, inputs)
		const halfSpread = optimalHalfSpread(this.config, inputs)

		const pressure = Math.abs(position.quantity) / this.config.inventoryLimit
		const taper = Math.max(0, 1 - Math.min(pressure, 1))
		const available = Math.min(tick.bidSize, tick.askSize)
		const size = Math.max(0, Math.floor(Math.min(this.config.baseSize * taper, available)))

		return {
			symbol: tick.symbol,
			bid: round(reservation - halfSpread),
			ask: round(reservation + halfSpread),
			size,
		}
	}
}

const round = (value: number): number => Math.round(value * 1e8) / 1e8
