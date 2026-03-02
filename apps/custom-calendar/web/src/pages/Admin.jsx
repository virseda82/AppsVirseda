import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

const DEFAULT_COLOR = "#3b82f6";
const USER_COLOR_OPTIONS = [
  { label: "Azul", value: "#3b82f6" },
  { label: "Morado", value: "#8b5cf6" },
];
const CUSTODY_COLOR_OPTIONS = [
  { label: "Azul", value: "#dbeafe" },
  { label: "Morado", value: "#f3e8ff" },
];

export default function AdminPage({ onLogout }) {
  const [users, setUsers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [familyId, setFamilyId] = useState("");
  const [custody, setCustody] = useState({ config: null, overrides: [] });
  const [err, setErr] = useState("");

  const [newUser, setNewUser] = useState({ email: "", name: "", color: DEFAULT_COLOR, password: "" });

  const [configForm, setConfigForm] = useState({
    anchor_monday: "2026-03-02",
    anchor_owner: "father",
    father_color: "#dbeafe",
    mother_color: "#f3e8ff",
  });

  const [overrideForm, setOverrideForm] = useState({
    id: null,
    start_date: "",
    end_date: "",
    owner: "father",
    color: "",
    notes: "",
  });

  const familyIdNum = useMemo(() => Number(familyId), [familyId]);

  async function loadUsers() {
    const r = await api.adminListUsers();
    setUsers(r.users || []);
  }

  async function loadFamilies() {
    const r = await api.adminListFamilies();
    setFamilies(r.families || []);
    if (!familyId && r.families?.[0]) {
      setFamilyId(String(r.families[0].id));
    }
  }

  async function loadCustody(fid) {
    if (!fid) return;
    const r = await api.adminGetFamilyCustody(fid);
    setCustody({ config: r.config, overrides: r.overrides || [] });
    if (r.config) {
      setConfigForm({
        anchor_monday: String(r.config.anchor_monday).slice(0, 10),
        anchor_owner: r.config.anchor_owner,
        father_color: r.config.father_color,
        mother_color: r.config.mother_color,
      });
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        await Promise.all([loadUsers(), loadFamilies()]);
      } catch (e) {
        setErr(e.message || "Error cargando admin");
      }
    })();
  }, []);

  useEffect(() => {
    if (!familyIdNum) return;
    (async () => {
      try {
        setErr("");
        await loadCustody(familyIdNum);
      } catch (e) {
        setErr(e.message || "Error cargando custodia");
      }
    })();
  }, [familyIdNum]);

  async function createUser() {
    try {
      setErr("");
      await api.adminCreateUser(newUser);
      setNewUser({ email: "", name: "", color: DEFAULT_COLOR, password: "" });
      await loadUsers();
    } catch (e) {
      setErr(e.message || "Error creando usuario");
    }
  }

  async function updateUser(user) {
    try {
      setErr("");
      await api.adminUpdateUser(user.id, { name: user.name, color: user.color });
      await loadUsers();
    } catch (e) {
      setErr(e.message || "Error actualizando usuario");
    }
  }

  async function updateUserPassword(userId) {
    const password = prompt("Nueva contraseña (min 8):");
    if (!password) return;
    try {
      setErr("");
      await api.adminUpdateUser(userId, { password });
      alert("Contraseña actualizada");
    } catch (e) {
      setErr(e.message || "Error actualizando contraseña");
    }
  }

  async function deleteUser(id) {
    if (!confirm("¿Eliminar usuario?")) return;
    try {
      setErr("");
      await api.adminDeleteUser(id);
      await loadUsers();
    } catch (e) {
      setErr(e.message || "Error eliminando usuario");
    }
  }

  async function saveConfig() {
    if (!familyIdNum) return;
    try {
      setErr("");
      await api.adminUpsertCustodyConfig(familyIdNum, configForm);
      await loadCustody(familyIdNum);
    } catch (e) {
      setErr(e.message || "Error guardando configuración");
    }
  }

  function editOverride(ov) {
    setOverrideForm({
      id: ov.id,
      start_date: String(ov.start_date).slice(0, 10),
      end_date: String(ov.end_date).slice(0, 10),
      owner: ov.owner,
      color: ov.color || "",
      notes: ov.notes || "",
    });
  }

  function resetOverrideForm() {
    setOverrideForm({ id: null, start_date: "", end_date: "", owner: "father", color: "", notes: "" });
  }

  async function saveOverride() {
    if (!familyIdNum) return;
    try {
      setErr("");
      if (overrideForm.id) {
        await api.adminUpdateCustodyOverride(overrideForm.id, overrideForm);
      } else {
        await api.adminCreateCustodyOverride(familyIdNum, overrideForm);
      }
      resetOverrideForm();
      await loadCustody(familyIdNum);
    } catch (e) {
      setErr(e.message || "Error guardando override");
    }
  }

  async function deleteOverride(id) {
    if (!confirm("¿Eliminar override?")) return;
    try {
      setErr("");
      await api.adminDeleteCustodyOverride(id);
      await loadCustody(familyIdNum);
    } catch (e) {
      setErr(e.message || "Error eliminando override");
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h2>Panel de administración</h2>
        <div className="admin-header-actions">
          <Link className="ghost-btn link-btn" to="/">Calendario</Link>
          <button className="ghost-btn" type="button" onClick={onLogout}>Salir</button>
        </div>
      </header>

      {err && <p className="admin-error">{err}</p>}

      <section className="admin-card">
        <h3>Usuarios</h3>
        <div className="admin-user-create">
          <input placeholder="Correo" value={newUser.email} onChange={(e) => setNewUser((v) => ({ ...v, email: e.target.value }))} />
          <input placeholder="Nombre" value={newUser.name} onChange={(e) => setNewUser((v) => ({ ...v, name: e.target.value }))} />
          <select value={newUser.color} onChange={(e) => setNewUser((v) => ({ ...v, color: e.target.value }))}>
            {USER_COLOR_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input placeholder="Contraseña" type="password" value={newUser.password} onChange={(e) => setNewUser((v) => ({ ...v, password: e.target.value }))} />
          <button className="primary-btn" type="button" onClick={createUser}>Crear usuario</button>
        </div>

        <div className="admin-list">
          {users.map((u) => (
            <div className="admin-list-row" key={u.id}>
              <span className="admin-list-id">#{u.id}</span>
              <span className="admin-list-email">{u.email}</span>
              <input value={u.name || ""} onChange={(e) => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, name: e.target.value } : x)))} />
              <select value={u.color || DEFAULT_COLOR} onChange={(e) => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, color: e.target.value } : x)))}>
                {USER_COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <button className="ghost-btn" type="button" onClick={() => updateUser(u)}>Guardar</button>
              <button className="ghost-btn" type="button" onClick={() => updateUserPassword(u.id)}>Contraseña</button>
              <button className="danger-btn" type="button" onClick={() => deleteUser(u.id)}>Eliminar</button>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <h3>Custodia</h3>

        <div className="admin-family-select">
          <label>Familia</label>
          <select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
            {families.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="admin-custody-config">
          <h4>Configuración base</h4>
          <div className="admin-form-grid">
            <label>
              Lunes de referencia
              <input type="date" value={configForm.anchor_monday} onChange={(e) => setConfigForm((v) => ({ ...v, anchor_monday: e.target.value }))} />
            </label>
            <label>
              Tutor de referencia
              <select value={configForm.anchor_owner} onChange={(e) => setConfigForm((v) => ({ ...v, anchor_owner: e.target.value }))}>
                <option value="father">padre</option>
                <option value="mother">madre</option>
              </select>
            </label>
            <label>
              Color padre
              <select value={configForm.father_color} onChange={(e) => setConfigForm((v) => ({ ...v, father_color: e.target.value }))}>
                {CUSTODY_COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label>
              Color madre
              <select value={configForm.mother_color} onChange={(e) => setConfigForm((v) => ({ ...v, mother_color: e.target.value }))}>
                {CUSTODY_COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary-btn" type="button" onClick={saveConfig}>Guardar configuración</button>
        </div>

        <div className="admin-custody-overrides">
          <h4>Excepciones</h4>
          <div className="admin-form-grid">
            <label>
              Inicio
              <input type="date" value={overrideForm.start_date} onChange={(e) => setOverrideForm((v) => ({ ...v, start_date: e.target.value }))} />
            </label>
            <label>
              Fin
              <input type="date" value={overrideForm.end_date} onChange={(e) => setOverrideForm((v) => ({ ...v, end_date: e.target.value }))} />
            </label>
            <label>
              Tutor
              <select value={overrideForm.owner} onChange={(e) => setOverrideForm((v) => ({ ...v, owner: e.target.value }))}>
                <option value="father">padre</option>
                <option value="mother">madre</option>
              </select>
            </label>
            <label>
              Color (opcional)
              <select value={overrideForm.color} onChange={(e) => setOverrideForm((v) => ({ ...v, color: e.target.value }))}>
                <option value="">Automático</option>
                {CUSTODY_COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="admin-col-span-2">
              Notas
              <input value={overrideForm.notes} onChange={(e) => setOverrideForm((v) => ({ ...v, notes: e.target.value }))} />
            </label>
          </div>
          <div className="admin-actions-row">
            <button className="primary-btn" type="button" onClick={saveOverride}>
              {overrideForm.id ? "Actualizar excepción" : "Crear excepción"}
            </button>
            {overrideForm.id && (
              <button className="ghost-btn" type="button" onClick={resetOverrideForm}>Cancelar edición</button>
            )}
          </div>

          <div className="admin-list">
            {custody.overrides.map((ov) => (
              <div className="admin-list-row" key={ov.id}>
                <span className="admin-list-id">#{ov.id}</span>
                <span>{String(ov.start_date).slice(0, 10)} - {String(ov.end_date).slice(0, 10)}</span>
                <span>{ov.owner === "father" ? "padre" : "madre"}</span>
                <span>{ov.color || "(automático)"}</span>
                <span>{ov.notes || ""}</span>
                <button className="ghost-btn" type="button" onClick={() => editOverride(ov)}>Editar</button>
                <button className="danger-btn" type="button" onClick={() => deleteOverride(ov.id)}>Eliminar</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
