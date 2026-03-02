/* eslint-disable camelcase */
exports.shorthands = undefined;

const DEFAULT_FATHER_COLOR = "#dbeafe";
const DEFAULT_MOTHER_COLOR = "#f3e8ff";
const DEFAULT_ANCHOR_MONDAY = "2026-03-02";
const DEFAULT_ANCHOR_OWNER = "father";

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6';
  `);

  pgm.createTable(
    "custody_config",
    {
      family_id: {
        type: "integer",
        primaryKey: true,
        references: "families",
        onDelete: "CASCADE",
      },
      anchor_monday: { type: "date", notNull: true, default: DEFAULT_ANCHOR_MONDAY },
      anchor_owner: { type: "text", notNull: true, default: DEFAULT_ANCHOR_OWNER },
      father_color: { type: "text", notNull: true, default: DEFAULT_FATHER_COLOR },
      mother_color: { type: "text", notNull: true, default: DEFAULT_MOTHER_COLOR },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    },
    { ifNotExists: true }
  );

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'custody_config_anchor_owner_check'
      ) THEN
        ALTER TABLE custody_config
        ADD CONSTRAINT custody_config_anchor_owner_check
        CHECK (anchor_owner IN ('father','mother'));
      END IF;
    END;
    $$;
  `);

  pgm.createTable(
    "custody_overrides",
    {
      id: "id",
      family_id: {
        type: "integer",
        notNull: true,
        references: "families",
        onDelete: "CASCADE",
      },
      start_date: { type: "date", notNull: true },
      end_date: { type: "date", notNull: true },
      owner: { type: "text", notNull: true },
      color: { type: "text" },
      notes: { type: "text" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    },
    { ifNotExists: true }
  );

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'custody_overrides_owner_check'
      ) THEN
        ALTER TABLE custody_overrides
        ADD CONSTRAINT custody_overrides_owner_check
        CHECK (owner IN ('father','mother'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'custody_overrides_date_check'
      ) THEN
        ALTER TABLE custody_overrides
        ADD CONSTRAINT custody_overrides_date_check
        CHECK (end_date >= start_date);
      END IF;
    END;
    $$;
  `);

  pgm.createIndex("custody_overrides", ["family_id", "start_date", "end_date"], {
    name: "custody_overrides_family_dates_idx",
    ifNotExists: true,
  });

  pgm.sql(`
    INSERT INTO custody_config (family_id, anchor_monday, anchor_owner, father_color, mother_color)
    SELECT f.id, '${DEFAULT_ANCHOR_MONDAY}'::date, '${DEFAULT_ANCHOR_OWNER}', '${DEFAULT_FATHER_COLOR}', '${DEFAULT_MOTHER_COLOR}'
    FROM families f
    ON CONFLICT (family_id) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.dropIndex("custody_overrides", ["family_id", "start_date", "end_date"], {
    name: "custody_overrides_family_dates_idx",
    ifExists: true,
  });
  pgm.dropConstraint("custody_overrides", "custody_overrides_owner_check", { ifExists: true });
  pgm.dropConstraint("custody_overrides", "custody_overrides_date_check", { ifExists: true });
  pgm.dropTable("custody_overrides", { ifExists: true, cascade: true });
  pgm.dropConstraint("custody_config", "custody_config_anchor_owner_check", { ifExists: true });
  pgm.dropTable("custody_config", { ifExists: true, cascade: true });
  pgm.dropColumn("users", "color", { ifExists: true });
};
