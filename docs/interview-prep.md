# Interview prep: this chat backend

Read this out loud once. Then answer the questions in section 8 without looking. The goal is to explain the project you have, not to pretend you have used Firebase for years.

Repo: https://github.com/Pallaviaa1/chat-backend

## 1. The 60-second answer

If they say "walk me through your project," say this:

> I built a chat backend in Node.js and TypeScript. Users, chats, and who belongs to a chat are in MySQL, because that data needs unique keys and joins. Messages, read receipts, and last-seen cursors are in Cloud Firestore, because that data is a growing timeline of writes. The API supports one-to-one chat, sending a message, listing messages in time order, marking a message read, saving the last message a user has seen, and listing a user's chats. I also added group chats and edit or soft-delete of a message. A direct chat is created once per pair of users. If the same two people call create again, they get the same chat id.

Stop there. Let them ask the next question.

## 2. Picture of the system

```text
Client
  |
  | HTTP JSON
  v
Express routes          check the body with Zod
  |
  v
Services                rules: must be a member, only the sender can edit
  |
  +--> MySQL            users, chats, chat_members
  |
  +--> Firestore        messages, reads, lastSeen
```

Say "route, service, repository" if they ask about structure.

| Folder | What it does | One sentence |
| --- | --- | --- |
| `src/routes` | HTTP | URL, status code, JSON in and out |
| `src/services` | Rules | Who is allowed to do what |
| `src/repositories` | Database | The actual MySQL or Firestore calls |
| `src/stores` | Interfaces | The service depends on a contract, not on MySQL itself |
| `migrations` | Tables | SQL that creates the MySQL tables |

Why the split matters: the tests can use an in-memory fake database and still check the rules. They do not need MySQL or Firebase running. That is why `npm test` passes with no credentials.

## 3. Why two databases

This is the question they will ask. Answer it in this order.

MySQL is good when the shape is fixed and you need rules the database itself enforces:

- A user id is unique.
- A direct chat between A and B must exist only once. The column `direct_key` is unique.
- "Show me every chat this user is in" is a join from `chat_members` to `chats`.

Firestore is good when you mostly append documents and read them by time:

- Each message is its own document.
- A read receipt is a small document under that message.
- Last seen is one document per member, so two people updating "what I have seen" do not overwrite each other.

You do not put messages in MySQL here because the task asked for Firestore for messages and receipts. You also would not put membership only in Firestore, because "these two users already have a chat" is a uniqueness problem, and MySQL unique keys are the straightforward tool.

If they ask "could you do it all in one database?": yes. MySQL can store messages. Firestore can store members. The split matches the access pattern and the task.

## 4. Firestore, from zero, using only this project

Firestore is a document database from Google, inside Firebase. You do not create tables. You create documents at a path.

A document is a JSON object. A collection is a list of documents.

Paths in this project:

```text
chats/{chatId}/messages/{messageId}
chats/{chatId}/messages/{messageId}/reads/{userId}
chats/{chatId}/lastSeen/{userId}
```

Example message document:

```json
{
  "senderId": "asha",
  "text": "hello",
  "createdAt": "<server time>",
  "editedAt": null,
  "deleted": false,
  "readBy": ["vikram"]
}
```

Words you must be able to say:

| Word | Meaning in this project |
| --- | --- |
| Firebase | Google's product family. We use one part of it: Firestore. |
| Firestore | The document database. |
| Admin SDK | Server library `firebase-admin`. Our Node process uses it. The browser does not talk to Firestore. |
| Collection | A folder of documents. `messages` is a collection. |
| Document | One record. One message is one document. |
| Subcollection | A collection inside a document. `reads` lives under one message. |
| Server timestamp | `FieldValue.serverTimestamp()`. Firestore writes the time. The client cannot send a fake time and jump the order. |
| Emulator | A local Firestore on `127.0.0.1:8080`. No Google account. This is what `.env` uses. |
| Service account | A key file for a real Firebase project. Email plus private key. We do not need it when the emulator host is set. |
| Security rules | `firestore.rules` denies all client access. The Admin SDK bypasses rules. That is intentional: only our API writes data. |

