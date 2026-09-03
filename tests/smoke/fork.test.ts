import { describe, expect, it } from 'vitest'
import { buildForkPrompt } from '../../src/commands/fork/prompt.js'
import {
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
} from '../../src/constants/xml.js'
import { extractForkDirective } from '../../src/components/messages/UserForkBoilerplateMessage.js'

// Mirrors forkChildMessage()'s output shape. Both sides of the contract are
// defined by the xml.ts constants, which is what this asserts — importing
// buildChildMessage itself would drag the whole message pipeline in.
function forkChildMessage(directive: string): string {
  return `<${FORK_BOILERPLATE_TAG}>
STOP. READ THIS FIRST.

You are a forked worker process.
</${FORK_BOILERPLATE_TAG}>

${FORK_DIRECTIVE_PREFIX}${directive}`
}

describe('buildForkPrompt()', () => {
  it('passes the directive through and names the tool to call', () => {
    const prompt = buildForkPrompt('port the auth tests to vitest')
    expect(prompt).toContain('port the auth tests to vitest')
    expect(prompt).toContain('Agent')
    expect(prompt).toContain('subagent_type')
  })

  it('tells the model not to do the work as well', () => {
    const prompt = buildForkPrompt('anything')
    expect(prompt).toContain('Do not also do the work yourself')
  })

  it('asks for parallel forks only when the work splits', () => {
    expect(buildForkPrompt('anything')).toContain('independent pieces')
  })

  it('answers an empty invocation with usage', () => {
    const prompt = buildForkPrompt('   ')
    expect(prompt).toContain('/fork <directive>')
    expect(prompt).not.toContain('<directive>\n')
  })
})

describe('extractForkDirective()', () => {
  it('round-trips a real fork child message', () => {
    const directive = 'Move the auth tests to vitest and report the diff.'
    expect(extractForkDirective(forkChildMessage(directive))).toBe(directive)
  })

  it('keeps a multi-line directive intact', () => {
    const directive = 'First do X.\nThen do Y.'
    expect(extractForkDirective(forkChildMessage(directive))).toBe(directive)
  })

  it('leaves text that carries no boilerplate alone', () => {
    expect(extractForkDirective('just a normal message')).toBe(
      'just a normal message',
    )
  })

  it('returns empty for boilerplate with no directive', () => {
    expect(
      extractForkDirective(`<${FORK_BOILERPLATE_TAG}>rules</${FORK_BOILERPLATE_TAG}>`),
    ).toBe('')
  })
})
