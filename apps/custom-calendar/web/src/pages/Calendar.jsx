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

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 1100, margin: "20px auto", padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, textTransform: "capitalize" }}>{monthLabel}</h2>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={prevMonth}>◀</button>
            <button onClick={today}>Hoy</button>
            <button onClick={nextMonth}>▶</button>
            <button onClick={() => openNewEvent(new Date())}>+ Evento</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={familyId || ""} onChange={(e) => setFamilyId(Number(e.target.value))}>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.role})
              </option>
            ))}
          </select>
          <button onClick={createFamilyQuick}>+ Familia</button>
          <button onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <MonthView cursor={cursor} events={events} onDayClick={openNewEvent} />
      </div>

      <EventModal open={modalOpen} date={modalDate} onClose={() => setModalOpen(false)} onCreate={handleCreateEvent} />
    </div>
  );
}