### How a message is saved

In `src/repositories/messageRepository.ts`:

1. Create a new document id with `.doc()` and no id argument. Firestore generates the id.
2. `set` the fields. `createdAt` is a server timestamp.
3. Read the document back so the response includes the real time.

### How messages are ordered

The query is:

```text
orderBy createdAt descending, limit 50
```

That returns the newest 50, newest first. The code then reverses them, so the API returns oldest-of-that-page first. A chat screen draws top to bottom that way.

`nextCursor` is the time of the oldest message in the page. The next request passes it as `before`. The query uses `startAfter` that time, which means "older than this."

Say this if they ask about paging: "I page by timestamp. If two messages had the exact same timestamp, a cursor of timestamp plus document id would be safer. I would do that in production."

### Read receipt

Two writes, on purpose:

1. `messages/{messageId}/reads/{userId}` stores `readAt`. This is the receipt.
2. `readBy` on the message is a list of user ids. Listing 50 messages can show who read them without 50 extra queries.

The list on the message is a copy for fast reads. The subcollection is the source of truth.

### Last seen

`lastSeen/{userId}` stores `messageId` and `updatedAt`. It is not on the chat document. If it were one field on the chat, every member's update would write the same document.

### What Firestore is not, in this project

- It is not the login system. We did not use Firebase Authentication.
- The mobile app does not listen to Firestore directly. It calls our HTTP API.
- There is no file upload and no push notification.

If they ask "what is Firebase Auth?": it verifies a user token. This API currently trusts the `userId` in the JSON body because the task defined the API that way. Membership is still checked. In production you would verify a token and ignore the id from the body.

## 5. TypeScript, from zero, using only this project

TypeScript is JavaScript plus types. `tsc` checks the types. Node runs the compiled JavaScript. `"strict": true` in `tsconfig.json` means missing types and sloppy nulls are errors.

You do not need the whole language. Know these, because they are in the code.

### A type describes a value

```ts
interface StoredMessage {
  id: string;
  text: string | null;
  deleted: boolean;
  readBy: string[];
}
```

`string | null` means the text can be missing. A deleted message has `text: null`.

### `interface` vs the class

`ChatApi` is a list of methods. `ChatService` is the class that implements them. The route accepts `ChatApi`, so a test can pass a fake object with the same methods. That is why route tests do not start MySQL.

### `import type`

`import type { Pool }` means "this is only a type, delete it from the JavaScript." It keeps the compiled file from loading a module just for a type.

### Zod is the runtime check

TypeScript disappears after compile. A client can still send `{ "text": 5 }`. Zod checks the real JSON:

- user id: 1 to 128 characters, limited charset
- message text: 1 to 4000 characters after trim
- chat id: UUID
- `limit`: number from 1 to 100, default 50

If Zod fails, the API returns 400 and `VALIDATION_ERROR`.

### `async` / `await`

The database calls return a Promise. `await` waits for them. `asyncHandler` catches a thrown error and sends it to the error handler, so a failed query becomes JSON instead of a crashed request.

### `AppError`

Business failures are thrown as `AppError` with an HTTP status and a code such as `NOT_A_MEMBER` or `CHAT_NOT_FOUND`. Unknown errors become 500 and the real database error is logged, not sent to the client.

### `.js` at the end of imports

`import { ChatService } from './chatService.js'` is the Node ESM rule. The source file is `.ts`. TypeScript emits `.js`. The import path matches the output file.

If they ask "what is strict mode?": the compiler rejects implicit `any`, unused locals, and unchecked array access. It does not change how Express works.

## 6. MySQL, the parts you should defend

Tables:

- `users` — id, display name, email
- `chats` — direct or group, title, `direct_key`
- `chat_members` — which user is in which chat, and the role: owner, admin, or member

`direct_key` is not `userA + userB` with a colon. Ids are encoded and sorted, so `create(asha, vikram)` and `create(vikram, asha)` produce the same key. A unique index then makes the second insert impossible.

