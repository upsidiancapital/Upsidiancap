import { useState, useEffect, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const ESTATES = [
  { id: "cove_towers",   name: "Cove Towers",  code: "1234" },
  { id: "banana_island", name: "Banana Island", code: "5678" },
];

const SEED_USERS = [
  { email: "adeola@cove.ng",   password: "password123", name: "Adeola",       estateId: "cove_towers",   role: "resident" },
  { email: "chukwu@banana.ng", password: "password123", name: "Chukwuemeka",  estateId: "banana_island", role: "resident" },
  { email: "gate@cove.ng",     password: "gate1234",    name: "Gate Officer", estateId: "cove_towers",   role: "security" },
  { email: "gate@banana.ng",   password: "gate5678",    name: "Gate Officer", estateId: "banana_island", role: "security" },
];

const RESIDENTS = [
  { id: 1, name: "Adeola Martins",  unit: "Block A, No. 12" },
  { id: 2, name: "Chukwuemeka Obi", unit: "Block B, No. 5"  },
];

const ALERTS = [
  { id: 1, type: "info",    message: "Water supply will be interrupted Friday 8am to 12pm.", time: "2h ago" },
  { id: 2, type: "warning", message: "Suspicious vehicle spotted near Gate 2. Please be alert.", time: "5h ago" },
];

// ─── Nigeria time helpers (WAT = UTC+1) ──────────────────────────────────────

// Returns current Nigeria time as a Date object
function nowNigeria() {
  const now = new Date();
  // WAT is UTC+1; getTimezoneOffset returns minutes behind UTC for local tz
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 3600000); // +1h
}

// Parse "YYYY-MM-DD" + "HH:MM" into a Nigeria-relative Date
function parseNigeriaDateTime(dateStr, timeStr) {
  // Combine as if it's Nigeria local time, then offset to UTC for comparison
  const [y, mo, d]  = dateStr.split("-").map(Number);
  const [h, mi]     = timeStr.split(":").map(Number);
  // Nigeria local → UTC: subtract 1h
  return new Date(Date.UTC(y, mo - 1, d, h - 1, mi));
}

// Format a Nigeria datetime string nicely
function fmtNigeriaTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return "";
  const dt = parseNigeriaDateTime(dateStr, timeStr);
  return dt.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Check if an invite is currently valid in Nigeria time
