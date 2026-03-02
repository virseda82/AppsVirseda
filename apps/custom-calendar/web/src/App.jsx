import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, setToken, clearToken, getToken, getTokenPayload } from "./api.js";
import CalendarPage from "./pages/Calendar.jsx";
import AdminPage from "./pages/Admin.jsx";

function Field({ label, ...props }) {
  return (
    <label className="auth-field">
      <div className="auth-label">{label}</div>
      <input {...props} className="auth-input" />
    </label>
  );
}

function AuthScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setErr("");
    setBusy(true);
    try {
      const normalized = String(identifier || "").trim();
      const r = await api.login({ identifier: normalized, email: normalized, password });
      setToken(r.token);
      window.location.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Calendario de Oli</h1>
        <Field
          label="Usuario"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
        />
        <Field
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button className="auth-submit-btn" onClick={handleLogin} disabled={busy}>
          Iniciar sesión
        </button>
        {err && <p className="auth-error">{err}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  function logout() {
    clearToken();
    window.location.reload();
  }

  const token = getToken();
  const tokenPayload = useMemo(() => getTokenPayload(), [token]);
  const isAdmin = !!tokenPayload?.is_admin;

  if (!ready) return null;
  if (!token) return <AuthScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CalendarPage onLogout={logout} isAdmin={isAdmin} />} />
        <Route
          path="/admin"
          element={isAdmin ? <AdminPage onLogout={logout} /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