Two requests at the same moment could both see "no chat" and both insert. The code takes a MySQL named lock, `GET_LOCK`, on a hash of that key, then checks and inserts inside a transaction. The lock is released before the connection goes back to the pool.

`POST /chat/create` with unknown user ids still works. Those ids are inserted as users with the id as a placeholder name. `POST /users` can later set a real display name without wiping it on the next chat create. The insert uses `ON DUPLICATE KEY UPDATE id = id`, which means "if the user exists, do not change the name."

Group rules worth saying:

- The creator is the owner.
- Only an owner or admin can rename or add people.
- A member can leave.
- The owner cannot be removed.
- A direct chat cannot gain or lose members.

Delete of a message is a soft delete. The document stays, `deleted` becomes true, and `text` becomes null. The timeline order does not collapse.

## 7. The endpoints, from memory

Required:

| Call | Body | You return |
| --- | --- | --- |
| `POST /chat/create` | `userAId`, `userBId` | `chatId`, `created` |
| `POST /chat/:chatId/message/send` | `senderId`, `text` | the message, status 201 |
| `GET /chat/:chatId/messages?limit=50` | | `messages`, `nextCursor` |
| `POST /chat/:chatId/message/:messageId/read` | `userId` | `readAt` |
| `POST /chat/:chatId/lastseen` | `userId`, `messageId` | `updatedAt` |
| `GET /user/:userId/chats` | | chats with `memberIds` |

Extra, if they ask:

- `POST /users`, `GET /users/:userId`
- `POST /chat/group`, add member, remove member, rename
- `PATCH` and `DELETE` on a message
- `GET /health` — `mysql` and `firestore` are `up` or `down`

Same pair, second create: HTTP 200, `created: false`, same `chatId`.

Send when the sender is not a member: 403 `NOT_A_MEMBER`.

Edit someone else's message: 403 `NOT_SENDER`.

Edit after delete: 409 `MESSAGE_DELETED`.

## 8. Practice questions

Say the answer in two or three sentences. Then stop.

**Why TypeScript?**
The compiler catches a wrong field name before the server runs. Zod still checks the HTTP body, because types do not exist at runtime.

**Why not store messages in MySQL?**
The task stores messages and receipts in Firestore. It also fits: messages are append-only documents ordered by time. Membership stays in MySQL because of the unique direct chat and the join for "my chats."

**How do you stop two direct chats for the same people?**
A canonical `direct_key`, a unique index, and `GET_LOCK` around the check and insert.

**How is message order decided?**
Firestore server timestamp, not the time on the user's phone. The list query sorts by that field.

**What is a read receipt?**
A document at `reads/{userId}` plus that user id added to `readBy` on the message. The second copy makes the message list cheap.

**What is last seen?**
The latest message id a member has caught up to. One document per user under the chat.

**Is the user id authenticated?**
No. The task sends `userId` in the body. I still check that this id is a member before send, read, or last seen. Production would use Firebase Auth or another token and take the user id from the token.

**What happens if MySQL is up and Firestore is down?**
`GET /health` returns 503 and `firestore: down`. Sending a message fails. Listing chats can still work, because that query is only MySQL.

**How do you test without Firebase?**
Services are tested with in-memory stores that implement the same interfaces. HTTP tests use fake services and Supertest. The SQL file is checked for the table names. I have not run the SQL against a live MySQL server in CI.

**What would you add next?**
Verify the caller. Rate-limit sends. Store unread counts on the membership row. Page with timestamp plus document id. Optionally let the client listen to Firestore for a live thread, with rules that match membership.

**Explain soft delete.**
The message stays so the order and old receipts remain. The API returns `deleted: true` and `text: null`.

