export const DESCRIPTION = 'List other Claude sessions you can message'

export function getPrompt(): string {
  return `
# ListPeers

Lists the other Claude sessions running for this user that SendMessage can reach, with the address to use for each.

\`\`\`json
{}
\`\`\`

Every listed peer is alive and will process a message — enumeration filters out sessions whose process is gone. Pass a peer's \`address\` straight through as SendMessage's \`to\`:

\`\`\`json
{"to": "uds:/tmp/cc-socks/1234.sock", "message": "check if tests pass over there"}
\`\`\`

\`uds:\` peers are on this machine; \`bridge:\` peers are reachable through Remote Control. A session reachable both ways is listed once, as \`uds:\`.

This session is not listed. An empty list means nothing else is running — say so rather than guessing at an address.
`.trim()
}
