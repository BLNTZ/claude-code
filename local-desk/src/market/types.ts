export type Side = 'buy' | 'sell'

export type Tick = {
	symbol: string
	/** Milliseconds since epoch. */
	timestamp: number
	bid: number
	ask: number
	/** Size available at the touch, used to size quotes and gauge liquidity. */
	bidSize: number
	askSize: number
}

export type Quote = {
	symbol: string
	bid: number
	ask: number
	size: number
}

export type Order = {
	id: string
	symbol: string
	side: Side
	price: number
	size: number
}

export type Fill = {
	orderId: string
	symbol: string
	side: Side
	price: number
	size: number
	timestamp: number
	/** Signed: negative is a rebate earned, positive is a fee paid. */
	fee: number
}

export type Position = {
	symbol: string
	/** Signed inventory. Positive is long. */
	quantity: number
	/** Realized cash, fees included. */
	cash: number
	averagePrice: number
}

export const mid = (tick: Tick): number => (tick.bid + tick.ask) / 2

export const spread = (tick: Tick): number => tick.ask - tick.bid

/** Spread as a fraction of mid, the comparable measure across price levels. */
export const spreadBps = (tick: Tick): number => (spread(tick) / mid(tick)) * 10_000
