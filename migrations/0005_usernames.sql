ALTER TABLE users ADD COLUMN username TEXT;

UPDATE users
SET username = 'user-' || substr(id, instr(id, '-') + 1)
WHERE username IS NULL OR trim(username) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