**What is the emulator?**
A local Firestore process. `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. If that variable is set, the server ignores a service account so a laptop cannot write to a real project by mistake.

**What is in the service account?**
`client_email` and `private_key` for a real Firebase project, plus `FIREBASE_PROJECT_ID`. It is a password. It stays in `.env` and is not committed.

## 9. Scenario questions

An interviewer describes a situation and waits. Use this order every time:

1. Say what the code does now.
2. Say the HTTP status and the error code when there is one.
3. If they ask "what would you change?", say one production improvement and stop.

Names used below: Asha and Vikram are the two people. Meera is someone else.

### Two people start a chat at the same moment

**They ask:** Asha and Vikram both tap "message" at the same second. Do you get two chats?

**You say:** No. Both user ids are sorted into one `direct_key`. MySQL has a unique key on that column. The create also takes a named lock, `GET_LOCK`, so the two requests cannot both pass the "does this chat exist?" check. One insert wins. The other request finds that row and returns the same `chatId` with `created: false`. Both responses are HTTP 200.

### They tap the same chat again tomorrow

**They ask:** Asha opens Vikram's profile again and starts a chat. What do you return?

**You say:** `POST /chat/create` with the same two ids. The key matches the existing row, so no second chat is inserted. The client gets the old `chatId` and `created: false`. Order of the ids does not matter. `create(asha, vikram)` and `create(vikram, asha)` are the same chat.

### Asha tries to chat with herself

**They ask:** The client sends `userAId` and `userBId` both equal to `asha`.

**You say:** Zod rejects it before any database call. HTTP 400, code `VALIDATION_ERROR`. The message says the two ids must be different.

### Asha sends "hello"

**They ask:** Walk through one send.

**You say:** `POST /chat/:chatId/message/send` with `senderId: asha` and `text: hello`. The route validates the body. The service loads the chat from MySQL and checks Asha is a member. Then Firestore creates `chats/{chatId}/messages/{newId}` with a server timestamp, not the phone's clock. After that, MySQL `updated_at` on the chat is bumped so Asha's chat list can sort this chat to the top. The response is 201 and includes `messageId` and `createdAt`.

### The sender is not in the chat

**They ask:** Meera has the chat id and calls send.

**You say:** The chat is loaded. Meera is not in `chat_members`. The service throws before Firestore is written. HTTP 403, code `NOT_A_MEMBER`.

### Vikram was offline and then opens the thread

**They ask:** There are 10 messages. What does the app call, and in what order are they shown?

**You say:** `GET /chat/:chatId/messages?limit=50`. Firestore returns the newest page, then the API reverses it, so the JSON is oldest-first inside that page. Vikram's screen draws that array from top to bottom. There is no socket in this project. The app asks again when it wants new messages.

### There are 200 messages

**They ask:** The phone cannot load all of them. How does paging work?

**You say:** The first call with `limit=50` returns the newest 50, oldest of those 50 first. `nextCursor` is the `createdAt` of the oldest message in that page. The next call sends `before` set to that cursor. The Firestore query is "older than this time." When a page comes back shorter than `limit`, that is the end. If the total is an exact multiple of 50, the client may get one empty page after the last full page.

### Two messages get the same timestamp

**They ask:** Is the cursor perfect?

**You say:** The cursor is the timestamp only. If two messages shared that exact time, `startAfter` on the timestamp can skip both. It is rare with a server timestamp, but production paging should use the timestamp and the document id together.

### Vikram marks the message read

**They ask:** What is stored, and can he do it twice?

**You say:** He must be a member, and the message must exist. Firestore writes `reads/vikram` with `readAt`, and adds `vikram` to `readBy` on the message. Doing it again is safe. `arrayUnion` does not duplicate the id. HTTP 200 both times. Meera doing it gets 403 `NOT_A_MEMBER`. A missing message gets 404 `MESSAGE_NOT_FOUND`.

### Vikram closes the app on a specific message

**They ask:** How do you remember where he stopped?

**You say:** `POST /chat/:chatId/lastseen` with his user id and that message id. The message has to exist in this chat. Firestore stores `lastSeen/vikram` with that message id. It is its own document, so Asha updating her cursor does not overwrite his. If he never set one, `GET` last seen returns 404 `LAST_SEEN_NOT_FOUND`.

### Asha edits, then deletes

**They ask:** She fixes a typo, then deletes the message. Vikram tries to edit it after that.

**You say:** Edit is `PATCH` with her `senderId` and the new text. Only the sender can do it, and the message must not already be deleted. Firestore updates `text` and sets `editedAt`. Delete is a soft delete: the document stays, `deleted` becomes true, and `text` becomes null, so the list order does not jump. A second delete returns that same deleted message. It does not error. An edit after delete is HTTP 409 `MESSAGE_DELETED`. Vikram editing Asha's message is HTTP 403 `NOT_SENDER`.

### The client sends blank text

**They ask:** `text` is `"   "` or missing.

**You say:** Zod trims the string and requires 1 to 4000 characters. Spaces only fail that check. HTTP 400 `VALIDATION_ERROR`. Nothing is written.

### The chat id in the URL is garbage

**They ask:** The id is `abc` instead of a UUID.

**You say:** The path parameter is checked as a UUID. HTTP 400 `VALIDATION_ERROR`. An id that is a UUID but not in MySQL is HTTP 404 `CHAT_NOT_FOUND`.

### Someone lists chats for a user who was never created

**They ask:** `GET /user/nobody/chats`.

**You say:** The query is "membership rows for this id." There are none, so the response is 200 and `chats: []`. It is not a 404. A 404 would mean we looked up the user first. This endpoint does not.

### Asha already has a display name, then a chat is created

**They ask:** She was saved as "Asha" through `POST /users`. Later someone creates a chat with her id. Does her name become the raw id?

**You say:** No. Create-chat inserts missing users only. The SQL is `INSERT ... ON DUPLICATE KEY UPDATE id = id`, which does not change `display_name` when the row already exists. Vikram, if he did not exist, is created with his id as the placeholder name.

### Two groups with the same people

**They ask:** The owner creates "Launch" twice with the same members. Is the second one ignored, like a direct chat?

**You say:** No. Only direct chats are deduplicated. Each `POST /chat/group` inserts a new chat. Groups do not have a `direct_key`. If the product wanted one group per name, that would be a new rule. It is not in this API.

### A normal member tries to run the group

**They ask:** Vikram is only a member. He tries to rename the group, add Meera, and then leave.

**You say:** Rename and add require owner or admin. He gets HTTP 403 `FORBIDDEN`. Leaving is allowed, because the actor and the target are the same person and he is not the owner. That delete returns 204. He cannot remove the owner. That is HTTP 400 `OWNER_REQUIRED`. An admin cannot remove another admin. That is 403 `FORBIDDEN`.

### Someone tries to add a third person to a direct chat

**They ask:** Asha and Vikram have a direct chat. Asha calls add-member with Meera.

**You say:** Direct membership is fixed. HTTP 400 `DIRECT_CHAT_LOCKED`. If they need three people, that is a group chat, created with `POST /chat/group`.

### The phone retries the send because the network blinked

**They ask:** The server saved the message, but the phone never got the 201, so it sends the same text again. Do you have one message or two?

**You say:** Two. Send always creates a new Firestore document. There is no client message id. I would fix that by letting the client send an id and using that id as the Firestore document id. A retry would write the same document instead of a second "hello."

### Firestore saves the message, then MySQL fails while updating the chat time

**They ask:** Is the message lost?

**You say:** No. The message is already in Firestore. The `updated_at` bump is wrapped so a MySQL failure is logged and the API still returns the message. The chat might not move to the top of the list until a later message updates that time. I would rather return the message than make the client retry and create a duplicate.

### MySQL is up and Firestore is down

**They ask:** What still works?

**You say:** `GET /health` is 503, with `mysql: up` and `firestore: down`. Listing chats still works, because that read is only MySQL. Send, message list, mark read, and last seen fail, because those touch Firestore. Create-chat still works, because a new direct chat does not write a message.

### The laptop has a real Firebase key and the emulator setting

**They ask:** Which database gets the writes?

**You say:** The emulator. If `FIRESTORE_EMULATOR_HOST` is set, the server does not use the service account. That is so a local run cannot write into a live project by accident. A real project needs the emulator variable removed, plus `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.

