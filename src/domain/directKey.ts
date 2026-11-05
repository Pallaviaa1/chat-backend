/**
 * Canonical key for a 1:1 chat.
 * Base64url keeps user ids that contain separators from colliding.
 * Order does not matter: create(a, b) and create(b, a) share one chat.
 */
export function buildDirectKey(userAId: string, userBId: string): string {
  const [first, second] = [userAId, userBId].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  if (first === undefined || second === undefined) {
    throw new Error('Both user ids are required to build a direct chat key');
  }
  return `${encodeUserId(first)}.${encodeUserId(second)}`;
}

function encodeUserId(userId: string): string {
  return Buffer.from(userId, 'utf8').toString('base64url');
}
