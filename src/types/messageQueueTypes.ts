import type { SessionId } from './ids.js'

/**
 * Mutations of the unified command queue (`src/utils/messageQueueManager.ts`)
 * that are recorded to the session transcript.
 *
 * - `enqueue` — a command was added (user input, task notification, ...)
 * - `dequeue` — a command was pulled off the queue for processing
 * - `remove`  — a command was discarded without being processed
 * - `popAll`  — editable commands were pulled back into the input buffer
 */
export type QueueOperation = 'enqueue' | 'dequeue' | 'remove' | 'popAll'

/**
 * Transcript entry describing one queue mutation. Appended to the session
 * file so queue activity can be inspected when debugging and reconstructed on
 * resume. These entries are not conversation messages: loaders that build the
 * message list filter them out.
 */
export type QueueOperationMessage = {
  type: 'queue-operation'
  operation: QueueOperation
  /** ISO-8601 timestamp of the operation. */
  timestamp: string
  sessionId: SessionId
  /** Text of the affected command, when its value was plain text. */
  content?: string
}