### A stranger knows the chat id

**They ask:** Can they read the messages?

**You say:** Send, mark-read, and last-seen all require membership. The message list currently checks that the chat exists and does not check membership. Anyone who can call the API and knows the UUID can list messages. I would require a member id on that GET before production. I should say that before they find it.

### The client sends Vikram's id while the human is Asha

**They ask:** What stops her from marking his messages read as him?

**You say:** Nothing in this version. The task's API puts the user id in the body, and the server trusts it. Membership is checked for that id, but the id itself is not proven. Production would verify a Firebase Auth token, or any other token, and take the user id from the token. The body id would be ignored.

### How many unread messages does Vikram have?

**They ask:** The product manager wants a badge on the chat.

**You say:** It is not built. The pieces that exist are last seen and message time. I would store an unread count on the `chat_members` row: increment it when someone else sends, and set it to zero when this user updates last seen. Counting by reading every Firestore message on each chat-list call would get slow.

### The app needs messages to appear without refreshing

**They ask:** Where is the realtime listener?

**You say:** There isn't one. This is a request/response API. The client polls `GET /messages`. A later version could let the client listen to the Firestore `messages` collection, but then security rules would have to allow that read only for members. Today the rules deny all client access, and only the server Admin SDK writes.

### Design a test for the direct-chat race without telling them the code

