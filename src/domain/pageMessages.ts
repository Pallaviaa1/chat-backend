export interface Timestamped {
  createdAt: string;
}

/**
 * Latest `limit` messages at or older than the page, returned oldest-first.
 * `before` is exclusive and matches a Firestore `orderBy(createdAt desc).startAfter(timestamp)` page.
 */
export function pageMessages<T extends Timestamped>(
  messages: readonly T[],
  limit: number,
  before?: string,
): T[] {
  const eligible =
    before === undefined ? [...messages] : messages.filter((message) => message.createdAt < before);
  eligible.sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return 0;
    }
    return left.createdAt < right.createdAt ? 1 : -1;
  });
  return eligible.slice(0, limit).reverse();
}
