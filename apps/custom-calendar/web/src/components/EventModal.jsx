import React, { useEffect, useState } from "react";

function pad(n) {
  return String(n).padStart(2, "0");
}
function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EventModal({ open, date, event, onClose, onCreate, onUpdate, onDelete }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const isEditMode = !!event?.id;

  useEffect(() => {
    if (!open) return;
    if (event?.id) {
      setTitle(event.title || "");
      setNotes(event.notes || "");
      setAllDay(!!event.all_day);
      setStart(toLocalInputValue(new Date(event.start_at)));
      setEnd(toLocalInputValue(new Date(event.end_at)));
      return;
    }

    const base = date ? new Date(date) : new Date();
    base.setHours(18, 0, 0, 0);
    const endD = new Date(base);
    endD.setHours(base.getHours() + 1);

    setTitle("");
    setNotes("");
    setAllDay(false);
    setStart(toLocalInputValue(base));
    setEnd(toLocalInputValue(endD));
  }, [open, date, event]);

  if (!open) return null;

  async function submit() {
    if (!title.trim()) return alert("Título requerido");
    const startAt = new Date(start).toISOString();
    const endAt = new Date(end).toISOString();

    const payload = {
      title: title.trim(),
      notes: notes.trim(),
      startAt,
      endAt,
      allDay,
      color: event?.color || null,
    };

    if (isEditMode) {
      await onUpdate(payload);
      return;
    }
    await onCreate(payload);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>
        <div className="event-modal-header">
          <h3>{isEditMode ? "Editar evento" : "Nuevo evento"}</h3>
        </div>

        <label className="form-field">
          <span>Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="form-field">
          <span>Notas</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          <span>Todo el día (MVP)</span>
        </label>

        <div className="datetime-grid">
          <label className="form-field">
            <span>Inicio</span>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>

          <label className="form-field">
            <span>Fin</span>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          {isEditMode && (
            <button type="button" className="danger-btn" onClick={onDelete}>Eliminar</button>
          )}
          <button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary-btn" onClick={submit}>
            {isEditMode ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
