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

export default function MonthView({ cursor, events, onDayClick }) {
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
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {headers.map((h) => (
          <div key={h} style={{ fontWeight: 700, opacity: 0.7, textAlign: "center" }}>
            {h}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {days.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayEvents = eventsForDay(d);

          return (
            <div
              key={d.toISOString()}
              onClick={() => onDayClick(new Date(d))}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 10,
                minHeight: 90,
                cursor: "pointer",
                background: inMonth ? "white" : "#fafafa",
                opacity: inMonth ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontWeight: 700 }}>{d.getDate()}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    style={{
                      fontSize: 12,
                      padding: "4px 6px",
                      borderRadius: 8,
                      background: "#f2f2f2",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={e.title}
                  >
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>+{dayEvents.length - 3} más</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
