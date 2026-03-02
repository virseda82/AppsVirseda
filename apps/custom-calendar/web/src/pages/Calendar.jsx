import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, getTokenPayload } from "../api.js";
import MonthView from "../components/MonthView.jsx";
import EventModal from "../components/EventModal.jsx";

function isoStartOfMonth(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1, 0, 0, 0)).toISOString();
}
function isoStartOfNextMonth(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0)).toISOString();
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseIsoDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

function parseDateOnlyToUTC(dateOnly) {
  if (!dateOnly) return null;
  let normalized = null;
  if (dateOnly instanceof Date && !Number.isNaN(dateOnly.getTime())) {
    normalized = dateOnly.toISOString().slice(0, 10);
  } else if (typeof dateOnly === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      normalized = dateOnly;
    } else {
      const parsed = new Date(dateOnly);
      if (!Number.isNaN(parsed.getTime())) normalized = parsed.toISOString().slice(0, 10);
    }
  }
  if (!normalized) return null;
  const [y, m, d] = normalized.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateOnlyUTC(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUTC(date, days) {
  const n = new Date(date);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function combineDateAndTimeUTC(dateOnly, timeOnly) {
  const safe = String(timeOnly || "00:00:00");
  const normalized = safe.length === 5 ? `${safe}:00` : safe.slice(0, 8);
  const d = new Date(`${dateOnly}T${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function expandRecurringEvents(recurringRows, fromIso, toIso) {
  const fromDate = parseIsoDate(fromIso);
  const toDate = parseIsoDate(toIso);
  if (!fromDate || !toDate) return [];

  const fromDateOnly = toDateOnlyUTC(fromDate);
  const toDateOnly = toDateOnlyUTC(toDate);
  const rangeStart = parseDateOnlyToUTC(fromDateOnly);
  const rangeEndExclusive = parseDateOnlyToUTC(toDateOnly);
  if (!rangeStart || !rangeEndExclusive) return [];

  const out = [];
  for (const re of recurringRows || []) {
    const startDate = parseDateOnlyToUTC(re.start_date);
    if (!startDate) continue;
    const untilDate = re.until_date ? parseDateOnlyToUTC(re.until_date) : null;
    const weekday = Number(re.byweekday);
    const interval = Number(re.interval) === 2 ? 2 : 1;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;

    const shift = (weekday - startDate.getUTCDay() + 7) % 7;
    const first = addDaysUTC(startDate, shift);
    const iterStart = rangeStart > first ? rangeStart : first;

    for (let day = new Date(iterStart); day < rangeEndExclusive; day = addDaysUTC(day, 1)) {
      if (day.getUTCDay() !== weekday) continue;
      if (untilDate && day > untilDate) continue;
      const diffDays = Math.floor((day.getTime() - first.getTime()) / 86400000);
      if (diffDays < 0) continue;
      if (diffDays % (interval * 7) !== 0) continue;

      const dayKey = toDateOnlyUTC(day);
      const startAt = combineDateAndTimeUTC(dayKey, re.start_time);
      const endAt = combineDateAndTimeUTC(dayKey, re.end_time);
      if (!startAt || !endAt) continue;
      if (endAt <= startAt) endAt.setUTCDate(endAt.getUTCDate() + 1);
      if (!(startAt < toDate && endAt > fromDate)) continue;

      out.push({
        id: `r:${re.id}:${dayKey}`,
        title: re.title,
        notes: re.notes,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        all_day: !!re.all_day,
        color: re.color,
        is_recurring: true,
        recurring_id: re.id,
        interval,
        until_date: re.until_date || null,
      });
    }
  }
  return out;
}

export default function CalendarPage({ onLogout, isAdmin: isAdminProp = false }) {
  const [families, setFamilies] = useState([]);
  const [familyId, setFamilyId] = useState(null);

  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState("");
  const [custody, setCustody] = useState({ config: null, overrides: [] });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const monthLabel = useMemo(() => {
    return cursor.toLocaleString("es-ES", { month: "long", year: "numeric" });
  }, [cursor]);

  const tokenPayload = useMemo(() => getTokenPayload(), []);
  const isAdmin = isAdminProp || !!tokenPayload?.is_admin;

  async function loadFamilies() {
    const r = await api.listFamilies();
    setFamilies(r.families);
    if (!familyId && r.families[0]) setFamilyId(r.families[0].id);
  }

  async function loadEvents(fid, date) {
    if (!fid) return;
    const from = isoStartOfMonth(date);
    const to = isoStartOfNextMonth(date);
    try {
      const [eventsRes, recurringRes] = await Promise.allSettled([
        api.listEvents(fid, from, to),
        api.listRecurringEvents(fid),
      ]);
      const baseEvents = eventsRes.status === "fulfilled" ? (eventsRes.value.events || []) : [];
      const recurringRows = recurringRes.status === "fulfilled" ? (recurringRes.value.recurring_events || []) : [];
      const expanded = expandRecurringEvents(recurringRows, from, to);

      const dedup = new Map();
      for (const ev of [...baseEvents, ...expanded]) dedup.set(String(ev.id), ev);
      const merged = Array.from(dedup.values()).sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
      setEvents(merged);
      setEventsError("");
    } catch (e) {
      console.error(e);
      setEvents([]);
      setEventsError(e.message || "No se pudieron cargar los eventos");
    }
  }

  async function loadCustody(fid) {
    if (!fid) return;
    try {
      const r = await api.getFamilyCustody(fid);
      setCustody({ config: r.config, overrides: r.overrides || [] });
    } catch (e) {
      console.error(e);
      setCustody({ config: null, overrides: [] });
    }
  }

  useEffect(() => {
    loadFamilies();
  }, []);

  useEffect(() => {
    if (familyId) {
      loadEvents(familyId, cursor);
      loadCustody(familyId);
    }
  }, [familyId, cursor]);

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
    setSelectedEvent(null);
    setModalOpen(true);
  }

  function openEditEvent(event) {
    setSelectedEvent(event);
    setModalDate(event?.start_at ? new Date(event.start_at) : new Date());
    setModalOpen(true);
  }

  function countEventsForLocalDay(isoDate, excludeEventId = null) {
    const target = new Date(isoDate);
    return events.filter((ev) => {
      if (excludeEventId && ev.id === excludeEventId) return false;
      return sameDay(new Date(ev.start_at), target);
    }).length;
  }

  async function handleCreateEvent({ title, notes, startAt, endAt, allDay, color, repeat, interval, untilDate }) {
    const isRecurring = repeat && repeat !== "none";
    if (!isRecurring && countEventsForLocalDay(startAt) >= 3) {
      alert("Límite diario alcanzado: máximo 3 eventos por día.");
      return;
    }
    try {
      if (isRecurring) {
        await api.createRecurringEvent(familyId, {
          title,
          notes,
          startAt,
          endAt,
          allDay,
          color,
          interval: interval === 2 ? 2 : 1,
          untilDate: untilDate || null,
        });
      } else {
        await api.createEvent(familyId, { title, notes, startAt, endAt, allDay, color });
      }
      setModalOpen(false);
      await loadEvents(familyId, cursor);
    } catch (e) {
      alert(e.message || "No se pudo crear el evento");
      throw e;
    }
  }

  async function handleUpdateEvent({ title, notes, startAt, endAt, allDay, color, repeat, interval, untilDate }) {
    if (!selectedEvent?.id) return;
    const isRecurring = !!selectedEvent?.is_recurring;
    if (!isRecurring && countEventsForLocalDay(startAt, selectedEvent.id) >= 3) {
      alert("Límite diario alcanzado: máximo 3 eventos por día.");
      return;
    }
    try {
      if (isRecurring) {
        await api.updateRecurringEvent(selectedEvent.recurring_id, {
          title,
          notes,
          startAt,
          endAt,
          allDay,
          color,
          interval: interval === 2 ? 2 : 1,
          untilDate: repeat === "none" ? null : (untilDate || null),
        });
      } else {
        await api.updateEvent(selectedEvent.id, { title, notes, startAt, endAt, allDay, color });
      }
      setModalOpen(false);
      setSelectedEvent(null);
      await loadEvents(familyId, cursor);
    } catch (e) {
      alert(e.message || "No se pudo actualizar el evento");
      throw e;
    }
  }

  async function handleDeleteEvent() {
    if (!selectedEvent?.id) return;
    const msg = selectedEvent?.is_recurring
      ? "¿Eliminar toda la serie recurrente?"
      : "¿Eliminar este evento?";
    if (!confirm(msg)) return;
    try {
      if (selectedEvent?.is_recurring) {
        await api.deleteRecurringEvent(selectedEvent.recurring_id);
      } else {
        await api.deleteEvent(selectedEvent.id);
      }
      setModalOpen(false);
      setSelectedEvent(null);
      await loadEvents(familyId, cursor);
    } catch (e) {
      alert(e.message || "No se pudo eliminar el evento");
      throw e;
    }
  }

  async function handleResetEvents() {
    if (!confirm("Esto borrará TODOS los eventos. ¿Continuar?")) return;
    await api.adminResetEvents();
    await loadEvents(familyId, cursor);
    alert("Eventos reseteados.");
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
            {isAdmin && (
              <Link className="ghost-btn link-btn" to="/admin">
                Administración
              </Link>
            )}
            <button type="button" className="ghost-btn" onClick={onLogout}>
              Salir
            </button>
            {isAdmin && (
              <button
                type="button"
                className="ghost-btn"
                onClick={handleResetEvents}
                disabled={!hasFamilies}
              >
                Reiniciar eventos
              </button>
            )}
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
        {eventsError && <p className="admin-error">{eventsError}</p>}
        <MonthView
          cursor={cursor}
          events={events}
          onDayClick={openNewEvent}
          onEventClick={openEditEvent}
          custody={custody}
        />
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
        event={selectedEvent}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateEvent}
        onUpdate={handleUpdateEvent}
        onDelete={handleDeleteEvent}
      />
    </div>
  );
}
