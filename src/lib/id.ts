/** RFC-4122 v4 id. Used for app-local session ids and the Claude session id
 *  we own at birth and pass via --session-id (PLAN §7). */
export function uuid(): string {
  return crypto.randomUUID()
}
