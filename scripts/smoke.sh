#!/usr/bin/env bash
set -euo pipefail
base="${API_BASE:-http://localhost:3000}"

chat=$(curl -s -X POST "$base/chat/create" \
  -H 'content-type: application/json' \
  -d '{"userAId":"asha","userBId":"vikram"}')
echo "$chat"
chat_id=$(printf '%s' "$chat" | sed -n 's/.*"chatId":"\([^"]*\)".*/\1/p')

message=$(curl -s -X POST "$base/chat/$chat_id/message/send" \
  -H 'content-type: application/json' \
  -d '{"senderId":"asha","text":"hello"}')
echo "$message"
message_id=$(printf '%s' "$message" | sed -n 's/.*"messageId":"\([^"]*\)".*/\1/p')

curl -s "$base/chat/$chat_id/messages?limit=50"
echo
curl -s -X POST "$base/chat/$chat_id/message/$message_id/read" \
  -H 'content-type: application/json' \
  -d '{"userId":"vikram"}'
echo
curl -s -X POST "$base/chat/$chat_id/lastseen" \
  -H 'content-type: application/json' \
  -d "{\"userId\":\"vikram\",\"messageId\":\"$message_id\"}"
echo
curl -s "$base/user/asha/chats"
echo
