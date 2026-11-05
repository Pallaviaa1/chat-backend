$ErrorActionPreference = 'Stop'
$base = if ($env:API_BASE) { $env:API_BASE } else { 'http://localhost:3000' }

function Send-Json($method, $path, $body) {
  return Invoke-RestMethod -Method $method -Uri "$base$path" -ContentType 'application/json' -Body ($body | ConvertTo-Json)
}

$chat = Send-Json POST '/chat/create' @{ userAId = 'asha'; userBId = 'vikram' }
Write-Host "chat $($chat.chatId) created=$($chat.created)"

$sent = Send-Json POST "/chat/$($chat.chatId)/message/send" @{ senderId = 'asha'; text = 'hello' }
Write-Host "message $($sent.messageId)"

$messages = Invoke-RestMethod -Method GET -Uri "$base/chat/$($chat.chatId)/messages?limit=50"
Write-Host "messages $($messages.messages.Count)"

$read = Send-Json POST "/chat/$($chat.chatId)/message/$($sent.messageId)/read" @{ userId = 'vikram' }
Write-Host "read at $($read.readAt)"

$seen = Send-Json POST "/chat/$($chat.chatId)/lastseen" @{ userId = 'vikram'; messageId = $sent.messageId }
Write-Host "last seen $($seen.messageId) at $($seen.updatedAt)"

$chats = Invoke-RestMethod -Method GET -Uri "$base/user/asha/chats"
Write-Host "asha chats $($chats.chats.Count)"
