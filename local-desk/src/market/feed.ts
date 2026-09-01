import type { Tick } from './types.js'

export type Feed = {
	readonly name: string
	ticks(): AsyncIterable<Tick>
}

/**
 * Replays a fixed series of ticks. This is the only feed the desk ships with
 * on purpose: every strategy change gets measured against recorded data before
 * anything touches a live venue.
 */
export class ReplayFeed implements Feed {
	readonly name = 'replay'

	constructor(private readonly recorded: Tick[]) {}

	async *ticks(): AsyncIterable<Tick> {
		for (const tick of this.recorded) yield tick
	}
}

/**
 * Parses a CSV of `timestamp,symbol,bid,ask,bidSize,askSize`, header optional.
 * Rows that are malformed or crossed (bid above ask) are rejected loudly
 * rather than silently skipped - bad ticks produce backtests that look great.
 */
export function parseTicks(csv: string): Tick[] {
	const ticks: Tick[] = []

	csv.split('\n').forEach((line, index) => {
		const trimmed = line.trim()
		if (trimmed === '') return
		if (index === 0 && /timestamp/i.test(trimmed)) return

		const fields = trimmed.split(',').map((field) => field.trim())
		if (fields.length < 6) {
			throw new Error(`line ${index + 1}: expected 6 fields, got ${fields.length}`)
		}

		const [timestamp, symbol, bid, ask, bidSize, askSize] = fields
		const tick: Tick = {
			timestamp: Number(timestamp),
			symbol,
			bid: Number(bid),
			ask: Number(ask),
			bidSize: Number(bidSize),
			askSize: Number(askSize),
		}

		for (const [key, value] of Object.entries(tick)) {
			if (typeof value === 'number' && !Number.isFinite(value)) {
				throw new Error(`line ${index + 1}: ${key} is not a number`)
			}
		}
		if (tick.bid > tick.ask) {
			throw new Error(`line ${index + 1}: crossed quote, bid ${tick.bid} > ask ${tick.ask}`)
		}

		ticks.push(tick)
	})

	return ticks
}
