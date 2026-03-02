/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "recurring_events",
    {
      id: "id",
      family_id: {
        type: "integer",
        notNull: true,
        references: "families",
        onDelete: "CASCADE",
      },
      created_by: {
        type: "integer",
        references: "users",
      },
      title: { type: "text", notNull: true },
      notes: { type: "text" },
      color: { type: "text" },
      all_day: { type: "boolean", notNull: true, default: false },
      start_date: { type: "date", notNull: true },
      start_time: { type: "time", notNull: true },
      end_time: { type: "time", notNull: true },
      freq: { type: "text", notNull: true, default: "weekly" },
      interval: { type: "integer", notNull: true, default: 1 },
      byweekday: { type: "integer", notNull: true },
      until_date: { type: "date" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    },
    { ifNotExists: true }
  );

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'recurring_events_freq_check'
      ) THEN
        ALTER TABLE recurring_events
        ADD CONSTRAINT recurring_events_freq_check
        CHECK (freq = 'weekly');
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'recurring_events_interval_check'
      ) THEN
        ALTER TABLE recurring_events
        ADD CONSTRAINT recurring_events_interval_check
        CHECK (interval IN (1,2));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'recurring_events_byweekday_check'
      ) THEN
        ALTER TABLE recurring_events
        ADD CONSTRAINT recurring_events_byweekday_check
        CHECK (byweekday BETWEEN 0 AND 6);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'recurring_events_until_check'
      ) THEN
        ALTER TABLE recurring_events
        ADD CONSTRAINT recurring_events_until_check
        CHECK (until_date IS NULL OR until_date >= start_date);
      END IF;
    END;
    $$;
  `);

  pgm.createIndex("recurring_events", ["family_id", "start_date", "byweekday"], {
    name: "recurring_events_family_date_weekday_idx",
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("recurring_events", ["family_id", "start_date", "byweekday"], {
    name: "recurring_events_family_date_weekday_idx",
    ifExists: true,
  });
  pgm.dropConstraint("recurring_events", "recurring_events_freq_check", { ifExists: true });
  pgm.dropConstraint("recurring_events", "recurring_events_interval_check", { ifExists: true });
  pgm.dropConstraint("recurring_events", "recurring_events_byweekday_check", { ifExists: true });
  pgm.dropConstraint("recurring_events", "recurring_events_until_check", { ifExists: true });
  pgm.dropTable("recurring_events", { ifExists: true, cascade: true });
};
