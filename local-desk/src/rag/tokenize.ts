const STOPWORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'but',
	'by',
	'for',
	'from',
	'has',
	'have',
	'in',
	'into',
	'is',
	'it',
	'its',
	'of',
	'on',
	'or',
	'that',
	'the',
	'this',
	'to',
	'was',
	'were',
	'will',
	'with',
])

/** Lowercase alphanumeric tokens, stopwords dropped. Shared by BM25 and the embedder. */
export function tokenize(text: string): string[] {
	const tokens: string[] = []
	for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
		if (raw.length > 1 && !STOPWORDS.has(raw)) tokens.push(raw)
	}
	return tokens
}
