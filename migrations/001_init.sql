CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  email VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY users_email_key (email),
  CONSTRAINT users_display_name_len CHECK (CHAR_LENGTH(display_name) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS chats (
  id CHAR(36) NOT NULL,
  type VARCHAR(16) NOT NULL,
  title VARCHAR(80) NULL,
  direct_key VARCHAR(512) NULL,
  created_by VARCHAR(128) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY chats_direct_key_key (direct_key),
  KEY idx_chats_updated_at (updated_at),
  CONSTRAINT chats_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT chats_type_chk CHECK (type IN ('direct', 'group')),
  CONSTRAINT chats_shape_chk CHECK (
    (type = 'direct' AND direct_key IS NOT NULL AND title IS NULL)
    OR (type = 'group' AND direct_key IS NULL AND title IS NOT NULL)
  ),
  CONSTRAINT chats_title_len CHECK (title IS NULL OR CHAR_LENGTH(title) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id CHAR(36) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (chat_id, user_id),
  KEY idx_chat_members_user_id (user_id),
  CONSTRAINT chat_members_chat_fk FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
  CONSTRAINT chat_members_user_fk FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chat_members_role_chk CHECK (role IN ('owner', 'admin', 'member'))
);
