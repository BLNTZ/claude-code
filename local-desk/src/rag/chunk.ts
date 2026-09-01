/** A slice of a source document, carrying enough context to cite it back. */
export type Chunk = {
	id: string
	docId: string
	text: string
	/** Character offset of this chunk within the source document. */
	offset: number
}

export type ChunkOptions = {
	/** Target chunk size in characters. */
	size?: number
	/** Characters of trailing context repeated into the next chunk. */
	overlap?: number
}

const PARAGRAPH = /\n\s*\n/

/**
 * Split text into overlapping chunks, preferring paragraph then sentence
 * boundaries so a retrieved chunk reads as a complete thought rather than a
 * fragment cut mid-word.
 */
export function chunk(docId: string, text: string, options: ChunkOptions = {}): Chunk[] {
	const size = options.size ?? 800
	const overlap = Math.min(options.overlap ?? 120, size - 1)
	if (size <= 0) throw new Error('chunk size must be positive')

	const chunks: Chunk[] = []
	let cursor = 0

	while (cursor < text.length) {
		const hardEnd = Math.min(cursor + size, text.length)
		const end = hardEnd === text.length ? hardEnd : findBoundary(text, cursor, hardEnd)
		const slice = text.slice(cursor, end).trim()

		if (slice.length > 0) {
			chunks.push({
				id: `${docId}:${chunks.length}`,
				docId,
				text: slice,
				offset: cursor,
			})
		}

		if (end >= text.length) break
		cursor = Math.max(end - overlap, cursor + 1)
	}

	return chunks
}

/**
 * Walk back from the hard cut to the last natural break, giving up and cutting
 * at `hardEnd` if the window has no break in it (minified text, long tables).
 */
function findBoundary(text: string, start: number, hardEnd: number): number {
	const window = text.slice(start, hardEnd)
	const floor = Math.floor(window.length * 0.5)

	const paragraph = lastMatch(window, PARAGRAPH)
	if (paragraph > floor) return start + paragraph

	for (const mark of ['. ', '! ', '? ', '\n']) {
		const at = window.lastIndexOf(mark)
		if (at > floor) return start + at + mark.length
	}

	const space = window.lastIndexOf(' ')
	return space > floor ? start + space + 1 : hardEnd
}

function lastMatch(text: string, pattern: RegExp): number {
	let last = -1
	const global = new RegExp(pattern.source, 'g')
	for (const match of text.matchAll(global)) last = match.index + match[0].length
	return last
}
