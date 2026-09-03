/**
 * Minimal structural view of the messages that flow through a Transport.
 * The full discriminated union is `StdoutMessage` in
 * src/entrypoints/sdk/controlTypes.ts; transports only inspect `type` for
 * logging/batching and `uuid` for replay/dedup, so this is all the contract
 * needs and every `StdoutMessage` variant satisfies it.
 */
// NOTE: local stand-in — src/entrypoints/sdk/controlTypes.ts is not yet present.
export type TransportMessage = {
  type: string
  uuid?: string
}

/**
 * Bidirectional message transport between this process and a remote
 * session (CCR / Session Ingress). Implemented by WebSocketTransport,
 * HybridTransport (WS reads + POST writes) and SSETransport (SSE reads +
 * POST writes); selected by `getTransportForUrl`.
 *
 * Inbound data is delivered as newline-delimited JSON strings via the
 * `setOnData` callback so it can be piped straight into StructuredIO.
 * Register callbacks before calling `connect()` — early frames arriving on
 * an unwired callback are dropped.
 */
export type Transport = {
  /**
   * Open the connection. Resolves once the connection attempt has been
   * started; implementations reconnect internally and only report a
   * permanent failure through the `setOnClose` callback.
   */
  connect(): Promise<void>
  /**
   * Send a message to the remote session. Implementations buffer or retry
   * while disconnected; the promise resolves when the message is handed
   * off (or dropped after exhausting retries) rather than rejecting.
   */
  write(message: TransportMessage): Promise<void>
  /** Tear down the connection and stop any reconnection attempts. */
  close(): void
  /** Called with each inbound chunk (newline-terminated JSON). */
  setOnData(callback: (data: string) => void): void
  /**
   * Called once when the transport gives up (permanent close code, HTTP
   * 401/403/404, or reconnection budget exhausted). Not called for
   * intermediate drops that are being retried.
   */
  setOnClose(callback: (closeCode?: number) => void): void
  isConnectedStatus(): boolean
  isClosedStatus(): boolean
}
