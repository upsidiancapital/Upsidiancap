import { useState, useEffect, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const ESTATES = [
  { id: "cove_towers",   name: "Cove Towers",   code: "1234" },
  { id: "banana_island", name: "Banana Island",  code: "5678" },
];

// Seeded users — residents and security per estate
const SEED_USERS = [
  { email: "adeola@cove.ng",    password: "password123", name: "Adeola",      estateId: "cove_towers",   role: "resident" },
  { email: "chukwu@banana.ng",  password: "password123", name: "Chukwuemeka", estateId: "banana_island", role: "resident" },
  { email: "gate@cove.ng",      password: "gate1234",    name: "Gate Officer", estateId: "cove_towers",  role: "security" },
  { email: "gate@banana.ng",    password: "gate5678",    name: "Gate Officer", estateId: "banana_island", role: "security" },
];

const RESIDENTS = [
  { id: 1, name: "Adeola Martins",   unit: "Block A, No. 12" },
  { id: 2, name: "Chukwuemeka Obi",  unit: "Block B, No. 5"  },
];

const ALERTS = [
  { id: 1, type: "info",    message: "Water supply will be interrupted Friday 8am to 12pm.", time: "2h ago" },
  { id: 2, type: "warning", message: "Suspicious vehicle spotted near Gate 2. Please be alert.", time: "5h ago" },
];

// ─── Storage helpers (shared across devices via window.storage) ───────────────

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

// ─── Styles ──────────────────────────────────────────────────────────────────

const c = {
  // layout
  page:      { fontFamily:"'DM Sans','Helvetica Neue',sans-serif", minHeight:"100vh", background:"#0a0a0a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px" },
  card:      { background:"#141414", border:"1px solid #2a2a2a", borderRadius:20, padding:"40px 32px", width:"100%", maxWidth:390 },
  appWrap:   { fontFamily:"'DM Sans','Helvetica Neue',sans-serif", maxWidth:430, margin:"0 auto", minHeight:"100vh", background:"#0f0f0f", display:"flex", flexDirection:"column", color:"#fff" },
  header:    { background:"#141414", borderBottom:"1px solid #1e1e1e", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" },
  content:   { flex:1, padding:16, overflowY:"auto" },
  bottomNav: { display:"flex", background:"#141414", borderTop:"1px solid #1e1e1e", padding:"6px 0" },

  // typography
  logo:     { fontSize:24, fontWeight:800, color:"#fff", letterSpacing:4, marginBottom:4 },
  logoSub:  { fontSize:10, color:"#444", letterSpacing:1.5, marginBottom:30 },
  title:    { fontSize:20, fontWeight:700, color:"#fff", marginBottom:5 },
  desc:     { fontSize:13, color:"#555", marginBottom:24 },
  label:    { fontSize:10, fontWeight:600, color:"#666", letterSpacing:1.5, display:"block", marginBottom:7, textTransform:"uppercase" },
  hint:     { fontSize:11, color:"#333", marginTop:-10, marginBottom:16, lineHeight:1.6 },
  section:  { fontWeight:700, fontSize:11, color:"#555", letterSpacing:2, textTransform:"uppercase", marginBottom:10, marginTop:4 },
  greet:    { color:"#555", marginBottom:16, fontSize:14 },

  // inputs
  input:    { width:"100%", padding:"12px 14px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff", boxSizing:"border-box", outline:"none", marginBottom:16 },
  appInput: { width:"100%", padding:"12px 14px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff", boxSizing:"border-box", outline:"none", marginBottom:14 },
  select:   { width:"100%", padding:"12px 14px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff", boxSizing:"border-box", marginBottom:14 },
  gateInput:{ flex:1, padding:"13px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:22, textAlign:"center", letterSpacing:6, fontWeight:800, textTransform:"uppercase", color:"#fff", outline:"none" },

  // buttons
  btnWhite: { width:"100%", background:"#fff", color:"#000", border:"none", padding:"13px", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:0.5, marginTop:4 },
  btnGhost: { background:"none", border:"none", color:"#fff", fontSize:13, cursor:"pointer", textDecoration:"underline", padding:0 },
  btnBack:  { background:"none", border:"none", color:"#555", fontSize:12, cursor:"pointer", padding:0, marginBottom:22, display:"flex", alignItems:"center", gap:5, letterSpacing:0.5 },
  btnSec:   { width:"100%", background:"#1a1a1a", color:"#fff", border:"1px solid #2a2a2a", padding:10, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", marginTop:10 },
  btnVerify:{ background:"#fff", color:"#000", border:"none", padding:"13px 20px", borderRadius:10, fontWeight:700, cursor:"pointer", fontSize:14 },
  btnApp:   { width:"100%", background:"#fff", color:"#000", border:"none", padding:14, borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:0.5 },
  btnLogout:{ background:"none", border:"1px solid #222", color:"#444", borderRadius:8, padding:"4px 10px", fontSize:11, cursor:"pointer", letterSpacing:0.5 },

  // feedback
  err:     { background:"#1e0a0a", border:"1px solid #3d1515", borderRadius:8, padding:"10px 14px", color:"#ff6b6b", fontSize:13, marginBottom:16 },
  ok:      { background:"#0a1e0a", border:"1px solid #1a3d1a", borderRadius:8, padding:"10px 14px", color:"#6bff6b", fontSize:13, marginBottom:16 },
  granted: { marginTop:14, padding:16, borderRadius:10, background:"#0d1a0d", border:"1px solid #1a3d1a" },
  denied:  { marginTop:14, padding:16, borderRadius:10, background:"#1a0d0d", border:"1px solid #3d1a1a" },

  // misc
  divider:    { height:1, background:"#1e1e1e", margin:"4px 0 18px" },
  badge:      { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:20, padding:"4px 12px", fontSize:11, color:"#777", letterSpacing:0.5 },
  badgeWhite: { background:"#fff", color:"#000", borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:700, letterSpacing:0.5 },
  badgeGray:  { background:"#1a1a1a", color:"#444", borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:600, letterSpacing:0.5 },
  itemCard:   { background:"#141414", border:"1px solid #1e1e1e", borderRadius:14, padding:16, marginBottom:10 },
  statCard:   { background:"#141414", border:"1px solid #1e1e1e", borderRadius:12, padding:16 },
  codeBox:    { background:"#0a0a0a", border:"1px solid #1e1e1e", borderRadius:10, padding:"10px 14px", textAlign:"center", marginTop:10 },
  demoBox:    { marginTop:28, padding:"14px", background:"#0a0a0a", borderRadius:10, border:"1px solid #1a1a1a" },
  headerLogo: { fontWeight:800, fontSize:18, letterSpacing:4, color:"#fff" },
  headerSub:  { fontSize:9, color:"#333", letterSpacing:1.5, textTransform:"uppercase", marginTop:2 },

  // role toggle
  roleRow:  { display:"flex", gap:8, marginBottom:16 },
  roleBtn:  (active) => ({
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

// ─── Auth Screen ─────────────────────────────────────────────────────────────

function AuthScreen({ onLogin }) {
  const [mode, setMode]   = useState("login");
  const [role, setRole]   = useState("resident");
  const [form, setForm]   = useState({ name:"", email:"", password:"", confirm:"", estateId:"", estateCode:"" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const goLogin  = () => { setMode("login");  setError(""); setSuccess(""); };
  const goSignup = () => { setMode("signup"); setError(""); setSuccess(""); };

  const handleLogin = async () => {
    setError("");
    // Check persistent users first, fall back to seeds
    const stored = await storageGet(USERS_KEY) || [];
    const all = [...SEED_USERS, ...stored];
    const found = all.find((u) => u.email === form.email && u.password === form.password);
    if (!found) return setError("Invalid email or password.");
    const estate = ESTATES.find((e) => e.id === found.estateId);
    onLogin({ ...found, estateName: estate ? estate.name : "Estate" });
  };

  const handleSignup = async () => {
    setError(""); setSuccess("");
    if (!form.name || !form.email || !form.password || !form.estateId || !form.estateCode)
      return setError("All fields are required.");
    if (form.password !== form.confirm)
      return setError("Passwords do not match.");
    const estate = ESTATES.find((e) => e.id === form.estateId);
    if (!estate) return setError("Please select a valid estate.");
    if (form.estateCode !== estate.code)
      return setError("Invalid access code for " + estate.name + ".");
    const stored = await storageGet(USERS_KEY) || [];
    const all = [...SEED_USERS, ...stored];
    if (all.find((u) => u.email === form.email))
      return setError("Email already registered.");
    const newUser = { email:form.email, password:form.password, name:form.name, estateId:form.estateId, role };
    await storageSet(USERS_KEY, [...stored, newUser]);
    setSuccess("Account created! You are registered to " + estate.name + " as " + (role === "security" ? "Security" : "Resident") + ".");
    setMode("login");
    setForm({ name:"", email:form.email, password:"", confirm:"", estateId:"", estateCode:"" });
  };

  return (
    <div style={c.page}>
      <div style={c.card}>
        {mode === "signup" && (
          <button style={c.btnBack} onClick={goLogin}>&larr; Back to Sign In</button>
        )}

        <div style={c.logo}>UPSIDIAN</div>
        <div style={c.logoSub}>SMART ESTATE MANAGEMENT</div>

        <div style={c.title}>{mode === "login" ? "Welcome back" : "Create account"}</div>
        <div style={c.desc}>{mode === "login" ? "Sign in to your estate portal." : "Join your estate community."}</div>

        {error   && <div style={c.err}>{error}</div>}
        {success && <div style={c.ok}>{success}</div>}

        {/* Role toggle — signup only */}
        {mode === "signup" && (
          <div>
            <label style={c.label}>I am a</label>
            <div style={c.roleRow}>
              <button style={c.roleBtn(role === "resident")} onClick={() => setRole("resident")}>Resident</button>
              <button style={c.roleBtn(role === "security")} onClick={() => setRole("security")}>Security</button>
            </div>
          </div>
        )}

        {mode === "signup" && (
          <div>
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
            <div style={c.hint}>Your estate and role are permanent once registered.</div>
          </div>
        )}

        <button style={c.btnWhite} onClick={mode === "login" ? handleLogin : handleSignup}>
          {mode === "login" ? "Sign In" : "Create Account"} &rarr;
        </button>

        <div style={{ marginTop:22, textAlign:"center", fontSize:13, color:"#555" }}>
          {mode === "login" ? (
            <span>No account yet? <button style={c.btnGhost} onClick={goSignup}>Sign up</button></span>
          ) : (
            <span>Already registered? <button style={c.btnGhost} onClick={goLogin}>Sign in</button></span>
          )}
        </div>

        {/* Demo hint */}
        <div style={c.demoBox}>
          <div style={{ fontSize:10, color:"#2e2e2e", letterSpacing:1.5, textTransform:"uppercase", marginBottom:8 }}>Demo Credentials</div>
          <div style={{ fontSize:12, color:"#3a3a3a", marginBottom:3 }}>Resident — adeola@cove.ng / password123</div>
          <div style={{ fontSize:12, color:"#3a3a3a", marginBottom:3 }}>Resident — chukwu@banana.ng / password123</div>
          <div style={{ fontSize:12, color:"#3a3a3a", marginBottom:3 }}>Security — gate@cove.ng / gate1234</div>
          <div style={{ fontSize:12, color:"#3a3a3a", marginBottom:10 }}>Security — gate@banana.ng / gate5678</div>
          <div style={{ ...c.divider, marginTop:4 }} />
          <div style={{ fontSize:10, color:"#2e2e2e", letterSpacing:1.5, textTransform:"uppercase", marginBottom:6, marginTop:10 }}>Estate Codes (sign up)</div>
          <div style={{ fontSize:12, color:"#3a3a3a", marginBottom:3 }}>Cove Towers &rarr; <span style={{ color:"#4a4a4a", fontWeight:700 }}>1234</span></div>
          <div style={{ fontSize:12, color:"#3a3a3a" }}>Banana Island &rarr; <span style={{ color:"#4a4a4a", fontWeight:700 }}>5678</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── Security Gate View ───────────────────────────────────────────────────────

function SecurityApp({ user, onLogout }) {
  const [gateCode, setGateCode]     = useState("");
  const [gateResult, setGateResult] = useState(null);
  const [accessLog, setAccessLog]   = useState([]);
  const [loading, setLoading]       = useState(false);

  // Load persisted log for this estate on mount
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
    const code = gateCode.toUpperCase().trim();

    // Pull latest invites from shared store
    const allInvites = await storageGet(INVITES_KEY + "_" + user.estateId) || [];
    const found = allInvites.find((i) => i.code === code && i.status === "pending");

    if (found) {
      // Mark as used in shared store
      const updated = allInvites.map((i) => i.id === found.id ? { ...i, status:"used" } : i);
      await storageSet(INVITES_KEY + "_" + user.estateId, updated);

      const entry = {
        id: Date.now(),
        guest: found.guestName,
        resident: found.residentName,
        unit: found.residentUnit,
        code: found.code,
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
        action: "Checked In",
      };
      const newLog = [entry, ...accessLog];
      setAccessLog(newLog);
      await storageSet(LOG_KEY + "_" + user.estateId, newLog);
      setGateResult({ success:true, invite:found });
    } else {
      // Check if it was already used
      const usedInvite = allInvites.find((i) => i.code === code && i.status === "used");
      setGateResult({ success:false, alreadyUsed: !!usedInvite });
    }
    setGateCode("");
    setLoading(false);
  };

  return (
    <div style={c.appWrap}>
      {/* Header */}
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
        {/* Role pill */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
          <div style={{ ...c.badge, background:"#1a1a1a", color:"#888", fontSize:11 }}>
            Security Officer
          </div>
          <div style={{ color:"#333", fontSize:11 }}>{user.name}</div>
        </div>

        {/* Code entry */}
        <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:16, padding:20, marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Verify Guest Access</div>
          <div style={{ color:"#555", fontSize:13, marginBottom:18 }}>Enter the code shown on the resident's invite.</div>

          <div style={{ display:"flex", gap:8, marginBottom:4 }}>
            <input
              value={gateCode}
              onChange={(e) => setGateCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              placeholder="e.g. AB12CD"
              maxLength={6}
              style={c.gateInput}
            />
            <button style={c.btnVerify} onClick={verify} disabled={loading}>
              {loading ? "..." : "Verify"}
            </button>
          </div>
          <div style={{ fontSize:11, color:"#2a2a2a", marginTop:6 }}>Press Enter or tap Verify to check the code.</div>

          {gateResult && (
            <div style={gateResult.success ? c.granted : c.denied}>
              {gateResult.success ? (
                <div>
                  <div style={{ color:"#6bff6b", fontWeight:700, fontSize:15, marginBottom:12, letterSpacing:0.5 }}>
                    ✓ Access Granted
                  </div>
                  {[
                    ["Guest",    gateResult.invite.guestName],
                    ["Visiting", gateResult.invite.residentName],
                    ["Unit",     gateResult.invite.residentUnit],
                    ["Purpose",  gateResult.invite.purpose || "—"],
                    ["Date",     gateResult.invite.date],
                  ].map(([k, v]) => (
                    <div key={k} style={{ fontSize:13, color:"#888", marginBottom:5 }}>
                      <span style={{ color:"#333", minWidth:60, display:"inline-block" }}>{k}</span> {v}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <div style={{ color:"#ff6b6b", fontWeight:700, fontSize:15, marginBottom:6 }}>✗ Access Denied</div>
                  <div style={{ fontSize:13, color:"#773333" }}>
                    {gateResult.alreadyUsed ? "This code has already been used." : "Invalid or unrecognised code."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Access log */}
        <div style={c.section}>Today's Access Log</div>
        {accessLog.length === 0 ? (
          <div style={{ color:"#2a2a2a", fontSize:13, padding:"12px 0" }}>No check-ins recorded yet.</div>
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

const LISTINGS = [
  { id:1, title:"Generator Fuel (50L)",    price:"25,000", seller:"Adeola M.",      status:"available" },
  { id:2, title:"Inverter Battery (200Ah)", price:"80,000", seller:"Chukwuemeka O.", status:"available" },
];

function ResidentApp({ user, onLogout }) {
  const [view, setView]             = useState("dashboard");
  const [invites, setInvites]       = useState([]);
  const [inviteForm, setInviteForm] = useState({ guestName:"", guestPhone:"", purpose:"", date:"", residentId:1 });
  const [loadingInvites, setLoadingInvites] = useState(true);

  // Load invites for this estate on mount
  const loadInvites = useCallback(async () => {
    const stored = await storageGet(INVITES_KEY + "_" + user.estateId) || [];
    setInvites(stored);
    setLoadingInvites(false);
  }, [user.estateId]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const createInvite = async () => {
    if (!inviteForm.guestName || !inviteForm.date) return;
    const resident = RESIDENTS.find((r) => r.id === Number(inviteForm.residentId));
    const newInvite = {
      id: Date.now(),
      guestName: inviteForm.guestName,
      guestPhone: inviteForm.guestPhone,
      purpose: inviteForm.purpose,
      date: inviteForm.date,
      residentId: inviteForm.residentId,
      residentName: resident?.name,
      residentUnit: resident?.unit,
      createdBy: user.email,
      estateId: user.estateId,
      code: generateCode(),
      status: "pending",
      createdAt: new Date().toLocaleString(),
    };
    const stored = await storageGet(INVITES_KEY + "_" + user.estateId) || [];
    const updated = [newInvite, ...stored];
    await storageSet(INVITES_KEY + "_" + user.estateId, updated);
    setInvites(updated);
    setInviteForm({ guestName:"", guestPhone:"", purpose:"", date:"", residentId:1 });
  };

  // Filter to only this user's invites for the invite tab
  const myInvites = invites.filter((i) => i.createdBy === user.email);

  const InviteCard = ({ inv }) => (
    <div style={c.itemCard}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <strong style={{ fontSize:14, color:"#e0e0e0" }}>{inv.guestName}</strong>
        <span style={inv.status === "used" ? c.badgeGray : c.badgeWhite}>
          {inv.status === "used" ? "Used" : "Active"}
        </span>
      </div>
      <div style={{ fontSize:12, color:"#555" }}>{inv.date}{inv.purpose ? " · " + inv.purpose : ""}</div>
      <div style={c.codeBox}>
        <div style={{ fontSize:10, color:"#333", letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 }}>Access Code</div>
        <div style={{ fontSize:24, fontWeight:800, letterSpacing:6, color:"#fff" }}>{inv.code}</div>
      </div>
    </div>
  );

  const navItems = [
    { id:"dashboard", label:"Home",    icon:"⌂" },
    { id:"invite",    label:"Invite",  icon:"✉" },
    { id:"marketplace", label:"Market", icon:"◈" },
    { id:"alerts",    label:"Alerts",  icon:"◎" },
  ];

  return (
    <div style={c.appWrap}>
      {/* Header */}
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
                { label:"Active Invites", value: myInvites.filter((i) => i.status === "pending").length },
                { label:"Total Invites",  value: myInvites.length },
                { label:"Marketplace",   value: LISTINGS.length },
                { label:"Alerts",        value: ALERTS.length },
              ].map((stat) => (
                <div key={stat.label} style={c.statCard}>
                  <div style={{ fontSize:28, fontWeight:800, color:"#fff" }}>{stat.value}</div>
                  <div style={{ fontSize:11, color:"#444", marginTop:2, letterSpacing:0.5 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div style={c.section}>Recent Alerts</div>
            {ALERTS.map((a) => (
              <div key={a.id} style={{ background:"#141414", border:"1px solid #1e1e1e", borderLeft:"3px solid " + (a.type === "warning" ? "#888" : "#444"), borderRadius:8, padding:"12px 14px", marginBottom:8, fontSize:13, color: a.type === "warning" ? "#bbb" : "#aaa" }}>
                {a.message}
                <div style={{ color:"#333", fontSize:11, marginTop:5 }}>{a.time}</div>
              </div>
            ))}

            <div style={{ marginTop:20 }}>
              <div style={c.section}>Your Recent Invites</div>
              {loadingInvites ? (
                <div style={{ color:"#2a2a2a", fontSize:13 }}>Loading...</div>
              ) : myInvites.length === 0 ? (
                <div style={{ color:"#2a2a2a", fontSize:13, padding:"12px 0" }}>No invites yet. Head to the Invite tab to get started.</div>
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
            <div style={{ color:"#555", fontSize:13, marginBottom:20 }}>Generate a one-time access code for your visitor. Security can verify it at any gate terminal.</div>

            {[
              { label:"Guest Name",      key:"guestName",  type:"text", placeholder:"e.g. John Doe" },
              { label:"Guest Phone",     key:"guestPhone", type:"tel",  placeholder:"e.g. 08012345678" },
              { label:"Purpose of Visit",key:"purpose",    type:"text", placeholder:"e.g. Family visit" },
              { label:"Visit Date",      key:"date",       type:"date", placeholder:"" },
            ].map((field) => (
              <div key={field.key}>
                <label style={c.label}>{field.label}</label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={inviteForm[field.key]}
                  onChange={(e) => setInviteForm({ ...inviteForm, [field.key]: e.target.value })}
                  style={c.appInput}
                />
              </div>
            ))}

            <label style={c.label}>Resident</label>
            <select
              value={inviteForm.residentId}
              onChange={(e) => setInviteForm({ ...inviteForm, residentId: Number(e.target.value) })}
              style={c.select}
            >
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

        {/* MARKETPLACE */}
        {view === "marketplace" && (
          <div>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>Estate Marketplace</div>
            <div style={{ color:"#555", fontSize:13, marginBottom:20 }}>Buy and sell within your community.</div>
            {LISTINGS.map((item) => (
              <div key={item.id} style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:14, padding:16, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontWeight:600, color:"#e0e0e0" }}>{item.title}</div>
                    <div style={{ fontSize:12, color:"#444", marginTop:3 }}>Seller: {item.seller}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontWeight:800, color:"#fff", fontSize:15 }}>&#8358;{item.price}</div>
                    <span style={{ ...c.badgeWhite, fontSize:9, marginTop:4, display:"inline-block" }}>{item.status}</span>
                  </div>
                </div>
                <button style={c.btnSec}>Contact Seller</button>
              </div>
            ))}
          </div>
        )}

        {/* ALERTS */}
        {view === "alerts" && (
          <div>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>Community Alerts</div>
            <div style={{ color:"#555", fontSize:13, marginBottom:20 }}>Stay informed about estate updates.</div>
            {ALERTS.map((a) => (
              <div key={a.id} style={{ background:"#141414", border:"1px solid #1e1e1e", borderLeft:"3px solid " + (a.type === "warning" ? "#888" : "#444"), borderRadius:12, padding:16, marginBottom:12 }}>
                <div style={{ fontSize:14, color:"#bbb" }}>{a.message}</div>
                <div style={{ color:"#333", fontSize:11, marginTop:6 }}>{a.time}</div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Bottom nav — no gate tab for residents */}
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
  const logout = () => setUser(null);

  if (!user) return <AuthScreen onLogin={setUser} />;
  if (user.role === "security") return <SecurityApp user={user} onLogout={logout} />;
  return <ResidentApp user={user} onLogout={logout} />;
}