function isInviteValid(invite) {
  const now     = nowNigeria();
  const start   = parseNigeriaDateTime(invite.date, invite.timeFrom);
  const end     = parseNigeriaDateTime(invite.date, invite.timeTo);
  return now >= start && now <= end;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const INVITES_KEY = "upsidian_invites";
const USERS_KEY   = "upsidian_users";
const LOG_KEY     = "upsidian_log";

async function storageGet(key) {
  try {
    const res = await window.storage.get(key, true);
    return res ? JSON.parse(res.value) : null;
  } catch { return null; }
}
async function storageSet(key, value) {
  try { await window.storage.set(key, JSON.stringify(value), true); } catch {}
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const c = {
  page:      { fontFamily:"'DM Sans','Helvetica Neue',sans-serif", minHeight:"100vh", background:"#0a0a0a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px" },
  authCard:  { background:"#141414", border:"1px solid #2a2a2a", borderRadius:20, padding:"40px 32px", width:"100%", maxWidth:390 },
  appWrap:   { fontFamily:"'DM Sans','Helvetica Neue',sans-serif", maxWidth:430, margin:"0 auto", minHeight:"100vh", background:"#0f0f0f", display:"flex", flexDirection:"column", color:"#fff" },
  header:    { background:"#141414", borderBottom:"1px solid #1e1e1e", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" },
  content:   { flex:1, padding:16, overflowY:"auto" },
  bottomNav: { display:"flex", background:"#141414", borderTop:"1px solid #1e1e1e", padding:"6px 0" },

  logo:    { fontSize:24, fontWeight:800, color:"#fff", letterSpacing:4, marginBottom:4 },
  logoSub: { fontSize:10, color:"#444", letterSpacing:1.5, marginBottom:30 },
  title:   { fontSize:20, fontWeight:700, color:"#fff", marginBottom:5 },
  desc:    { fontSize:13, color:"#555", marginBottom:24 },
  label:   { fontSize:10, fontWeight:600, color:"#666", letterSpacing:1.5, display:"block", marginBottom:7, textTransform:"uppercase" },
  hint:    { fontSize:11, color:"#333", marginTop:-10, marginBottom:16, lineHeight:1.6 },
  section: { fontWeight:700, fontSize:11, color:"#555", letterSpacing:2, textTransform:"uppercase", marginBottom:10, marginTop:4 },
  greet:   { color:"#555", marginBottom:16, fontSize:14 },

  input:     { width:"100%", padding:"12px 14px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff", boxSizing:"border-box", outline:"none", marginBottom:16 },
  appInput:  { width:"100%", padding:"12px 14px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff", boxSizing:"border-box", outline:"none", marginBottom:14 },
  halfInput: { width:"100%", padding:"12px 14px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff", boxSizing:"border-box", outline:"none" },
  select:    { width:"100%", padding:"12px 14px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff", boxSizing:"border-box", marginBottom:14 },
  gateInput: { flex:1, padding:"13px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:22, textAlign:"center", letterSpacing:6, fontWeight:800, textTransform:"uppercase", color:"#fff", outline:"none" },

  btnWhite:  { width:"100%", background:"#fff", color:"#000", border:"none", padding:"13px", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:0.5, marginTop:4 },
  btnGhost:  { background:"none", border:"none", color:"#fff", fontSize:13, cursor:"pointer", textDecoration:"underline", padding:0 },
  btnBack:   { background:"none", border:"none", color:"#555", fontSize:12, cursor:"pointer", padding:0, marginBottom:22, display:"flex", alignItems:"center", gap:5, letterSpacing:0.5 },
  btnDark:   { width:"100%", background:"#1a1a1a", color:"#fff", border:"1px solid #2a2a2a", padding:10, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", marginTop:10 },
  btnVerify: { background:"#fff", color:"#000", border:"none", padding:"13px 20px", borderRadius:10, fontWeight:700, cursor:"pointer", fontSize:14 },
  btnApp:    { width:"100%", background:"#fff", color:"#000", border:"none", padding:14, borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:0.5 },
  btnLogout: { background:"none", border:"1px solid #222", color:"#444", borderRadius:8, padding:"4px 10px", fontSize:11, cursor:"pointer", letterSpacing:0.5 },
  btnDanger: { width:"100%", background:"#1a0a0a", color:"#ff6b6b", border:"1px solid #3d1515", padding:12, borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer", marginTop:8 },

  err:     { background:"#1e0a0a", border:"1px solid #3d1515", borderRadius:8, padding:"10px 14px", color:"#ff6b6b", fontSize:13, marginBottom:16 },
  ok:      { background:"#0a1e0a", border:"1px solid #1a3d1a", borderRadius:8, padding:"10px 14px", color:"#6bff6b", fontSize:13, marginBottom:16 },
  granted: { marginTop:14, padding:16, borderRadius:10, background:"#0d1a0d", border:"1px solid #1a3d1a" },
  denied:  { marginTop:14, padding:16, borderRadius:10, background:"#1a0d0d", border:"1px solid #3d1a1a" },
  expired: { marginTop:14, padding:16, borderRadius:10, background:"#1a150a", border:"1px solid #3d2e10" },

  divider:    { height:1, background:"#1e1e1e", margin:"4px 0 18px" },
  badge:      { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:20, padding:"4px 12px", fontSize:11, color:"#777", letterSpacing:0.5 },
  badgeWhite: { background:"#fff", color:"#000", borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:700, letterSpacing:0.5 },
  badgeGray:  { background:"#1a1a1a", color:"#444", borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:600, letterSpacing:0.5 },
  badgeAmber: { background:"#1a150a", color:"#c8860a", borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:600, letterSpacing:0.5 },
  itemCard:   { background:"#141414", border:"1px solid #1e1e1e", borderRadius:14, padding:16, marginBottom:10 },
  statCard:   { background:"#141414", border:"1px solid #1e1e1e", borderRadius:12, padding:16 },
  codeBox:    { background:"#0a0a0a", border:"1px solid #1e1e1e", borderRadius:10, padding:"10px 14px", textAlign:"center", marginTop:10 },
  headerLogo: { fontWeight:800, fontSize:18, letterSpacing:4, color:"#fff" },
  headerSub:  { fontSize:9, color:"#333", letterSpacing:1.5, textTransform:"uppercase", marginTop:2 },

  roleRow: { display:"flex", gap:8, marginBottom:16 },
  roleBtn: (active) => ({
    flex:1, padding:"10px 0", borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer",
    border: active ? "1px solid #fff" : "1px solid #2a2a2a",
    background: active ? "#fff" : "#1a1a1a",
    color: active ? "#000" : "#555",
    letterSpacing:0.5, transition:"all 0.15s",
  }),
  navBtn: (active) => ({
    flex:1, background:"none", border:"none", cursor:"pointer",
    display:"flex", flexDirection:"column", alignItems:"center", gap:2,
    color: active ? "#fff" : "#333", fontWeight: active ? 700 : 400,
    fontSize:10, padding:"4px 0", letterSpacing:0.5, transition:"color 0.15s",
  }),
};

// ─── Auth Screen ──────────────────────────────────────────────────────────────

function AuthScreen({ onLogin }) {
  const [mode, setMode]   = useState("login");
  const [role, setRole]   = useState("resident");
  const [form, setForm]   = useState({ name:"", email:"", password:"", confirm:"", estateId:"", estateCode:"", adminCode:"" });
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const set      = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const goLogin  = () => { setMode("login");  setError(""); setSuccess(""); };
  const goSignup = () => { setMode("signup"); setError(""); setSuccess(""); };

  const handleLogin = async () => {
    setError("");
    const stored = await storageGet(USERS_KEY) || [];
    // stored users take priority over seeds (handles password updates + new signups)
    const all = [
      ...SEED_USERS.filter((s) => !stored.find((u) => u.email === s.email)),
      ...stored,
    ];
    const found = all.find((u) => u.email === form.email && u.password === form.password);
    if (!found) return setError("Invalid email or password.");
    const estate = ESTATES.find((e) => e.id === found.estateId);
    onLogin({ ...found, estateName: estate ? estate.name : "Estate" });
  };

  const handleSignup = async () => {
    setError(""); setSuccess("");
    const requiresAdminCode = role === "security";
    if (!form.name || !form.email || !form.password || !form.estateId || !form.estateCode)
      return setError("All fields are required.");
    if (requiresAdminCode && !form.adminCode)
      return setError("Admin code is required to register as Security.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    const estate = ESTATES.find((e) => e.id === form.estateId);
    if (!estate) return setError("Please select a valid estate.");
    if (form.estateCode !== estate.code) return setError("Invalid estate code for " + estate.name + ".");
    if (requiresAdminCode && form.adminCode !== "1234")
      return setError("Invalid admin code. Contact your estate administrator.");
    const stored = await storageGet(USERS_KEY) || [];
    const allEmails = [
      ...SEED_USERS.map((u) => u.email),
      ...stored.map((u) => u.email),
    ];
    if (allEmails.includes(form.email)) return setError("Email already registered.");
    const newUser = { email:form.email, password:form.password, name:form.name, estateId:form.estateId, role };
    await storageSet(USERS_KEY, [...stored, newUser]);
    setSuccess("Account created! Registered to " + estate.name + " as " + (role === "security" ? "Security" : "Resident") + ".");
    setMode("login");
    setForm({ name:"", email:form.email, password:"", confirm:"", estateId:"", estateCode:"", adminCode:"" });
  };

  return (
    <div style={c.page}>
      <div style={c.authCard}>
        {mode === "signup" && (
          <button style={c.btnBack} onClick={goLogin}>&larr; Back to Sign In</button>
        )}
        <div style={c.logo}>UPSIDIAN</div>
        <div style={c.logoSub}>SMART ESTATE MANAGEMENT</div>
        <div style={c.title}>{mode === "login" ? "Welcome back" : "Create account"}</div>
        <div style={c.desc}>{mode === "login" ? "Sign in to your estate portal." : "Join your estate community."}</div>

        {error   && <div style={c.err}>{error}</div>}
        {success && <div style={c.ok}>{success}</div>}

        {mode === "signup" && (
          <div>
            <label style={c.label}>I am a</label>
            <div style={c.roleRow}>
              <button style={c.roleBtn(role === "resident")} onClick={() => setRole("resident")}>Resident</button>
              <button style={c.roleBtn(role === "security")} onClick={() => setRole("security")}>Security</button>
            </div>
            <label style={c.label}>Full Name</label>
            <input style={c.input} placeholder="e.g. Adeola Martins" value={form.name} onChange={set("name")} />
          </div>
        )}

        <label style={c.label}>Email Address</label>
        <input style={c.input} type="email" placeholder="you@estate.ng" value={form.email} onChange={set("email")} />
        <label style={c.label}>Password</label>
        <input style={c.input} type="password" placeholder="Enter password" value={form.password} onChange={set("password")} />

        {mode === "signup" && (
          <div>
            <label style={c.label}>Confirm Password</label>
            <input style={c.input} type="password" placeholder="Confirm password" value={form.confirm} onChange={set("confirm")} />
            <div style={c.divider} />
            <label style={c.label}>Select Your Estate</label>
            <select value={form.estateId} onChange={set("estateId")} style={{ ...c.input, color: form.estateId ? "#fff" : "#555" }}>
              <option value="" disabled>Choose your estate...</option>
              {ESTATES.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <label style={c.label}>Estate Access Code</label>
            <input style={c.input} type="text" placeholder="Code from your estate admin" value={form.estateCode} onChange={set("estateCode")} maxLength={10} />
            {role === "security" && (
              <div>
                <div style={c.divider} />
                <label style={c.label}>Security Admin Code</label>
                <input style={c.input} type="password" placeholder="Admin-only code" value={form.adminCode} onChange={set("adminCode")} maxLength={20} />
                <div style={c.hint}>Security accounts require an admin code. Contact your estate administrator to obtain it.</div>
              </div>
            )}
            <div style={c.hint}>Your estate and role are permanent once registered.</div>
          </div>
        )}

        <button style={c.btnWhite} onClick={mode === "login" ? handleLogin : handleSignup}>
          {mode === "login" ? "Sign In" : "Create Account"} &rarr;
        </button>

        <div style={{ marginTop:22, textAlign:"center", fontSize:13, color:"#555" }}>
          {mode === "login"
            ? <span>No account yet? <button style={c.btnGhost} onClick={goSignup}>Sign up</button></span>
            : <span>Already registered? <button style={c.btnGhost} onClick={goLogin}>Sign in</button></span>}
        </div>
      </div>
    </div>
  );
}

// ─── Security Gate App ────────────────────────────────────────────────────────

function SecurityApp({ user, onLogout }) {
  const [gateCode, setGateCode]     = useState("");
  const [gateResult, setGateResult] = useState(null);
  const [accessLog, setAccessLog]   = useState([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    (async () => {
      const log = await storageGet(LOG_KEY + "_" + user.estateId) || [];
      setAccessLog(log);
    })();
  }, [user.estateId]);

  const verify = async () => {
    if (!gateCode.trim()) return;
    setLoading(true);
    setGateResult(null);
    const code       = gateCode.toUpperCase().trim();
    const allInvites = await storageGet(INVITES_KEY + "_" + user.estateId) || [];
    const found      = allInvites.find((i) => i.code === code);

    if (!found) {
      setGateResult({ type: "invalid" });
    } else if (found.status === "used") {
      setGateResult({ type: "used" });
    } else if (!isInviteValid(found)) {
      // Outside allowed time window
      setGateResult({ type: "expired", invite: found });
    } else {
      // Valid — mark used
      const updated = allInvites.map((i) => i.id === found.id ? { ...i, status:"used" } : i);
      await storageSet(INVITES_KEY + "_" + user.estateId, updated);
      const entry = {
        id: Date.now(), guest: found.guestName, resident: found.residentName,
        unit: found.residentUnit, code: found.code,
        time: new Date().toLocaleTimeString("en-NG", { timeZone:"Africa/Lagos" }),
        action: "Checked In",
      };
      const newLog = [entry, ...accessLog];
      setAccessLog(newLog);
      await storageSet(LOG_KEY + "_" + user.estateId, newLog);
      setGateResult({ type: "granted", invite: found });
    }
    setGateCode("");
    setLoading(false);
  };

  return (
    <div style={c.appWrap}>
      <div style={c.header}>
        <div>
          <div style={c.headerLogo}>UPSIDIAN</div>
          <div style={c.headerSub}>Gate Security</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={c.badge}>{user.estateName}</div>
          <button style={c.btnLogout} onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div style={c.content}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
          <div style={{ ...c.badge, fontSize:11 }}>Security Officer</div>
          <div style={{ color:"#333", fontSize:11 }}>{user.name}</div>
        </div>

        {/* Verify panel */}
        <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:16, padding:20, marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Verify Guest Access</div>
          <div style={{ color:"#555", fontSize:13, marginBottom:18 }}>Enter the 6-character code from the resident's invite.</div>
          <div style={{ display:"flex", gap:8, marginBottom:6 }}>
            <input
              value={gateCode}
              onChange={(e) => setGateCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              placeholder="AB12CD"
              maxLength={6}
              style={c.gateInput}
            />
            <button style={c.btnVerify} onClick={verify} disabled={loading}>
              {loading ? "..." : "Verify"}
            </button>
          </div>
          <div style={{ fontSize:11, color:"#2a2a2a" }}>Press Enter or tap Verify to check.</div>

          {gateResult && (
            <>
              {gateResult.type === "granted" && (
                <div style={c.granted}>
                  <div style={{ color:"#6bff6b", fontWeight:700, fontSize:15, marginBottom:12 }}>✓ Access Granted</div>
                  {[
                    ["Guest",    gateResult.invite.guestName],
                    ["Visiting", gateResult.invite.residentName],
                    ["Unit",     gateResult.invite.residentUnit],
                    ["Purpose",  gateResult.invite.purpose || "—"],
                    ["Window",   fmtNigeriaTime(gateResult.invite.date, gateResult.invite.timeFrom) + " – " + fmtNigeriaTime(gateResult.invite.date, gateResult.invite.timeTo)],
                  ].map(([k, v]) => (
                    <div key={k} style={{ fontSize:13, color:"#888", marginBottom:5 }}>
                      <span style={{ color:"#333", display:"inline-block", minWidth:64 }}>{k}</span>{v}
                    </div>
                  ))}
                </div>
              )}
              {gateResult.type === "expired" && (
                <div style={c.expired}>
                  <div style={{ color:"#c8860a", fontWeight:700, fontSize:15, marginBottom:8 }}>⏱ Outside Visit Window</div>
                  <div style={{ fontSize:13, color:"#7a5a20" }}>
                    This code is valid only between{" "}
                    <strong>{fmtNigeriaTime(gateResult.invite.date, gateResult.invite.timeFrom)}</strong>
                    {" "}and{" "}
                    <strong>{fmtNigeriaTime(gateResult.invite.date, gateResult.invite.timeTo)}</strong>.
                  </div>
                </div>
              )}
              {gateResult.type === "used" && (
                <div style={c.denied}>
                  <div style={{ color:"#ff6b6b", fontWeight:700, fontSize:15, marginBottom:6 }}>✗ Code Already Used</div>
                  <div style={{ fontSize:13, color:"#773333" }}>This code has already been checked in.</div>
                </div>
              )}
              {gateResult.type === "invalid" && (
                <div style={c.denied}>
                  <div style={{ color:"#ff6b6b", fontWeight:700, fontSize:15, marginBottom:6 }}>✗ Invalid Code</div>
                  <div style={{ fontSize:13, color:"#773333" }}>No matching invite found for this estate.</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Access log */}
        <div style={c.section}>Today's Access Log</div>
        {accessLog.length === 0 ? (
          <div style={{ color:"#2a2a2a", fontSize:13, padding:"12px 0" }}>No check-ins yet.</div>
        ) : (
          accessLog.map((log) => (
            <div key={log.id} style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:10, padding:12, marginBottom:8, fontSize:13 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <strong style={{ color:"#e0e0e0" }}>{log.guest}</strong>
                <span style={{ color:"#6bff6b", fontSize:11 }}>{log.action}</span>
              </div>
              <div style={{ color:"#444" }}>{log.resident} &middot; {log.unit}</div>
              <div style={{ color:"#2a2a2a", fontSize:11, marginTop:3 }}>{log.time}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Resident App ─────────────────────────────────────────────────────────────

function ResidentApp({ user, onLogout, onUserUpdate }) {
  const [view, setView]         = useState("dashboard");
  const [invites, setInvites]   = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [inviteForm, setInviteForm] = useState({
    guestName:"", guestPhone:"", purpose:"", date:"", timeFrom:"", timeTo:"", residentId:1,
  });
  const [inviteErr, setInviteErr] = useState("");

  const loadInvites = useCallback(async () => {
    const stored = await storageGet(INVITES_KEY + "_" + user.estateId) || [];
    setInvites(stored);
    setLoadingInvites(false);
  }, [user.estateId]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const createInvite = async () => {
    setInviteErr("");
    const { guestName, date, timeFrom, timeTo } = inviteForm;
    if (!guestName || !date || !timeFrom || !timeTo) return setInviteErr("Guest name, date, arrival and expiry time are required.");
    if (timeFrom >= timeTo) return setInviteErr("Expiry time must be after arrival time.");

    const resident  = RESIDENTS.find((r) => r.id === Number(inviteForm.residentId));
    const newInvite = {
      id: Date.now(),
      guestName:    inviteForm.guestName,
      guestPhone:   inviteForm.guestPhone,
      purpose:      inviteForm.purpose,
      date,
      timeFrom,
      timeTo,
      residentId:   inviteForm.residentId,
      residentName: resident?.name,
      residentUnit: resident?.unit,
      createdBy:    user.email,
      estateId:     user.estateId,
      code:         generateCode(),
      status:       "pending",
      createdAt:    new Date().toLocaleString("en-NG", { timeZone:"Africa/Lagos" }),
    };
    const stored  = await storageGet(INVITES_KEY + "_" + user.estateId) || [];
    const updated = [newInvite, ...stored];
    await storageSet(INVITES_KEY + "_" + user.estateId, updated);
    setInvites(updated);
    setInviteForm({ guestName:"", guestPhone:"", purpose:"", date:"", timeFrom:"", timeTo:"", residentId:1 });
  };

  const myInvites = invites.filter((i) => i.createdBy === user.email);

  // Badge colour based on invite state
  const inviteBadge = (inv) => {
    if (inv.status === "used") return { style: c.badgeGray, label: "Used" };
    const now   = nowNigeria();
    const start = parseNigeriaDateTime(inv.date, inv.timeFrom);
    const end   = parseNigeriaDateTime(inv.date, inv.timeTo);
    if (now > end)   return { style: c.badgeGray,  label: "Expired" };
    if (now < start) return { style: c.badgeWhite, label: "Upcoming" };
    return { style: c.badgeWhite, label: "Active" };
  };

  const InviteCard = ({ inv }) => {
    const { style: badgeStyle, label: badgeLabel } = inviteBadge(inv);
    return (
      <div style={c.itemCard}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <strong style={{ fontSize:14, color:"#e0e0e0" }}>{inv.guestName}</strong>
          <span style={badgeStyle}>{badgeLabel}</span>
        </div>
        <div style={{ fontSize:12, color:"#555", marginBottom:2 }}>
          {inv.date}{inv.purpose ? " · " + inv.purpose : ""}
        </div>
        <div style={{ fontSize:11, color:"#444" }}>
          {inv.timeFrom} – {inv.timeTo} (Nigeria time)
        </div>
        <div style={c.codeBox}>
          <div style={{ fontSize:10, color:"#333", letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 }}>Access Code</div>
          <div style={{ fontSize:24, fontWeight:800, letterSpacing:6, color:"#fff" }}>{inv.code}</div>
        </div>
      </div>
    );
  };

  const navItems = [
    { id:"dashboard", label:"Home",    icon:"⌂" },
    { id:"invite",    label:"Invite",  icon:"✉" },
    { id:"alerts",    label:"Alerts",  icon:"◎" },
    { id:"profile",   label:"Profile", icon:"◯" },
  ];

  return (
    <div style={c.appWrap}>
      <div style={c.header}>
        <div>
          <div style={c.headerLogo}>UPSIDIAN</div>
          <div style={c.headerSub}>Estate Portal</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={c.badge}>{user.estateName}</div>
          <button style={c.btnLogout} onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div style={c.content}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div>
            <p style={c.greet}>Good day, <strong style={{ color:"#fff" }}>{user.name}</strong></p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
              {[
                { label:"Active Invites",   value: myInvites.filter((i) => i.status === "pending" && isInviteValid(i)).length },
                { label:"Total Invites",    value: myInvites.length },
                { label:"Upcoming Invites", value: myInvites.filter((i) => i.status === "pending" && nowNigeria() < parseNigeriaDateTime(i.date, i.timeFrom)).length },
                { label:"Alerts",           value: ALERTS.length },
              ].map((s) => (
                <div key={s.label} style={c.statCard}>
                  <div style={{ fontSize:28, fontWeight:800, color:"#fff" }}>{s.value}</div>
                  <div style={{ fontSize:11, color:"#444", marginTop:2, letterSpacing:0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={c.section}>Recent Alerts</div>
            {ALERTS.map((a) => (
              <div key={a.id} style={{ background:"#141414", border:"1px solid #1e1e1e", borderLeft:"3px solid "+(a.type==="warning"?"#888":"#444"), borderRadius:8, padding:"12px 14px", marginBottom:8, fontSize:13, color: a.type==="warning"?"#bbb":"#aaa" }}>
                {a.message}
                <div style={{ color:"#333", fontSize:11, marginTop:5 }}>{a.time}</div>
              </div>
            ))}

            <div style={{ marginTop:20 }}>
              <div style={c.section}>Your Recent Invites</div>
              {loadingInvites ? (
                <div style={{ color:"#2a2a2a", fontSize:13 }}>Loading...</div>
              ) : myInvites.length === 0 ? (
                <div style={{ color:"#2a2a2a", fontSize:13, padding:"12px 0" }}>No invites yet. Head to the Invite tab.</div>
              ) : (
                myInvites.slice(0, 3).map((inv) => <InviteCard key={inv.id} inv={inv} />)
              )}
            </div>
          </div>
        )}

        {/* INVITE */}
        {view === "invite" && (
          <div>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>Guest Invite</div>
            <div style={{ color:"#555", fontSize:13, marginBottom:20 }}>
              Generate a one-time code. Set a time window during which your visitor can use it (Nigeria time).
            </div>

            {inviteErr && <div style={c.err}>{inviteErr}</div>}

            {/* Basic fields */}
            {[
              { label:"Guest Name",       key:"guestName",  type:"text", placeholder:"e.g. John Doe" },
              { label:"Guest Phone",      key:"guestPhone", type:"tel",  placeholder:"e.g. 08012345678" },
              { label:"Purpose of Visit", key:"purpose",    type:"text", placeholder:"e.g. Family visit" },
            ].map((f) => (
              <div key={f.key}>
                <label style={c.label}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder} value={inviteForm[f.key]}
                  onChange={(e) => setInviteForm({ ...inviteForm, [f.key]: e.target.value })}
                  style={c.appInput} />
              </div>
            ))}

            {/* Date */}
            <label style={c.label}>Visit Date</label>
            <input type="date" value={inviteForm.date}
              onChange={(e) => setInviteForm({ ...inviteForm, date: e.target.value })}
              style={c.appInput} />

            {/* Time window */}
            <label style={c.label}>Arrival Time (Nigeria)</label>
            <input type="time" value={inviteForm.timeFrom}
              onChange={(e) => setInviteForm({ ...inviteForm, timeFrom: e.target.value })}
              style={c.appInput} />

            <label style={c.label}>Code Expires At (Nigeria)</label>
            <input type="time" value={inviteForm.timeTo}
              onChange={(e) => setInviteForm({ ...inviteForm, timeTo: e.target.value })}
              style={c.appInput} />

            <div style={{ fontSize:11, color:"#333", marginTop:-8, marginBottom:16, lineHeight:1.6 }}>
              The visitor can only use this code within the time window you set. After the expiry time the code will be rejected at the gate.
            </div>

            {/* Resident */}
            <label style={c.label}>Resident</label>
            <select value={inviteForm.residentId}
              onChange={(e) => setInviteForm({ ...inviteForm, residentId: Number(e.target.value) })}
              style={c.select}>
              {RESIDENTS.map((r) => (
                <option key={r.id} value={r.id}>{r.name} – {r.unit}</option>
              ))}
            </select>

            <button style={c.btnApp} onClick={createInvite}>Generate Invite Code &rarr;</button>

            <div style={{ marginTop:28 }}>
              <div style={c.section}>Your Invites</div>
              {loadingInvites ? (
                <div style={{ color:"#2a2a2a", fontSize:13 }}>Loading...</div>
              ) : myInvites.length === 0 ? (
                <div style={{ color:"#2a2a2a", fontSize:13 }}>No invites yet.</div>
              ) : (
                myInvites.map((inv) => <InviteCard key={inv.id} inv={inv} />)
              )}
            </div>
          </div>
        )}

        {/* ALERTS */}
        {view === "alerts" && (
          <div>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>Community Alerts</div>
            <div style={{ color:"#555", fontSize:13, marginBottom:20 }}>Stay informed about estate updates.</div>
            {ALERTS.map((a) => (
              <div key={a.id} style={{ background:"#141414", border:"1px solid #1e1e1e", borderLeft:"3px solid "+(a.type==="warning"?"#888":"#444"), borderRadius:12, padding:16, marginBottom:12 }}>
                <div style={{ fontSize:14, color:"#bbb" }}>{a.message}</div>
                <div style={{ color:"#333", fontSize:11, marginTop:6 }}>{a.time}</div>
              </div>
            ))}
          </div>
        )}

        {/* PROFILE */}
        {view === "profile" && (
          <ProfileView user={user} onUserUpdate={onUserUpdate} onLogout={onLogout} />
        )}

      </div>

      <div style={c.bottomNav}>
        {navItems.map((item) => (
          <button key={item.id} onClick={() => setView(item.id)} style={c.navBtn(view === item.id)}>
            <span style={{ fontSize:18 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Profile View (shared by resident + security) ────────────────────────────

function ProfileView({ user, onUserUpdate, onLogout }) {
  const [pwForm, setPwForm] = useState({ current:"", newPw:"", confirm:"" });
  const [pwErr, setPwErr]   = useState("");
  const [pwOk,  setPwOk]    = useState("");

  const setPw = (k) => (e) => setPwForm((p) => ({ ...p, [k]: e.target.value }));

  const handleChangePassword = async () => {
    setPwErr(""); setPwOk("");
    if (!pwForm.current || !pwForm.newPw || !pwForm.confirm)
      return setPwErr("All fields are required.");
    if (pwForm.newPw !== pwForm.confirm)
      return setPwErr("New passwords do not match.");
    if (pwForm.newPw.length < 6)
      return setPwErr("Password must be at least 6 characters.");
    if (pwForm.current !== user.password)
      return setPwErr("Current password is incorrect.");

    // stored users override seeds
    const stored = await storageGet(USERS_KEY) || [];
    const seedMatch = SEED_USERS.find((u) => u.email === user.email);
    const existingIdx = stored.findIndex((u) => u.email === user.email);

    if (existingIdx >= 0) {
      // Already in stored — just update
      const updated = stored.map((u) => u.email === user.email ? { ...u, password: pwForm.newPw } : u);
      await storageSet(USERS_KEY, updated);
    } else if (seedMatch) {
      // Seed user — add override record to stored
      await storageSet(USERS_KEY, [...stored, { ...seedMatch, password: pwForm.newPw }]);
    }

    onUserUpdate({ ...user, password: pwForm.newPw });
    setPwOk("Password updated successfully.");
    setPwForm({ current:"", newPw:"", confirm:"" });
  };

  const estate = ESTATES.find((e) => e.id === user.estateId);

  return (
    <div>
      <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>My Profile</div>
      <div style={{ color:"#555", fontSize:13, marginBottom:24 }}>Manage your account details.</div>

      {/* Account info */}
      <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:14, padding:20, marginBottom:16 }}>
        <div style={c.section}>Account Info</div>

        {/* Avatar circle */}
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20 }}>
          <div style={{ width:56, height:56, borderRadius:"50%", background:"#222", border:"1px solid #333", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:700, color:"#fff" }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight:700, color:"#fff", fontSize:15 }}>{user.name}</div>
            <div style={{ fontSize:12, color:"#555", marginTop:2 }}>{user.email}</div>
          </div>
        </div>

        {[
          ["Estate",  estate ? estate.name : user.estateId],
          ["Role",    user.role === "security" ? "Security Officer" : "Resident"],
        ].map(([k, v]) => (
          <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderTop:"1px solid #1a1a1a" }}>
            <span style={{ fontSize:12, color:"#555", letterSpacing:0.5 }}>{k}</span>
            <span style={{ fontSize:13, color:"#888" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Change password */}
      <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:14, padding:20, marginBottom:16 }}>
        <div style={c.section}>Change Password</div>

        {pwErr && <div style={c.err}>{pwErr}</div>}
        {pwOk  && <div style={c.ok}>{pwOk}</div>}

        <label style={c.label}>Current Password</label>
        <input style={c.appInput} type="password" placeholder="Your current password" value={pwForm.current} onChange={setPw("current")} />
        <label style={c.label}>New Password</label>
        <input style={c.appInput} type="password" placeholder="At least 6 characters" value={pwForm.newPw} onChange={setPw("newPw")} />
        <label style={c.label}>Confirm New Password</label>
        <input style={{ ...c.appInput, marginBottom:0 }} type="password" placeholder="Repeat new password" value={pwForm.confirm} onChange={setPw("confirm")} />
        <div style={{ marginTop:14 }}>
          <button style={c.btnApp} onClick={handleChangePassword}>Update Password</button>
        </div>
      </div>

      {/* Logout */}
      <button style={c.btnDanger} onClick={onLogout}>Sign Out</button>
    </div>
  );
}

// ─── Security App with profile tab ───────────────────────────────────────────

function SecurityAppWithProfile({ user, onLogout, onUserUpdate }) {
  const [view, setView]             = useState("gate");
  const [gateCode, setGateCode]     = useState("");
  const [gateResult, setGateResult] = useState(null);
  const [accessLog, setAccessLog]   = useState([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    (async () => {
      const log = await storageGet(LOG_KEY + "_" + user.estateId) || [];
      setAccessLog(log);
    })();
  }, [user.estateId]);

  const verify = async () => {
    if (!gateCode.trim()) return;
    setLoading(true);
    setGateResult(null);
    const code       = gateCode.toUpperCase().trim();
    const allInvites = await storageGet(INVITES_KEY + "_" + user.estateId) || [];
    const found      = allInvites.find((i) => i.code === code);

    if (!found) {
      setGateResult({ type:"invalid" });
    } else if (found.status === "used") {
      setGateResult({ type:"used" });
    } else if (!isInviteValid(found)) {
      setGateResult({ type:"expired", invite:found });
    } else {
      const updated = allInvites.map((i) => i.id === found.id ? { ...i, status:"used" } : i);
      await storageSet(INVITES_KEY + "_" + user.estateId, updated);
      const entry = {
        id: Date.now(), guest: found.guestName, resident: found.residentName,
        unit: found.residentUnit, code: found.code,
        time: new Date().toLocaleTimeString("en-NG", { timeZone:"Africa/Lagos" }),
        action: "Checked In",
      };
      const newLog = [entry, ...accessLog];
      setAccessLog(newLog);
      await storageSet(LOG_KEY + "_" + user.estateId, newLog);
      setGateResult({ type:"granted", invite:found });
    }
    setGateCode("");
    setLoading(false);
  };

  const navItems = [
    { id:"gate",    label:"Gate",    icon:"◉" },
    { id:"profile", label:"Profile", icon:"◯" },
  ];

  return (
    <div style={c.appWrap}>
      <div style={c.header}>
        <div>
          <div style={c.headerLogo}>UPSIDIAN</div>
          <div style={c.headerSub}>Gate Security</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={c.badge}>{user.estateName}</div>
          <button style={c.btnLogout} onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div style={c.content}>

        {view === "gate" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
              <div style={{ ...c.badge, fontSize:11 }}>Security Officer</div>
              <div style={{ color:"#333", fontSize:11 }}>{user.name}</div>
            </div>

            <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:16, padding:20, marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Verify Guest Access</div>
              <div style={{ color:"#555", fontSize:13, marginBottom:18 }}>Enter the 6-character code from the resident's invite.</div>
              <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                <input value={gateCode} onChange={(e) => setGateCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && verify()}
                  placeholder="AB12CD" maxLength={6} style={c.gateInput} />
                <button style={c.btnVerify} onClick={verify} disabled={loading}>
                  {loading ? "..." : "Verify"}
                </button>
              </div>
              <div style={{ fontSize:11, color:"#2a2a2a" }}>Press Enter or tap Verify.</div>

              {gateResult && (
                <>
                  {gateResult.type === "granted" && (
                    <div style={c.granted}>
                      <div style={{ color:"#6bff6b", fontWeight:700, fontSize:15, marginBottom:12 }}>✓ Access Granted</div>
                      {[
                        ["Guest",    gateResult.invite.guestName],
                        ["Visiting", gateResult.invite.residentName],
                        ["Unit",     gateResult.invite.residentUnit],
                        ["Purpose",  gateResult.invite.purpose || "—"],
                        ["Window",   fmtNigeriaTime(gateResult.invite.date, gateResult.invite.timeFrom) + " – " + fmtNigeriaTime(gateResult.invite.date, gateResult.invite.timeTo)],
                      ].map(([k, v]) => (
                        <div key={k} style={{ fontSize:13, color:"#888", marginBottom:5 }}>
                          <span style={{ color:"#333", display:"inline-block", minWidth:64 }}>{k}</span>{v}
                        </div>
                      ))}
                    </div>
                  )}
                  {gateResult.type === "expired" && (
                    <div style={c.expired}>
                      <div style={{ color:"#c8860a", fontWeight:700, fontSize:15, marginBottom:8 }}>⏱ Outside Visit Window</div>
                      <div style={{ fontSize:13, color:"#7a5a20" }}>
                        Valid between <strong>{fmtNigeriaTime(gateResult.invite.date, gateResult.invite.timeFrom)}</strong> and <strong>{fmtNigeriaTime(gateResult.invite.date, gateResult.invite.timeTo)}</strong>.
                      </div>
                    </div>
                  )}
                  {gateResult.type === "used" && (
                    <div style={c.denied}>
                      <div style={{ color:"#ff6b6b", fontWeight:700, fontSize:15, marginBottom:6 }}>✗ Code Already Used</div>
                      <div style={{ fontSize:13, color:"#773333" }}>This code has already been checked in.</div>
                    </div>
                  )}
                  {gateResult.type === "invalid" && (
                    <div style={c.denied}>
                      <div style={{ color:"#ff6b6b", fontWeight:700, fontSize:15, marginBottom:6 }}>✗ Invalid Code</div>
                      <div style={{ fontSize:13, color:"#773333" }}>No matching invite found for this estate.</div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={c.section}>Today's Access Log</div>
            {accessLog.length === 0 ? (
              <div style={{ color:"#2a2a2a", fontSize:13, padding:"12px 0" }}>No check-ins yet.</div>
            ) : (
              accessLog.map((log) => (
                <div key={log.id} style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:10, padding:12, marginBottom:8, fontSize:13 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <strong style={{ color:"#e0e0e0" }}>{log.guest}</strong>
                    <span style={{ color:"#6bff6b", fontSize:11 }}>{log.action}</span>
                  </div>
                  <div style={{ color:"#444" }}>{log.resident} &middot; {log.unit}</div>
                  <div style={{ color:"#2a2a2a", fontSize:11, marginTop:3 }}>{log.time}</div>
                </div>
              ))
            )}
          </div>
        )}

        {view === "profile" && (
          <ProfileView user={user} onUserUpdate={onUserUpdate} onLogout={onLogout} />
        )}

      </div>

      <div style={c.bottomNav}>
        {navItems.map((item) => (
          <button key={item.id} onClick={() => setView(item.id)} style={c.navBtn(view === item.id)}>
            <span style={{ fontSize:18 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function UpsidianApp() {
  const [user, setUser] = useState(null);
  const logout          = () => setUser(null);
  const updateUser      = (updated) => setUser(updated);

  if (!user) return <AuthScreen onLogin={setUser} />;
  if (user.role === "security")
    return <SecurityAppWithProfile user={user} onLogout={logout} onUserUpdate={updateUser} />;
  return <ResidentApp user={user} onLogout={logout} onUserUpdate={updateUser} />;
}