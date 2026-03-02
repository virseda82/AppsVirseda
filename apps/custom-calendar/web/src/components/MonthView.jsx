import React, { useMemo } from "react";

function startOfGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const day = first.getDay(); // 0 domingo
  const mondayBased = (day + 6) % 7; // 0 lunes
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayBased);
  return gridStart;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateInputToLocalDateOnly(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateOnly(parsed);
}

function parseDateOnlyToUtcMs(input) {
  const normalized = normalizeDateInputToLocalDateOnly(input);
  if (!normalized) return null;
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

function dayToUtcMs(day) {
  return Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
}

function withAlpha(color, alpha) {
  if (typeof color !== "string") return color;
  const hex = color.trim();
  if (!hex.startsWith("#")) return color;

  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;

  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return color;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getCustodyDayColor(day, custody) {
  const config = custody?.config;
  if (!config) return null;

  const dayKey = toDateOnly(day);
  const override = (custody?.overrides || []).find((ov) => {
    const start = normalizeDateInputToLocalDateOnly(ov.start_date);
    const end = normalizeDateInputToLocalDateOnly(ov.end_date);
    if (!start || !end) return false;
    return dayKey >= start && dayKey <= end;
  });
  if (override) {
    if (override.color) return override.color;
    return override.owner === "mother" ? config.mother_color : config.father_color;
  }

  const anchorUtcMs = parseDateOnlyToUtcMs(config.anchor_monday);
  if (anchorUtcMs === null) return null;
  const dayUtcMs = dayToUtcMs(day);
  const diffDays = Math.floor((dayUtcMs - anchorUtcMs) / 86400000);
  const weekOffset = Math.floor(diffDays / 7);
  const anchorOwner = config.anchor_owner === "mother" ? "mother" : "father";
  const owner = weekOffset % 2 === 0 ? anchorOwner : (anchorOwner === "father" ? "mother" : "father");
  return owner === "mother" ? config.mother_color : config.father_color;
}

export default function MonthView({ cursor, events, onDayClick, onEventClick, custody }) {
  const gridStart = useMemo(() => startOfGrid(cursor), [cursor]);
  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [gridStart]);

  const headers = ["L", "M", "X", "J", "V", "S", "D"];

  function eventsForDay(day) {
    const dayKey = toDateOnly(day);
    return events.filter((e) => {
      const s = new Date(e.start_at);
      if (sameDay(s, day)) return true;
      if (typeof e.start_at === "string") {
        const isoDay = e.start_at.slice(0, 10);
        return isoDay === dayKey;
      }
      return false;
    });
  }

  return (
    <section className="month-view">
      <div className="month-header-row">
        {headers.map((h) => (
          <div key={h} className="month-weekday">
            {h}
          </div>
        ))}
      </div>

      <div className="month-grid">
        {days.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayEvents = eventsForDay(d);
          const isToday = sameDay(d, new Date());
          const custodyColor = getCustodyDayColor(d, custody);
          const backgroundColor = inMonth ? custodyColor : (custodyColor ? withAlpha(custodyColor, 0.45) : undefined);

          return (
            <div
              key={d.toISOString()}
              onClick={() => onDayClick(new Date(d))}
              className={`day-cell ${inMonth ? "" : "day-cell-outside"}`.trim()}
              style={{ background: backgroundColor || undefined }}
              role="button"
              tabIndex={0}
              onKeyDown={(evt) => {
                if (evt.key === "Enter" || evt.key === " ") {
                  evt.preventDefault();
                  onDayClick(new Date(d));
                }
              }}
              aria-label={`Día ${d.getDate()}`}
            >
              <div className="day-head">
                <span className={`day-number ${isToday ? "day-number-today" : ""} ${inMonth ? "" : "day-number-outside"}`.trim()}>
                  {d.getDate()}
                </span>
              </div>

              <div className="day-events">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    className="event-row"
                    title={e.title}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onEventClick?.(e);
                    }}
                  >
                    <span
                      className="event-dot"
                      style={{ backgroundColor: e.color || "#4285f4" }}
                      aria-hidden="true"
                    />
                    {e.is_recurring && <span className="recurring-marker" aria-hidden="true">↻</span>}
                    <span className="event-text">{e.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="more-events-link">+{dayEvents.length - 3} más</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
