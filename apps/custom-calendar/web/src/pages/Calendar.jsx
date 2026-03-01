import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import MonthView from "../components/MonthView.jsx";
import EventModal from "../components/EventModal.jsx";

function isoStartOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function isoStartOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}

export default function CalendarPage({ onLogout }) {
  const [families, setFamilies] = useState([]);
  const [familyId, setFamilyId] = useState(null);

  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(null);

  const monthLabel = useMemo(() => {
    return cursor.toLocaleString("es-ES", { month: "long", year: "numeric" });
  }, [cursor]);

  async function loadFamilies() {
    const r = await api.listFamilies();
    setFamilies(r.families);
    if (!familyId && r.families[0]) setFamilyId(r.families[0].id);
  }

  async function loadEvents(fid, date) {
    if (!fid) return;
    const from = isoStartOfMonth(date);
    const to = isoStartOfNextMonth(date);
    const r = await api.listEvents(fid, from, to);
    setEvents(r.events);
  }

  useEffect(() => { loadFamilies(); }, []);
  useEffect(() => { if (familyId) loadEvents(familyId, cursor); }, [familyId, cursor]);

  async function createFamilyQuick() {
    const name = prompt("Nombre familia (ej. Familia Oli):");
    if (!name) return;

    const memberEmails = prompt("Emails miembros (coma). Deben estar registrados antes:");
    const members = (memberEmails || "")
      .split(",").map((e) => e.trim()).filter(Boolean)
      .map((email, idx) => ({ email, role: idx === 0 ? "editor" : "reader" }));

    await api.createFamily({ name, members });
    await loadFamilies();
    alert("Familia creada (si los miembros existían, quedan añadidos).");
  }

  function prevMonth() { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)); }
  function nextMonth() { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)); }
  function today() { setCursor(new Date()); }

  function openNewEvent(date) {
    setModalDate(date);
    setModalOpen(true);
  }

  async function handleCreateEvent({ title, notes, startAt, endAt, allDay, color }) {
    await api.createEvent(familyId, { title, notes, startAt, endAt, allDay, color });
    setModalOpen(false);
    await loadEvents(familyId, cursor);
  }

  const hasFamilies = families.length > 0;

  return (
    <div className="calendar-shell">
      <header className="calendar-topbar">
        <div className="calendar-topbar-inner">
          <div className="topbar-left">
            <h2 className="month-title">{monthLabel}</h2>
            <div className="month-nav" role="group" aria-label="Month navigation">
              <button type="button" className="icon-btn" onClick={prevMonth} aria-label="Mes anterior">
                &#8249;
              </button>
              <button type="button" className="icon-btn icon-btn-secondary" onClick={today} aria-label="Hoy">
                Hoy
              </button>
              <button type="button" className="icon-btn" onClick={nextMonth} aria-label="Mes siguiente">
                &#8250;
              </button>
              <button type="button" className="icon-btn icon-btn-mobile" onClick={today} aria-label="Hoy">
                &#9679;
              </button>
            </div>
          </div>

          <div className="topbar-right">
            <select
              className="family-select"
              value={familyId || ""}
              onChange={(e) => setFamilyId(Number(e.target.value))}
              aria-label="Seleccionar familia"
            >
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.role})
                </option>
              ))}
            </select>
            <button type="button" className="text-btn" onClick={createFamilyQuick}>
              + Familia
            </button>
            <button type="button" className="ghost-btn" onClick={onLogout}>
              Logout
            </button>
            <button
              type="button"
              className="primary-btn desktop-event-btn"
              onClick={() => openNewEvent(new Date())}
              disabled={!hasFamilies}
            >
              + Evento
            </button>
          </div>
        </div>
      </header>

      <main className="calendar-content">
        <MonthView cursor={cursor} events={events} onDayClick={openNewEvent} />
      </main>

      <button
        type="button"
        className="fab-event-btn"
        onClick={() => openNewEvent(new Date())}
        aria-label="Crear evento"
        disabled={!hasFamilies}
      >
        +
      </button>

      <EventModal
        open={modalOpen}
        date={modalDate}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateEvent}
      />
    </div>
  );
}
