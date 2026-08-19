import type * as React from 'react'
import type { ToolUseContext } from '../../Tool.js'
import { getCompanion } from '../../buddy/companion.js'
import { hatchCompanion } from '../../buddy/soul.js'
import { renderSprite } from '../../buddy/sprites.js'
import {
  type Companion,
  RARITY_COLORS,
  RARITY_STARS,
  STAT_NAMES,
} from '../../buddy/types.js'
import { Box, Text } from '../../ink.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getGlobalConfig } from '../../utils/config.js'
import { renderToAnsiString } from '../../utils/staticRender.js'
import type { Theme } from '../../utils/theme.js'
import {
  HELP,
  muteMessage,
  parseBuddyArgs,
  petMessage,
  unknownArgMessage,
} from './actions.js'

const BAR_CELLS = 10
const STAT_LABEL_WIDTH = Math.max(...STAT_NAMES.map(n => n.length)) + 2
const SPRITE_COL_WIDTH = 12

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function StatRow({
  name,
  value,
  color,
}: {
  name: string
  value: number
  color: keyof Theme
}): React.ReactNode {
  // Always show at least one cell — a dump stat that renders as an empty bar
  // reads as "missing data" rather than "this creature is bad at this".
  const filled = Math.min(
    BAR_CELLS,
    Math.max(1, Math.round((value / 100) * BAR_CELLS)),
  )
  return (
    <Text>
      <Text dimColor>{name.padEnd(STAT_LABEL_WIDTH)}</Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(BAR_CELLS - filled)}</Text>
      <Text dimColor>{` ${String(value).padStart(3)}`}</Text>
    </Text>
  )
}

export function CompanionCard({
  companion,
  hatched,
  muted,
  namedOffline = false,
}: {
  companion: Companion
  hatched: boolean
  muted: boolean
  /** The soul came from the canned list because the model call didn't land. */
  namedOffline?: boolean
}): React.ReactNode {
  const color = RARITY_COLORS[companion.rarity]
  const hints = muted
    ? '/buddy unmute to bring them back'
    : '/buddy pet · /buddy mute'
  return (
    <Box flexDirection="column" paddingX={1}>
      {hatched ? (
        <Box marginBottom={1} flexDirection="column">
          <Text color={color} bold>
            {companion.name} hatched.
          </Text>
          {namedOffline ? (
            <Text dimColor>named offline — the model was unreachable</Text>
          ) : null}
        </Box>
      ) : null}
      <Box flexDirection="row">
        <Box
          flexDirection="column"
          flexShrink={0}
          alignItems="center"
          width={SPRITE_COL_WIDTH}
          marginRight={2}
        >
          <Text color={color}>{renderSprite(companion).join('\n')}</Text>
        </Box>
        <Box flexDirection="column">
          <Text>
            <Text bold color={color}>
              {companion.name}
            </Text>
            <Text color={color}>{`  ${RARITY_STARS[companion.rarity]}`}</Text>
            <Text dimColor>{`  ${companion.rarity} ${companion.species}`}</Text>
            {companion.hat !== 'none' ? (
              <Text dimColor>{` · ${companion.hat}`}</Text>
            ) : null}
            {companion.shiny ? <Text color="warning"> · shiny</Text> : null}
          </Text>
          <Text italic dimColor>
            {companion.personality}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {STAT_NAMES.map(name => (
              <StatRow
                key={name}
                name={name}
                value={companion.stats[name]}
                color={color}
              />
            ))}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              {`hatched ${formatAge(Date.now() - companion.hatchedAt)} · ${hints}`}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args = '',
): Promise<React.ReactNode> {
  switch (parseBuddyArgs(args)) {
    case 'help':
      onDone(HELP, { display: 'system' })
      return null
    case 'mute':
      onDone(muteMessage(true), { display: 'system' })
      return null
    case 'unmute':
      onDone(muteMessage(false), { display: 'system' })
      return null
    case 'pet':
      onDone(petMessage(context), { display: 'system' })
      return null
    case 'unknown':
      onDone(unknownArgMessage(args), { display: 'system' })
      return null
    case 'card':
      break
  }

  const existing = getCompanion()
  const hatch = existing
    ? undefined
    : await hatchCompanion(context.abortController.signal)
  const companion = existing ?? hatch!.companion

  const output = await renderToAnsiString(
    <CompanionCard
      companion={companion}
      hatched={hatch !== undefined}
      namedOffline={hatch?.usedFallback === true}
      muted={getGlobalConfig().companionMuted === true}
    />,
    process.stdout.columns || 80,
  )
  onDone(output)
  return null
}
