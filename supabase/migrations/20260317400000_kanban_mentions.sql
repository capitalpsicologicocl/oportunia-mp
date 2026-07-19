-- Kanban responsable mentions + user-scoped notifications

ALTER TYPE notification_tipo ADD VALUE IF NOT EXISTS 'mencion';

ALTER TABLE kanban_cards
  ADD COLUMN IF NOT EXISTS responsable_user_id uuid REFERENCES org_users(id) ON DELETE SET NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS kanban_card_id uuid REFERENCES kanban_cards(id) ON DELETE SET NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES org_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_inbox
  ON notifications (organization_id, user_id, leida, created_at DESC);
