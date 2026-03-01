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

function getCustodyDayColor(day, custody) {
  const config = custody?.config;
  if (!config) return null;

  const dayKey = toDateOnly(day);
  const override = (custody?.overrides || []).find((ov) => dayKey >= String(ov.start_date).slice(0, 10) && dayKey <= String(ov.end_date).slice(0, 10));
  if (override) {
    if (override.color) return override.color;
    return override.owner === "mother" ? config.mother_color : config.father_color;
  }

  const anchor = new Date(`${String(config.anchor_monday).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return null;
  const diffDays = Math.floor((new Date(day.getFullYear(), day.getMonth(), day.getDate()) - anchor) / 86400000);
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
    return events.filter((e) => {
      const s = new Date(e.start_at);
      return sameDay(s, day);
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

          return (
            <div
              key={d.toISOString()}
              onClick={() => onDayClick(new Date(d))}
              className={`day-cell ${inMonth ? "" : "day-cell-outside"}`.trim()}
              style={{ background: getCustodyDayColor(d, custody) || undefined }}
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
                <span className={`day-number ${isToday ? "day-number-today" : ""}`}>
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
