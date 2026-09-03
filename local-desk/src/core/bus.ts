/**
 * Minimal typed in-process event bus.
 *
 * The desk is a set of independent workers that only ever talk through this
 * bus, so any worker can be added, removed or replaced without touching the
 * others. Handlers are invoked synchronously in subscription order; a throwing
 * handler is isolated so one bad worker cannot take down the swarm.
 */
export type Handler<T> = (payload: T) => void

export class Bus<Events extends Record<string, unknown>> {
	private handlers = new Map<keyof Events, Set<Handler<never>>>()
	private errors: Array<{ event: keyof Events; error: unknown }> = []

	on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
		let set = this.handlers.get(event)
		if (!set) {
			set = new Set()
			this.handlers.set(event, set)
		}
		set.add(handler as Handler<never>)
		return () => {
			set.delete(handler as Handler<never>)
		}
	}

	emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		const set = this.handlers.get(event)
		if (!set) return
		for (const handler of [...set]) {
			try {
				;(handler as Handler<Events[K]>)(payload)
			} catch (error) {
				this.errors.push({ event, error })
			}
		}
	}

	/** Errors swallowed during emit, so tests and operators can assert on them. */
	drainErrors(): Array<{ event: keyof Events; error: unknown }> {
		const drained = this.errors
		this.errors = []
		return drained
	}
}
