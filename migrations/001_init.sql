CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_display_name_len CHECK (char_length(display_name) BETWEEN 1 AND 80),
  CONSTRAINT users_email_key UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  direct_key TEXT,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chats_type_chk CHECK (type IN ('direct', 'group')),
  CONSTRAINT chats_shape_chk CHECK (
    (type = 'direct' AND direct_key IS NOT NULL AND title IS NULL)
    OR (type = 'group' AND direct_key IS NULL AND title IS NOT NULL)
  ),
  CONSTRAINT chats_title_len CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT chats_direct_key_key UNIQUE (direct_key)
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id UUID NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id),
  CONSTRAINT chat_members_role_chk CHECK (role IN ('owner', 'admin', 'member'))
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members (user_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats (updated_at DESC);
