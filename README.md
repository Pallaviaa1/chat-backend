# Chat backend

Users and chat membership live in PostgreSQL. Messages, read receipts, and last-seen cursors live in Cloud Firestore. The HTTP API is Node.js and TypeScript in strict mode.

Direct chats are one conversation per pair of people. Creating the same pair again returns the existing chat. Group chats, message edit, and message delete are included.

## Layout

```text
src/routes          HTTP contract
src/services        membership and message rules
src/repositories    PostgreSQL and Firestore
src/stores          interfaces the services depend on
migrations          relational schema
```

PostgreSQL holds data that needs uniqueness and joins: a user, a chat, and who is in it. The direct-chat key is a unique column, so two concurrent creates of the same pair cannot insert two chats. An advisory lock covers the check-and-insert.

Firestore holds the write-heavy timeline:

```text
chats/{chatId}/messages/{messageId}
chats/{chatId}/messages/{messageId}/reads/{userId}
chats/{chatId}/lastSeen/{userId}
```

Message time is a Firestore server timestamp, so a client cannot pick its own order. `GET /messages` returns the newest page, oldest message first, which is the order a chat window renders. Pass `before` (the previous `nextCursor`) to load older messages.

Read receipts are stored twice: a `reads/{userId}` document is the source of truth, and `readBy` on the message avoids a fan-out read when listing a page. Last seen is its own document per member so those writes do not collide with message writes.

The API trusts the user id in the body because that is the contract in the task. Membership is still enforced: a sender, a reader, and a last-seen update must belong to the chat. Before a real deployment, replace that id with a verified Firebase Auth token and ignore the id from the client.

## Run it

Requirements: Node.js 20+, PostgreSQL 14+, and either the Firestore emulator or a Firebase service account.

```bash
cp .env.example .env
npm install
docker compose up postgres -d
npm run emulators
npm run dev
```

`npm run dev` applies `migrations/` on startup. The emulator UI is at http://localhost:4000. The API listens on port 3000.

Without Docker, point `DATABASE_URL` at any PostgreSQL database and run `npm run migrate`.

To use a live Firebase project instead of the emulator, unset `FIRESTORE_EMULATOR_HOST` and set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`. If the emulator host is set, the process will not use the service account. That avoids writing to production from a laptop by mistake.

`docker compose up --build` also starts the API container. It expects the Firestore emulator on the host at port 8080.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/chat/create` | Create or return the direct chat for two users |
| POST | `/chat/:chatId/message/send` | Append a message |
| GET | `/chat/:chatId/messages?limit=50` | Newest page, chronological order |
| POST | `/chat/:chatId/message/:messageId/read` | Mark a message read |
| POST | `/chat/:chatId/lastseen` | Store the member's last seen message |
| GET | `/user/:userId/chats` | Chats and member ids from PostgreSQL |
| POST | `/users` | Create or update a profile |
| GET | `/users/:userId` | Read a profile |
| GET | `/health` | PostgreSQL and Firestore checks |
| POST | `/chat/group` | Create a group |
| PATCH | `/chat/:chatId` | Rename a group |
| POST | `/chat/:chatId/members` | Add a group member |
| DELETE | `/chat/:chatId/members/:userId?actorId=` | Remove a member, or leave |
| GET | `/chat/:chatId` | Chat plus roles |
| PATCH | `/chat/:chatId/message/:messageId` | Edit your message |
| DELETE | `/chat/:chatId/message/:messageId` | Soft-delete your message |
| GET | `/chat/:chatId/lastseen?userId=` | Read a last-seen cursor |

`POST /chat/create` returns 200 in both cases. `created` is true only when the row was inserted. Unknown user ids are stored as users so this endpoint stands alone; `POST /users` can replace the placeholder display name later.

Deleted messages stay in the timeline with `deleted: true` and `text: null`, so order and receipts remain intact.

### Example

```bash
curl -s -X POST http://localhost:3000/chat/create \
  -H 'content-type: application/json' \
  -d '{"userAId":"asha","userBId":"vikram"}'

curl -s -X POST http://localhost:3000/chat/$CHAT_ID/message/send \
  -H 'content-type: application/json' \
  -d '{"senderId":"asha","text":"hello"}'

curl -s "http://localhost:3000/chat/$CHAT_ID/messages?limit=50"

curl -s -X POST http://localhost:3000/chat/$CHAT_ID/message/$MESSAGE_ID/read \
  -H 'content-type: application/json' \
  -d '{"userId":"vikram"}'

curl -s -X POST http://localhost:3000/chat/$CHAT_ID/lastseen \
  -H 'content-type: application/json' \
  -d '{"userId":"vikram","messageId":"'"$MESSAGE_ID"'"}'

curl -s http://localhost:3000/user/asha/chats
```

`scripts/smoke.ps1` runs the same flow on Windows. Request and response shapes are also in `openapi.yaml`.

Errors look like:

```json
{ "error": { "code": "NOT_A_MEMBER", "message": "User is not a member of this chat" } }
```

## Tests

```bash
npm test
npm run typecheck
npm run build
```

Service tests use in-memory stores, so they cover the chat rules without PostgreSQL or Firebase. Route tests cover the HTTP contract. The SQL statements themselves are not executed in CI.

## Production follow-ups

Verify the caller with Firebase Auth, rate-limit sends, and push a notification when a message is created. Unread counts can be a counter on the membership row. A composite Firestore cursor (timestamp plus document id) would make paging stable when two messages share a timestamp. Clients that need a live thread can subscribe to the message collection with rules that mirror membership; this API remains the write path.
