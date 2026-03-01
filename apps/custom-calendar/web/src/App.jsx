import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, setToken, clearToken, getToken, getTokenPayload } from "./api.js";
import CalendarPage from "./pages/Calendar.jsx";
import AdminPage from "./pages/Admin.jsx";

function Field({ label, ...props }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
      <input {...props} style={{ width: "100%", padding: 10, fontSize: 14 }} />
    </label>
  );
}

function AuthScreen() {
  const QUICK_EMAIL = "virseda82@gmail.com";
  const QUICK_PASSWORD = "12345678";
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function handleAuth() {
    setErr("");
    try {
      const payload = mode === "register" ? { email, name, password } : { email, password };
      const r = mode === "register" ? await api.register(payload) : await api.login(payload);
      setToken(r.token);
      window.location.reload();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleQuickAccessPablo() {
    setErr("");
    try {
      const r = await api.login({ email: QUICK_EMAIL, password: QUICK_PASSWORD });
      setToken(r.token);
      window.location.reload();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "50px auto", fontFamily: "system-ui" }}>
      <h2>Custom Family Calendar</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setMode("login")} style={{ padding: 10, flex: 1 }}>Login</button>
        <button onClick={() => setMode("register")} style={{ padding: 10, flex: 1 }}>Register</button>
      </div>

      <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode === "register" && <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />}
      <Field label="Password (min 8)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

      <button onClick={handleAuth} style={{ padding: 12, width: "100%", marginTop: 10 }}>
        {mode === "login" ? "Login" : "Create account"}
      </button>
      <button onClick={handleQuickAccessPablo} style={{ padding: 12, width: "100%", marginTop: 10 }}>
        Acceso Pablo Rapidao
      </button>

      {err && <p style={{ color: "crimson", marginTop: 15 }}>{err}</p>}
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