**They ask:** How would you test "two creates, one chat"?

**You say:** Call create twice with the ids flipped and expect one `chatId`. That test already runs on an in-memory store. For the real race I would start two MySQL transactions at once against the same pair and expect one row in `chats` and two rows in `chat_members`. The automated suite does not open MySQL, so I would describe that as a gap, not as a test I already ran.

## 10. If you do not know the answer

Use this shape:

> I have not done that part. In this project I did X. If I needed Y, I would look at Z.

Examples:

- "Have you used Firebase Cloud Functions?" — "No. This API is a long-running Node server. Functions would be another way to host the same handlers."
- "Have you used security rules in production?" — "Here the rules deny every client. The server uses the Admin SDK, which bypasses rules. If the app read Firestore directly, the rules would have to check membership."
- "What is a composite index?" — "This query sorts on one field, `createdAt`, so the automatic single-field index is enough. A filter plus a different sort would need a composite index in `firestore.indexes.json`."

Do not invent a Firebase feature you did not use. The honest version above sounds stronger than a vague answer.

## 11. Five files to open before the interview

Read only these, in order. You should be able to point at them on a screen.

1. `README.md` — the picture and the endpoint table.
2. `src/routes/chatRoutes.ts` — the URLs.
3. `src/services/messageService.ts` — member check, then the database call.
4. `src/repositories/messageRepository.ts` — the Firestore paths.
5. `migrations/001_init.sql` — the three MySQL tables and `chats_direct_key_key`.

If they ask you to trace "send a message," the path is:

`chatRoutes` → `MessageService.send` → membership check → `FirestoreMessageRepository.create` → `chats.touch` so the chat list sorts by recent activity.

## 12. Words to pronounce correctly

| Word | Say it as |
| --- | --- |
| Firestore | "fire-store" |
| Firebase | "fire-base" |
| TypeScript | "type-script" |
| MySQL | "my-sequel" |
| UUID | "you-you-id" |
| schema | "skee-ma" |
| Zod | "zod" |
| idempotent | "creating it twice does not create two chats" |

You can say "creating it twice returns the same chat" and skip the word idempotent if it feels unnatural.

## 13. One-hour study plan

1. Read section 1 and say it once without notes. (10 min)
2. Draw the two-database picture on paper from memory. (10 min)
3. Read section 4 and explain a message path and a read receipt to an empty room. (10 min)
4. Answer every question in section 8 out loud. (10 min)
5. Do the scenarios in section 9 out loud. Cover the race, the send, the stranger, the retry, and the unread badge. (15 min)
6. Open the five files in section 11 and find the function you just described. (5 min)

You are ready when you can explain, without notes, why MySQL and Firestore are both here and what happens when Asha sends "hello" to Vikram.
