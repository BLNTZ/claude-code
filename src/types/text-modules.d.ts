// Ambient declarations for text assets inlined by the bundler's text loader
// (see scripts/build-bundle.ts). Lets `import doc from './doc.md'` and
// `require('./prompt.txt')` typecheck as strings under tsc.
declare module '*.md' {
  const content: string
  export default content
}

declare module '*.txt' {
  const content: string
  export default content
}
