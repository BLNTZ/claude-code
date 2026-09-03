export type DeepImmutable<T> = T
export type Permutations<T, U = T> = [T] extends [never] ? [] : T extends U ? [T, ...Permutations<Exclude<U, T>>] : never
