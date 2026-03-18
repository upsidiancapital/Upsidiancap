import { useState } from "react";

const generateCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

const initialResidents = [
  { id: 1, name: "Adeola Martins", unit: "Block A, No. 12", phone: "08012345678" },
  { id: 2, name: "Chukwuemeka Obi", unit: "Block B, No. 5", phone: "08098765432" },
];

const initialAlerts = [
  { id: 1, type: "info", message: "Water supply will be interrupted Friday 8am to 12pm.", time: "2h ago" },
  { id: 2, type: "warning", message: "Suspicious vehicle spotted near Gate 2. Please be alert.", time: "5h ago" },
];

const ESTATES = [
  { id: "cove_towers", name: "Cove Towers", code: "1234" },
  { id: "banana_island", name: "Banana Island", code: "5678" },
];

const MOCK_USERS = [
  { email: "adeola@cove.ng", password: "password123", name: "Adeola", estateId: "cove_towers" },
  { email: "chukwu@banana.ng", password: "password123", name: "Chukwuemeka", estateId: "banana_island" },
];

const s = {
  authWrap: {
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    minHeight: "100vh",
    background: "#0a0a0a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  authCard: {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 20,
    padding: "40px 32px",
    width: "100%",
    maxWidth: 390,
  },
  authLogo: { fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: 4, marginBottom: 4 },
  authSub: { fontSize: 11, color: "#444", letterSpacing: 1.5, marginBottom: 32 },
  authTitle: { fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 5 },
  authDesc: { fontSize: 13, color: "#555", marginBottom: 24 },
  label: {
    fontSize: 10, fontWeight: 600, color: "#666", letterSpacing: 1.5,
    display: "block", marginBottom: 7, textTransform: "uppercase",
  },
  input: {
    width: "100%", padding: "12px 14px", background: "#1a1a1a",
    border: "1px solid #2a2a2a", borderRadius: 10, fontSize: 14,
    color: "#fff", boxSizing: "border-box", outline: "none", marginBottom: 16,
  },
  btnPrimary: {
    width: "100%", background: "#fff", color: "#000", border: "none",
    padding: "13px", borderRadius: 10, fontSize: 14, fontWeight: 700,
    cursor: "pointer", letterSpacing: 0.5, marginTop: 4,
  },
  btnGhost: {
    background: "none", border: "none", color: "#fff",
    fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0,
  },
  authSwitch: { marginTop: 22, textAlign: "center", fontSize: 13, color: "#555" },
  errBox: {
    background: "#1e0a0a", border: "1px solid #3d1515", borderRadius: 8,
    padding: "10px 14px", color: "#ff6b6b", fontSize: 13, marginBottom: 16,
  },
  successBox: {
    background: "#0a1e0a", border: "1px solid #1a3d1a", borderRadius: 8,
    padding: "10px 14px", color: "#6bff6b", fontSize: 13, marginBottom: 16,
  },
  divider: { height: 1, background: "#1e1e1e", margin: "4px 0 18px" },
  hintText: { fontSize: 11, color: "#333", marginTop: -10, marginBottom: 16, lineHeight: 1.6 },
  demoBox: { marginTop: 28, padding: "14px", background: "#0a0a0a", borderRadius: 10, border: "1px solid #1a1a1a" },
  demoTitle: { fontSize: 10, color: "#2e2e2e", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 7 },
  demoLine: { fontSize: 12, color: "#3a3a3a", marginBottom: 4 },
  demoHL: { color: "#4a4a4a", fontWeight: 700 },
  backBtn: {
    background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer",
    padding: 0, marginBottom: 22, display: "flex", alignItems: "center", gap: 5, letterSpacing: 0.5,
  },
  appWrap: {
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    maxWidth: 430, margin: "0 auto", minHeight: "100vh",
    background: "#0f0f0f", display: "flex", flexDirection: "column", color: "#fff",
  },
  header: {
    background: "#141414", borderBottom: "1px solid #1e1e1e",
    padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  headerLogo: { fontWeight: 800, fontSize: 18, letterSpacing: 4, color: "#fff" },
  headerSub: { fontSize: 9, color: "#333", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 },
  estateBadge: {
    background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 20,
    padding: "4px 12px", fontSize: 11, color: "#777", letterSpacing: 0.5,
  },
  logoutBtn: {
    background: "none", border: "1px solid #222", color: "#444",
    borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", letterSpacing: 0.5,
  },
  content: { flex: 1, padding: 16, overflowY: "auto" },
  card: { background: "#141414", border: "1px solid #1e1e1e", borderRadius: 14, padding: 16, marginBottom: 10 },
  statCard: { background: "#141414", border: "1px solid #1e1e1e", borderRadius: 12, padding: 16 },
  statVal: { fontSize: 28, fontWeight: 800, color: "#fff" },
  statLabel: { fontSize: 11, color: "#444", marginTop: 2, letterSpacing: 0.5 },
  sectionTitle: {
    fontWeight: 700, fontSize: 11, color: "#555", letterSpacing: 2,
    textTransform: "uppercase", marginBottom: 10, marginTop: 4,
  },
  alertInfo: {
    background: "#141414", border: "1px solid #1e1e1e", borderLeft: "3px solid #444",
    borderRadius: 8, padding: "12px 14px", marginBottom: 8, fontSize: 13, color: "#aaa",
  },
  alertWarn: {
    background: "#141414", border: "1px solid #2a2a2a", borderLeft: "3px solid #888",
    borderRadius: 8, padding: "12px 14px", marginBottom: 8, fontSize: 13, color: "#bbb",
  },
  alertTime: { color: "#333", fontSize: 11, marginTop: 5 },
  badgeActive: {
    background: "#fff", color: "#000", borderRadius: 20,
    padding: "2px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
  },
  badgeUsed: {
    background: "#1a1a1a", color: "#444", borderRadius: 20,
    padding: "2px 10px", fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
  },
  codeBox: {
    background: "#0a0a0a", border: "1px solid #1e1e1e",
    borderRadius: 10, padding: "10px 14px", textAlign: "center", marginTop: 10,
  },
  codeLabel: { fontSize: 10, color: "#333", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 },
  codeVal: { fontSize: 24, fontWeight: 800, letterSpacing: 6, color: "#fff" },
  appInput: {
    width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: 10, fontSize: 14, color: "#fff", boxSizing: "border-box", outline: "none", marginBottom: 14,
  },
  appSelect: {
    width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: 10, fontSize: 14, color: "#fff", boxSizing: "border-box", marginBottom: 14,
  },
  appBtnPrimary: {
    width: "100%", background: "#fff", color: "#000", border: "none",
    padding: 14, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
  },
  appBtnSecondary: {
    width: "100%", background: "#1a1a1a", color: "#fff", border: "1px solid #2a2a2a",
    padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 10,
  },
  gateInput: {
    flex: 1, padding: "13px", background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: 10, fontSize: 20, textAlign: "center", letterSpacing: 5,
    fontWeight: 800, textTransform: "uppercase", color: "#fff", outline: "none",
  },
  gateVerifyBtn: {
    background: "#fff", color: "#000", border: "none",
    padding: "13px 18px", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13,
  },
  accessGranted: { marginTop: 14, padding: 14, borderRadius: 10, background: "#0d1a0d", border: "1px solid #1a3d1a" },
  accessDenied: { marginTop: 14, padding: 14, borderRadius: 10, background: "#1a0d0d", border: "1px solid #3d1a1a" },
  accessRow: { fontSize: 13, color: "#888", marginBottom: 4 },
  logRow: { background: "#141414", border: "1px solid #1e1e1e", borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 13 },
  marketCard: { background: "#141414", border: "1px solid #1e1e1e", borderRadius: 14, padding: 16, marginBottom: 12 },
  bottomNav: { display: "flex", background: "#141414", borderTop: "1px solid #1e1e1e", padding: "6px 0" },
  navBtn: (active) => ({
    flex: 1, background: "none", border: "none", cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    color: active ? "#fff" : "#333", fontWeight: active ? 700 : 400,
    fontSize: 10, padding: "4px 0", letterSpacing: 0.5, transition: "color 0.15s",
  }),
  greetText: { color: "#555", marginBottom: 16, fontSize: 14 },
};

// ─────────────────────── AUTH ────────────────────────

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", estateId: "", estateCode: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [users, setUsers] = useState(MOCK_USERS);

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const goLogin = () => { setMode("login"); setError(""); setSuccess(""); };
  const goSignup = () => { setMode("signup"); setError(""); setSuccess(""); };

  const handleLogin = () => {
    setError("");
    const found = users.find((u) => u.email === form.email && u.password === form.password);
    if (!found) return setError("Invalid email or password.");
    const estate = ESTATES.find((e) => e.id === found.estateId);
    onLogin({ ...found, estateName: estate ? estate.name : "Estate" });
  };

  const handleSignup = () => {
    setError("");
    setSuccess("");
    if (!form.name || !form.email || !form.password || !form.estateId || !form.estateCode)
      return setError("All fields are required.");
    if (form.password !== form.confirm)
      return setError("Passwords do not match.");
    if (users.find((u) => u.email === form.email))
      return setError("Email already registered.");
    const estate = ESTATES.find((e) => e.id === form.estateId);
    if (!estate) return setError("Please select a valid estate.");
    if (form.estateCode !== estate.code)
      return setError("Invalid access code for " + estate.name + ". Please check with your estate admin.");
    const newUser = { email: form.email, password: form.password, name: form.name, estateId: form.estateId };
    setUsers((prev) => [...prev, newUser]);
    setSuccess("Account created! You are now registered to " + estate.name + ".");
    setMode("login");
    setForm({ name: "", email: form.email, password: "", confirm: "", estateId: "", estateCode: "" });
  };

  return (
    <div style={s.authWrap}>
      <div style={s.authCard}>

        {mode === "signup" && (
          <button style={s.backBtn} onClick={goLogin}>
            &larr; Back to Sign In
          </button>
        )}

        <div style={s.authLogo}>UPSIDIAN</div>
        <div style={s.authSub}>SMART ESTATE MANAGEMENT</div>

        <div style={s.authTitle}>{mode === "login" ? "Welcome back" : "Create account"}</div>
        <div style={s.authDesc}>
          {mode === "login" ? "Sign in to your estate portal." : "Join your estate community."}
        </div>

        {error && <div style={s.errBox}>{error}</div>}
        {success && <div style={s.successBox}>{success}</div>}

        {mode === "signup" && (
          <div>
            <label style={s.label}>Full Name</label>
            <input style={s.input} placeholder="e.g. Adeola Martins" value={form.name} onChange={set("name")} />
          </div>
        )}

        <label style={s.label}>Email Address</label>
        <input style={s.input} type="email" placeholder="you@estate.ng" value={form.email} onChange={set("email")} />

        <label style={s.label}>Password</label>
        <input style={s.input} type="password" placeholder="Enter password" value={form.password} onChange={set("password")} />

        {mode === "signup" && (
          <div>
            <label style={s.label}>Confirm Password</label>
            <input style={s.input} type="password" placeholder="Confirm password" value={form.confirm} onChange={set("confirm")} />

            <div style={s.divider} />

            <label style={s.label}>Select Your Estate</label>
            <select
              value={form.estateId}
              onChange={set("estateId")}
              style={{ ...s.input, color: form.estateId ? "#fff" : "#555" }}
            >
              <option value="" disabled>Choose your estate...</option>
              {ESTATES.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>

            <label style={s.label}>Estate Access Code</label>
            <input
              style={s.input}
              type="text"
              placeholder="Code provided by your estate admin"
              value={form.estateCode}
              onChange={set("estateCode")}
              maxLength={10}
            />
            <div style={s.hintText}>
              Your estate registration is permanent once set. Contact your estate admin for the access code.
            </div>
          </div>
        )}

        <button style={s.btnPrimary} onClick={mode === "login" ? handleLogin : handleSignup}>
          {mode === "login" ? "Sign In" : "Create Account"} &rarr;
        </button>

        <div style={s.authSwitch}>
          {mode === "login" ? (
            <span>
              No account yet?{" "}
              <button style={s.btnGhost} onClick={goSignup}>Sign up</button>
            </span>
          ) : (
            <span>
              Already registered?{" "}
              <button style={s.btnGhost} onClick={goLogin}>Sign in</button>
            </span>
          )}
        </div>

        <div style={s.demoBox}>
          <div style={s.demoTitle}>Demo Credentials</div>
          <div style={s.demoLine}>adeola@cove.ng &middot; password123</div>
          <div style={s.demoLine}>chukwu@banana.ng &middot; password123</div>
          <div style={{ ...s.divider, marginTop: 10 }} />
          <div style={{ ...s.demoTitle, marginTop: 10 }}>Estate Codes (for sign up)</div>
          <div style={s.demoLine}>Cove Towers &rarr; <span style={s.demoHL}>1234</span></div>
          <div style={s.demoLine}>Banana Island &rarr; <span style={s.demoHL}>5678</span></div>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────── MAIN APP ────────────────────────

export default function UpsidianApp() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [invites, setInvites] = useState([]);
  const [accessLog, setAccessLog] = useState([]);
  const [gateCode, setGateCode] = useState("");
  const [gateResult, setGateResult] = useState(null);
  const [listings] = useState([
    { id: 1, title: "Generator Fuel (50L)", price: "25,000", seller: "Adeola M.", status: "available" },
    { id: 2, title: "Inverter Battery (200Ah)", price: "80,000", seller: "Chukwuemeka O.", status: "available" },
  ]);
  const [inviteForm, setInviteForm] = useState({ guestName: "", guestPhone: "", purpose: "", date: "", residentId: 1 });

  if (!user) return <AuthScreen onLogin={setUser} />;

  const createInvite = () => {
    if (!inviteForm.guestName || !inviteForm.date) return;
    const newInvite = {
      id: Date.now(),
      ...inviteForm,
      code: generateCode(),
      resident: initialResidents.find((r) => r.id === Number(inviteForm.residentId)),
      status: "pending",
      createdAt: new Date().toLocaleString(),
    };
    setInvites([newInvite, ...invites]);
    setInviteForm({ guestName: "", guestPhone: "", purpose: "", date: "", residentId: 1 });
  };

  const verifyGate = () => {
    const found = invites.find((i) => i.code === gateCode.toUpperCase() && i.status === "pending");
    if (found) {
      setGateResult({ success: true, invite: found });
      setAccessLog([
        {
          id: Date.now(),
          guest: found.guestName,
          resident: found.resident?.name,
          unit: found.resident?.unit,
          code: found.code,
          time: new Date().toLocaleTimeString(),
          action: "Checked In",
        },
        ...accessLog,
      ]);
      setInvites(invites.map((i) => (i.id === found.id ? { ...i, status: "used" } : i)));
    } else {
      setGateResult({ success: false });
    }
    setGateCode("");
  };

  const navItems = [
    { id: "dashboard", label: "Home", icon: "⌂" },
    { id: "invite", label: "Invite", icon: "✉" },
    { id: "gate", label: "Gate", icon: "◉" },
    { id: "marketplace", label: "Market", icon: "◈" },
    { id: "alerts", label: "Alerts", icon: "◎" },
  ];

  const InviteCard = ({ inv }) => (
    <div style={s.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <strong style={{ fontSize: 14, color: "#e0e0e0" }}>{inv.guestName}</strong>
        <span style={inv.status === "used" ? s.badgeUsed : s.badgeActive}>
          {inv.status === "used" ? "Used" : "Active"}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#555" }}>
        {inv.date}{inv.purpose ? " · " + inv.purpose : ""}
      </div>
      <div style={s.codeBox}>
        <div style={s.codeLabel}>Access Code</div>
        <div style={s.codeVal}>{inv.code}</div>
      </div>
    </div>
  );

  return (
    <div style={s.appWrap}>

      <div style={s.header}>
        <div>
          <div style={s.headerLogo}>UPSIDIAN</div>
          <div style={s.headerSub}>Smart Estate Management</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={s.estateBadge}>{user.estateName}</div>
          <button style={s.logoutBtn} onClick={() => setUser(null)}>Logout</button>
        </div>
      </div>

      <div style={s.content}>

        {view === "dashboard" && (
          <div>
            <p style={s.greetText}>Good day, <strong style={{ color: "#fff" }}>{user.name}</strong></p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Active Invites", value: invites.filter((i) => i.status === "pending").length },
                { label: "Gate Check-ins", value: accessLog.length },
                { label: "Marketplace", value: listings.length },
                { label: "Alerts", value: initialAlerts.length },
              ].map((stat) => (
                <div key={stat.label} style={s.statCard}>
                  <div style={s.statVal}>{stat.value}</div>
                  <div style={s.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>
            <div style={s.sectionTitle}>Recent Alerts</div>
            {initialAlerts.map((a) => (
              <div key={a.id} style={a.type === "warning" ? s.alertWarn : s.alertInfo}>
                {a.message}
                <div style={s.alertTime}>{a.time}</div>
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <div style={s.sectionTitle}>Recent Invites</div>
              {invites.length === 0 ? (
                <div style={{ color: "#2a2a2a", fontSize: 13, padding: "12px 0" }}>No invites yet. Head to the Invite tab to get started.</div>
              ) : (
                invites.slice(0, 3).map((inv) => <InviteCard key={inv.id} inv={inv} />)
              )}
            </div>
          </div>
        )}

        {view === "invite" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Guest Invite</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>Generate a one-time access code for your visitor.</div>
            {[
              { label: "Guest Name", key: "guestName", type: "text", placeholder: "e.g. John Doe" },
              { label: "Guest Phone", key: "guestPhone", type: "tel", placeholder: "e.g. 08012345678" },
              { label: "Purpose of Visit", key: "purpose", type: "text", placeholder: "e.g. Family visit" },
              { label: "Visit Date", key: "date", type: "date" },
            ].map((field) => (
              <div key={field.key}>
                <label style={s.label}>{field.label}</label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={inviteForm[field.key]}
                  onChange={(e) => setInviteForm({ ...inviteForm, [field.key]: e.target.value })}
                  style={s.appInput}
                />
              </div>
            ))}
            <label style={s.label}>Resident</label>
            <select
              value={inviteForm.residentId}
              onChange={(e) => setInviteForm({ ...inviteForm, residentId: Number(e.target.value) })}
              style={s.appSelect}
            >
              {initialResidents.map((r) => (
                <option key={r.id} value={r.id}>{r.name} – {r.unit}</option>
              ))}
            </select>
            <button style={s.appBtnPrimary} onClick={createInvite}>Generate Invite Code &rarr;</button>
            <div style={{ marginTop: 28 }}>
              <div style={s.sectionTitle}>Your Invites</div>
              {invites.length === 0 ? (
                <div style={{ color: "#2a2a2a", fontSize: 13 }}>No invites created yet.</div>
              ) : (
                invites.map((inv) => <InviteCard key={inv.id} inv={inv} />)
              )}
            </div>
          </div>
        )}

        {view === "gate" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Gate Security</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>Verify guest access codes at the gate.</div>
            <div style={{ ...s.card, padding: 20 }}>
              <label style={s.label}>Enter Access Code</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={gateCode}
                  onChange={(e) => setGateCode(e.target.value)}
                  placeholder="AB12CD"
                  maxLength={6}
                  style={s.gateInput}
                />
                <button style={s.gateVerifyBtn} onClick={verifyGate}>Verify</button>
              </div>
              {gateResult && (
                <div style={gateResult.success ? s.accessGranted : s.accessDenied}>
                  {gateResult.success ? (
                    <div>
                      <div style={{ color: "#6bff6b", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Access Granted</div>
                      {[
                        ["Guest", gateResult.invite.guestName],
                        ["Visiting", gateResult.invite.resident?.name],
                        ["Unit", gateResult.invite.resident?.unit],
                        ["Purpose", gateResult.invite.purpose || "—"],
                      ].map(([k, v]) => (
                        <div key={k} style={s.accessRow}><span style={{ color: "#333" }}>{k}:</span> {v}</div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "#ff6b6b", fontWeight: 700 }}>Invalid or expired code.</div>
                  )}
                </div>
              )}
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={s.sectionTitle}>Access Log</div>
              {accessLog.length === 0 ? (
                <div style={{ color: "#2a2a2a", fontSize: 13 }}>No check-ins recorded yet.</div>
              ) : (
                accessLog.map((log) => (
                  <div key={log.id} style={s.logRow}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong style={{ color: "#e0e0e0" }}>{log.guest}</strong>
                      <span style={{ color: "#6bff6b", fontSize: 12 }}>{log.action}</span>
                    </div>
                    <div style={{ color: "#444", marginTop: 3 }}>{log.resident} &middot; {log.unit}</div>
                    <div style={{ color: "#2a2a2a", fontSize: 11, marginTop: 2 }}>{log.time}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === "marketplace" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Estate Marketplace</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>Buy and sell within your community.</div>
            {listings.map((item) => (
              <div key={item.id} style={s.marketCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#e0e0e0" }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "#444", marginTop: 3 }}>Seller: {item.seller}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "#fff", fontSize: 15 }}>&#8358;{item.price}</div>
                    <span style={{ ...s.badgeActive, fontSize: 9, marginTop: 4, display: "inline-block" }}>{item.status}</span>
                  </div>
                </div>
                <button style={s.appBtnSecondary}>Contact Seller</button>
              </div>
            ))}
          </div>
        )}

        {view === "alerts" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Community Alerts</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>Stay informed about estate updates.</div>
            {initialAlerts.map((a) => (
              <div key={a.id} style={{ ...s.card, borderLeft: "3px solid " + (a.type === "warning" ? "#888" : "#444"), padding: 16 }}>
                <div style={{ fontSize: 14, color: "#bbb" }}>{a.message}</div>
                <div style={s.alertTime}>{a.time}</div>
              </div>
            ))}
          </div>
        )}

      </div>

      <div style={s.bottomNav}>
        {navItems.map((item) => (
          <button key={item.id} onClick={() => setView(item.id)} style={s.navBtn(view === item.id)}>
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

    </div>
  );
}