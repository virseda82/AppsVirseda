import React, { useEffect, useState } from "react";

function pad(n) {
  return String(n).padStart(2, "0");
}
function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EventModal({ open, date, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (!open) return;
    const base = date ? new Date(date) : new Date();
    base.setHours(18, 0, 0, 0);
    const endD = new Date(base);
    endD.setHours(base.getHours() + 1);

    setTitle("");
    setNotes("");
    setAllDay(false);
    setStart(toLocalInputValue(base));
    setEnd(toLocalInputValue(endD));
  }, [open, date]);

  if (!open) return null;

  async function submit() {
    if (!title.trim()) return alert("Título requerido");
    const startAt = new Date(start).toISOString();
    const endAt = new Date(end).toISOString();

    await onCreate({
      title: title.trim(),
      notes: notes.trim(),
      startAt,
      endAt,
      allDay,
      color: null,
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{ width: 420, background: "white", borderRadius: 14, padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Nuevo evento</h3>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Título</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Notas</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Todo el día (MVP)
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Inicio</div>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Fin</div>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: 10 }}>Cancelar</button>
          <button onClick={submit} style={{ padding: 10 }}>Crear</button>
        </div>
      </div>
    </div>
  );
}
