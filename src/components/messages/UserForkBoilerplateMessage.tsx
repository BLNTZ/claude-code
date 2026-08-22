import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type * as React from 'react'
import { FORK_GLYPH } from '../../constants/figures.js'
import {
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
} from '../../constants/xml.js'
import { Box, Text } from '../../ink.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

// A fork child's first message is buildChildMessage()'s output:
// <fork-boilerplate>…rules…</fork-boilerplate>\n\nYour directive: <directive>
// The rules are identical in every fork and are for the model, not the reader,
// so the transcript shows the directive alone.
const BOILERPLATE_RE = new RegExp(
  `<${FORK_BOILERPLATE_TAG}>[\\s\\S]*?</${FORK_BOILERPLATE_TAG}>`,
)

/** Keep in sync with buildChildMessage() in tools/AgentTool/forkSubagent.ts. */
export function extractForkDirective(text: string): string {
  const body = text.replace(BOILERPLATE_RE, '').trim()
  return body.startsWith(FORK_DIRECTIVE_PREFIX)
    ? body.slice(FORK_DIRECTIVE_PREFIX.length).trim()
    : body
}

export function UserForkBoilerplateMessage({
  addMargin,
  param: { text },
}: Props): React.ReactNode {
  const directive = extractForkDirective(text)
  // Boilerplate with nothing after it is a malformed fork message, not
  // something worth showing an empty bubble for.
  if (!directive) return null
  return (
    <Box marginTop={addMargin ? 1 : 0} flexDirection="row">
      <Text color="suggestion">{`${FORK_GLYPH} `}</Text>
      <Text>{directive}</Text>
    </Box>
  )
}
