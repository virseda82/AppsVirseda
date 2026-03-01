/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "users",
    {
      id: "id",
      email: { type: "text", notNull: true, unique: true },
      name: { type: "text" },
      password_hash: { type: "text", notNull: true },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "families",
    {
      id: "id",
      name: { type: "text", notNull: true },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "family_members",
    {
      family_id: {
        type: "integer",
        notNull: true,
        references: "families",
        onDelete: "CASCADE",
      },
      user_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      role: { type: "text", notNull: true },
    },
    {
      ifNotExists: true,
      constraints: {
        primaryKey: ["family_id", "user_id"],
      },
    }
  );

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'family_members_role_check'
      ) THEN
        ALTER TABLE family_members
        ADD CONSTRAINT family_members_role_check
        CHECK (role IN ('owner','editor','reader'));
      END IF;
    END;
    $$;
  `);

  pgm.createTable(
    "events",
    {
      id: "id",
      family_id: {
        type: "integer",
        notNull: true,
        references: "families",
        onDelete: "CASCADE",
      },
      title: { type: "text", notNull: true },
      notes: { type: "text" },
      start_at: { type: "timestamptz", notNull: true },
      end_at: { type: "timestamptz", notNull: true },
      all_day: { type: "boolean", notNull: true, default: false },
      color: { type: "text" },
      created_by: {
        type: "integer",
        references: "users",
      },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    },
    { ifNotExists: true }
  );

  pgm.createIndex("events", ["family_id", "start_at"], {
    name: "events_family_start_idx",
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("events", ["family_id", "start_at"], {
    name: "events_family_start_idx",
    ifExists: true,
  });
  pgm.dropConstraint("family_members", "family_members_role_check", { ifExists: true });
  pgm.dropTable("events", { ifExists: true, cascade: true });
  pgm.dropTable("family_members", { ifExists: true, cascade: true });
  pgm.dropTable("families", { ifExists: true, cascade: true });
  pgm.dropTable("users", { ifExists: true, cascade: true });
};
