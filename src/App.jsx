import { useState, useEffect, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const ESTATES = [
  { id: "cove_towers",   name: "Cove Towers",  code: "1234" },
  { id: "banana_island", name: "Banana Island", code: "5678" },
];

// Seed users live in the Supabase database now (inserted via supabase_schema.sql)
// Kept here only for reference — not used in logic anymore.
// const SEED_USERS = [...];

const RESIDENTS = [
  { id: 1, name: "Adeola Martins",  unit: "Block A, No. 12" },
  { id: 2, name: "Chukwuemeka Obi", unit: "Block B, No. 5"  },
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

// Format "YYYY-MM-DD" as "20 Mar 2026"
function fmtDate(dateStr) {
  if (!dateStr) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [y, m, d] = dateStr.split("-").map(Number);
  return d + " " + months[m - 1] + " " + y;
}

// Check if an invite is currently valid in Nigeria time
function isInviteValid(invite) {
  const now     = nowNigeria();
  const start   = parseNigeriaDateTime(invite.date, invite.timeFrom);
  const end     = parseNigeriaDateTime(invite.date, invite.timeTo);
  return now >= start && now <= end;
}

// ─── Supabase client ──────────────────────────────────────────────────────────
// Install: npm install @supabase/supabase-js
// Add to your .env:  VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── DB helpers ───────────────────────────────────────────────────────────────

// USERS
async function dbGetUserByEmail(email) {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).single();
  if (error || !data) return null;
  return {
    email: data.email, name: data.name,
    estateId: data.estate_id, role: data.role,
    unitName: data.unit_name || null,
    createdAt: data.created_at ? new Date(data.created_at).toLocaleDateString("en-NG", { day:"numeric", month:"short", year:"numeric" }) : null,
  };
}
async function dbCreateUser(user) {
  const { error } = await supabase.from("users").insert({
    email: user.email, name: user.name,
    estate_id: user.estateId, role: user.role,
    unit_name: user.unitName || null,
  });
  if (error) { console.error("dbCreateUser:", error); return false; }
  return true;
}

// Check if email is on the approved residents list and return their record
async function dbCheckApprovedResident(email, estateId) {
  const { data, error } = await supabase
    .from("approved_residents")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .eq("estate_id", estateId)
    .eq("used", false)
    .single();
  if (error || !data) return null;
  return { unitName: data.unit_name, estateId: data.estate_id };
}

// Mark approved resident as used after signup
async function dbMarkResidentUsed(email, estateId) {
  await supabase
    .from("approved_residents")
    .update({ used: true })
    .eq("email", email.trim().toLowerCase())
    .eq("estate_id", estateId);
}
async function dbUpdatePassword(email, newPassword) {
  // Update in our users table (keep in sync)
  await supabase.from("users").update({ password: newPassword }).eq("email", email);
  // Note: Supabase Auth password is updated separately via supabase.auth.updateUser()
  // in the ResetPasswordScreen — no need to call it here again
  return true;
}

// INVITES
async function dbGetInvites(estateId) {
  const { data, error } = await supabase.from("invites").select("*").eq("estate_id", estateId).order("id", { ascending: false });
  if (error) { console.error("dbGetInvites:", error); return []; }
  return (data || []).map(i => ({
    id: i.id, guestName: i.guest_name, purpose: i.purpose,
    date: i.date, timeFrom: i.time_from, timeTo: i.time_to,
    residentId: i.resident_id, residentName: i.resident_name, residentUnit: i.resident_unit,
    createdBy: i.created_by, estateId: i.estate_id, code: i.code, status: i.status,
    createdAt: i.created_at,
  }));
}
async function dbCreateInvite(invite) {
  const { error } = await supabase.from("invites").insert({
    id: invite.id, guest_name: invite.guestName, purpose: invite.purpose,
    date: invite.date, time_from: invite.timeFrom, time_to: invite.timeTo,
    resident_id: invite.residentId, resident_name: invite.residentName, resident_unit: invite.residentUnit,
    created_by: invite.createdBy, estate_id: invite.estateId, code: invite.code, status: invite.status,
  });
  if (error) { console.error("dbCreateInvite:", error); return false; }
  return true;
}
async function dbMarkInviteUsed(inviteId) {
  const { error } = await supabase.from("invites").update({ status: "used" }).eq("id", inviteId);
  if (error) { console.error("dbMarkInviteUsed:", error); return false; }
  return true;
}
async function dbDeleteInvite(inviteId) {
  const { error } = await supabase.from("invites").delete().eq("id", inviteId);
  if (error) { console.error("dbDeleteInvite:", error); return false; }
  return true;
}

// ACCESS LOG
async function dbGetLog(estateId) {
  const { data, error } = await supabase.from("access_log").select("*").eq("estate_id", estateId).order("id", { ascending: false });
  if (error) { console.error("dbGetLog:", error); return []; }
  return (data || []).map(l => ({
    id: l.id, guest: l.guest, resident: l.resident, unit: l.unit,
    code: l.code, estateId: l.estate_id, time: l.time_str, action: "Checked In",
  }));
}
async function dbAddLogEntry(entry) {
  const { error } = await supabase.from("access_log").insert({
    id: entry.id, guest: entry.guest, resident: entry.resident, unit: entry.unit,
    code: entry.code, estate_id: entry.estateId, time_str: entry.time,
  });
  if (error) { console.error("dbAddLogEntry:", error); return false; }
  return true;
}

// RESET TOKENS
async function dbGetResetToken(token) {
  const { data, error } = await supabase.from("reset_tokens").select("*").eq("token", token).single();
  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return { token: data.token, email: data.email, expires: new Date(data.expires_at).getTime() };
}
async function dbSaveResetToken(token, email, expiresMs) {
  await supabase.from("reset_tokens").delete().eq("email", email);
  const { error } = await supabase.from("reset_tokens").insert({
    token, email, expires_at: new Date(expiresMs).toISOString(),
  });
  if (error) { console.error("dbSaveResetToken:", error); return false; }
  return true;
}
async function dbDeleteResetToken(token) {
  await supabase.from("reset_tokens").delete().eq("token", token);
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

// ─── Forgot Password Screen ───────────────────────────────────────────────────

function ForgotPasswordScreen({ onBack }) {
  const [email, setEmail]     = useState("");
  const [error, setError]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  const isValidEmail = (e) => {
    const parts = e.trim().split("@");
    return parts.length === 2 && parts[0].length > 0 && parts[1].includes(".");
  };

  const handleRequest = async () => {
    setError("");
    if (!email.trim()) return setError("Please enter your email address.");
    if (!isValidEmail(email)) return setError("Please enter a valid email address.");
    setLoading(true);

    // Use Supabase built-in password reset — sends email automatically
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: window.location.origin }
    );

    // Don't reveal if email exists or not — always show success
    if (resetError) console.error("Reset email error:", resetError);
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div style={c.page}>
        <div style={c.authCard}>
          <div style={c.logo}>UPSIDIAN</div>
          <div style={c.logoSub}>SMART ESTATE MANAGEMENT</div>
          <div style={{ width:48, height:48, borderRadius:"50%", background:"#0a1e0a", border:"1px solid #1a3d1a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, marginBottom:16 }}>
            &#10003;
          </div>
          <div style={c.title}>Check your email</div>
          <div style={{ fontSize:13, color:"#555", marginBottom:24, lineHeight:1.7 }}>
            If <span style={{ color:"#888" }}>{email}</span> is registered, a reset link has been sent. Check your inbox and spam folder. The link expires in 1 hour.
          </div>
          <button style={c.btnWhite} onClick={onBack}>Back to Sign In &rarr;</button>
        </div>
      </div>
    );
  }

  return (
    <div style={c.page}>
      <div style={c.authCard}>
        <button style={c.btnBack} onClick={onBack}>&larr; Back to Sign In</button>
        <div style={c.logo}>UPSIDIAN</div>
        <div style={c.logoSub}>SMART ESTATE MANAGEMENT</div>
        <div style={c.title}>Reset password</div>
        <div style={c.desc}>Enter your registered email and we will send you a reset link.</div>

        {error && <div style={c.err}>{error}</div>}

        <label style={c.label}>Email Address</label>
        <input
          style={c.input}
          type="email"
          placeholder="you@estate.ng"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRequest()}
        />
        <button style={c.btnWhite} onClick={handleRequest} disabled={loading}>
          {loading ? "Sending..." : "Send Reset Link →"}
        </button>
      </div>
    </div>
  );
}

// ─── Reset Password Screen (Supabase Auth) ────────────────────────────────────
// Handles the link Supabase emails — the session is set automatically via URL hash

function ResetPasswordScreen({ onDone }) {
  const [form, setForm]     = useState({ newPw:"", confirm:"" });
  const [error, setError]   = useState("");
  const [ok, setOk]         = useState(false);
  const [loading, setLoading] = useState(false);
  // Root already verified PASSWORD_RECOVERY before rendering this component
  // so we show the form immediately — no need to wait again

  const handleReset = async () => {
    setError("");
    if (!form.newPw || !form.confirm) return setError("Both fields are required.");
    if (form.newPw.length < 6) return setError("Password must be at least 6 characters.");
    if (form.newPw !== form.confirm) return setError("Passwords do not match.");
    setLoading(true);

    // Update password in Supabase Auth
    const { error: authErr } = await supabase.auth.updateUser({ password: form.newPw });
    if (authErr) {
      setLoading(false);
      return setError("Failed to update password. Please try again.");
    }

    // Also sync to our users table
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.email) {
      await dbUpdatePassword(authUser.email, form.newPw);
    }

    await supabase.auth.signOut();
    setLoading(false);
    setOk(true);
  };

  if (ok) {
    return (
      <div style={c.page}>
        <div style={c.authCard}>
          <div style={c.logo}>UPSIDIAN</div>
          <div style={c.logoSub}>SMART ESTATE MANAGEMENT</div>
          <div style={{ width:48, height:48, borderRadius:"50%", background:"#0a1e0a", border:"1px solid #1a3d1a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, marginBottom:16 }}>&#10003;</div>
          <div style={c.title}>Password updated</div>
          <div style={{ fontSize:13, color:"#555", marginBottom:24 }}>Your password has been reset. You can now sign in with your new password.</div>
          <button style={c.btnWhite} onClick={onDone}>Sign In &rarr;</button>
        </div>
      </div>
    );
  }

  return (
    <div style={c.page}>
      <div style={c.authCard}>
        <div style={c.logo}>UPSIDIAN</div>
        <div style={c.logoSub}>SMART ESTATE MANAGEMENT</div>
        <div style={c.title}>Choose new password</div>
        <div style={c.desc}>Enter and confirm your new password below.</div>

        {error && <div style={c.err}>{error}</div>}

        <label style={c.label}>New Password</label>
        <PwInput placeholder="At least 6 characters" value={form.newPw}
          onChange={(e) => setForm(p => ({ ...p, newPw: e.target.value }))} style={c.input} />
        <label style={c.label}>Confirm New Password</label>
        <PwInput placeholder="Repeat new password" value={form.confirm}
          onChange={(e) => setForm(p => ({ ...p, confirm: e.target.value }))} style={c.input} />
        <button style={c.btnWhite} onClick={handleReset} disabled={loading}>
          {loading ? "Saving..." : "Update Password →"}
        </button>
      </div>
    </div>
  );
}

// ─── Shared PwInput component (show/hide toggle) ─────────────────────────────

function PwInput({ placeholder, value, onChange, onKeyDown, style }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position:"relative", marginBottom: style?.marginBottom ?? 16 }}>
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        style={{ ...style, marginBottom:0, paddingRight:44 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#444", cursor:"pointer", fontSize:12, letterSpacing:0.3, padding:0 }}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

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
  const goForgot = () => { setMode("forgot"); setError(""); setSuccess(""); };

  const handleLogin = async () => {
    setError("");
    // Sign in via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (authError || !authData.user) return setError("Invalid email or password.");
    // Fetch the user profile from our users table
    const profile = await dbGetUserByEmail(form.email.trim().toLowerCase());
    if (!profile) return setError("Account not found. Please contact your estate admin.");
    const estate = ESTATES.find((e) => e.id === profile.estateId);
    onLogin({ ...profile, estateName: estate ? estate.name : "Estate" });
  };

  const handleSignup = async () => {
    setError(""); setSuccess("");
    const requiresAdminCode = role === "security";

    // Basic validation
    if (!form.name || !form.email || !form.password)
      return setError("Name, email and password are required.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");

    // Security officers still need estate + admin code
    if (role === "security") {
      if (!form.estateId) return setError("Please select your estate.");
      if (!form.adminCode) return setError("Admin code is required to register as Security.");
      if (form.adminCode !== "1234") return setError("Invalid admin code. Contact your estate administrator.");
    }

    let resolvedEstateId = form.estateId;
    let resolvedUnitName = null;

    if (role === "resident") {
      // Residents: check approved_residents table — email IS the verification
      // Try each estate until we find a match
      let approved = null;
      for (const estate of ESTATES) {
        approved = await dbCheckApprovedResident(form.email, estate.id);
        if (approved) { resolvedEstateId = estate.id; break; }
      }
      if (!approved) {
        return setError(
          "Your email is not on the approved residents list. " +
          "Please contact your estate manager to be added before signing up."
        );
      }
      resolvedUnitName = approved.unitName;
    }

    const estate = ESTATES.find((e) => e.id === resolvedEstateId);
    if (!estate) return setError("Could not determine your estate. Please contact support.");

    // Create in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (authError) {
      if (authError.message.includes("already registered")) return setError("Email already registered.");
      return setError("Sign-up failed: " + authError.message);
    }

    // Save profile in users table
    const newUser = {
      email: form.email.trim().toLowerCase(),
      name: form.name,
      estateId: resolvedEstateId,
      role,
      unitName: resolvedUnitName,
    };
    const saved = await dbCreateUser(newUser);
    if (!saved) {
      await supabase.auth.signOut();
      return setError("Sign-up failed — could not save your profile. Please try again.");
    }

    // Mark the approved_residents row as used so it can't be reused
    if (role === "resident") {
      await dbMarkResidentUsed(form.email, resolvedEstateId);
    }

    await supabase.auth.signOut();
    setSuccess(
      "Account created! You are registered to " + estate.name +
      (resolvedUnitName ? " — " + resolvedUnitName : "") +
      ". You can now sign in."
    );
    setMode("login");
    setForm({ name:"", email:form.email, password:"", confirm:"", estateId:"", estateCode:"", adminCode:"" });
  };

  if (mode === "forgot") return <ForgotPasswordScreen onBack={goLogin} />;

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
        <input style={c.input} type="email" placeholder="you@estate.ng" value={form.email} onChange={set("email")}
          onKeyDown={(e) => e.key === "Enter" && mode === "login" && handleLogin()} />
        <label style={c.label}>Password</label>
        <PwInput placeholder="Enter password" value={form.password} onChange={set("password")} style={c.input}
          onKeyDown={(e) => e.key === "Enter" && (mode === "login" ? handleLogin() : handleSignup())} />

        {mode === "signup" && (
          <div>
            <label style={c.label}>Confirm Password</label>
            <PwInput placeholder="Confirm password" value={form.confirm} onChange={set("confirm")} style={c.input} />

            {/* Residents — email is verified against approved list, no code needed */}
            {role === "resident" && (
              <div style={{ background:"#0a0a0a", border:"1px solid #1e1e1e", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
                <div style={{ fontSize:11, color:"#444", lineHeight:1.7 }}>
                  Your email will be checked against your estate's approved residents list. If you are not on the list, please contact your estate manager to be added first.
                </div>
              </div>
            )}

            {/* Security officers still need estate + admin code */}
            {role === "security" && (
              <div>
                <div style={c.divider} />
                <label style={c.label}>Select Your Estate</label>
                <select value={form.estateId} onChange={set("estateId")} style={{ ...c.input, color: form.estateId ? "#fff" : "#555" }}>
                  <option value="" disabled>Choose your estate...</option>
                  {ESTATES.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <label style={c.label}>Security Admin Code</label>
                <input style={c.input} type="password" placeholder="Admin-only code" value={form.adminCode} onChange={set("adminCode")} maxLength={20} />
                <div style={c.hint}>Security accounts require an admin code from your estate administrator.</div>
              </div>
            )}

            <div style={c.hint}>Your estate and unit are assigned automatically from the approved residents list.</div>
          </div>
        )}

        <button style={c.btnWhite} onClick={mode === "login" ? handleLogin : handleSignup}>
          {mode === "login" ? "Sign In" : "Create Account"} &rarr;
        </button>

        {mode === "login" && (
          <div style={{ marginTop:14, textAlign:"center" }}>
            <button
              style={{ background:"none", border:"none", color:"#444", fontSize:12, cursor:"pointer", letterSpacing:0.5 }}
              onClick={goForgot}
            >
              Forgot password?
            </button>
          </div>
        )}

        <div style={{ marginTop:mode === "login" ? 10 : 22, textAlign:"center", fontSize:13, color:"#555" }}>
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
      const log = await dbGetLog(user.estateId);
      setAccessLog(log);
    })();
  }, [user.estateId]);

  const verify = async () => {
    if (!gateCode.trim()) return;
    setLoading(true);
    setGateResult(null);
    const code       = gateCode.toUpperCase().trim();
    const allInvites = await dbGetInvites(user.estateId);
    const found      = allInvites.find((i) => i.code === code);

    if (!found) {
      setGateResult({ type: "invalid" });
    } else if (found.status === "used") {
      setGateResult({ type: "used" });
    } else if (!isInviteValid(found)) {
      setGateResult({ type: "expired", invite: found });
    } else {
      await dbMarkInviteUsed(found.id);
      const entry = {
        id: Date.now(), guest: found.guestName, resident: found.residentName,
        unit: found.residentUnit, code: found.code, estateId: user.estateId,
        time: new Date().toLocaleTimeString("en-NG", { timeZone:"Africa/Lagos" }),
        action: "Checked In",
      };
      await dbAddLogEntry(entry);
      const newLog = [entry, ...accessLog];
      setAccessLog(newLog);
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
        <div style={c.section}>Access Log</div>
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
    guestName:"", purpose:"",
    day:"", month:"", year:"",
    fromHour:"", fromMin:"", toHour:"", toMin:"",
    residentId:1,
  });
  const [inviteErr, setInviteErr]       = useState("");
  const [codeModal, setCodeModal] = useState(null); // popup for newly created invite

  const loadInvites = useCallback(async () => {
    const data = await dbGetInvites(user.estateId);
    setInvites(data);
    setLoadingInvites(false);
  }, [user.estateId]);

  useEffect(() => {
    loadInvites();
    // Poll every 30s so invite status updates (e.g. marked used by security) stay fresh
    const interval = setInterval(loadInvites, 30000);
    return () => clearInterval(interval);
  }, [loadInvites]);

  const createInvite = async () => {
    setInviteErr("");
    const { guestName, day, month, year, fromHour, fromMin, toHour, toMin } = inviteForm;
    if (!guestName || !day || !month || !year || fromHour === "" || fromMin === "" || toHour === "" || toMin === "")
      return setInviteErr("Guest name, date, arrival and expiry time are all required.");
    const date     = year + "-" + month + "-" + day;
    const timeFrom = fromHour + ":" + fromMin;
    const timeTo   = toHour + ":" + toMin;
    if (timeFrom >= timeTo) return setInviteErr("Expiry time must be after arrival time.");
    // Reject if the selected date is in the past (Nigeria time)
    const today = nowNigeria();
    const todayStr = today.getFullYear() + "-" +
      String(today.getMonth()+1).padStart(2,"0") + "-" +
      String(today.getDate()).padStart(2,"0");
    if (date < todayStr) return setInviteErr("Visit date cannot be in the past.");

    const resident  = RESIDENTS.find((r) => r.id === Number(inviteForm.residentId));
    const newInvite = {
      id: Date.now(),
      guestName:    inviteForm.guestName,
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
    await dbCreateInvite(newInvite);
    const updated = await dbGetInvites(user.estateId);
    setInvites(updated);
    setCodeModal(newInvite);
    setInviteForm({ guestName:"", purpose:"", day:"", month:"", year:"", fromHour:"", fromMin:"", toHour:"", toMin:"", residentId:1 });
  };

  const myInvites = invites.filter((i) => i.createdBy === user.email);

  // Hidden invite ids (resident) — persisted in localStorage per user
  const hiddenKey = "upsidian_hidden_" + user.email;
  const [hiddenIds, setHiddenIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(hiddenKey) || "[]"); } catch { return []; }
  });
  const hideInvite = (id) => {
    const next = [...hiddenIds, id];
    setHiddenIds(next);
    try { localStorage.setItem(hiddenKey, JSON.stringify(next)); } catch {}
  };
  const unhideAll = () => {
    setHiddenIds([]);
    try { localStorage.removeItem(hiddenKey); } catch {}
  };

  // Delete invite (removes from shared store entirely)
  const deleteInvite = async (id) => {
    await dbDeleteInvite(id);
    setInvites(prev => prev.filter((i) => i.id !== id));
  };

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

  // Full-size copy box used in the modal popup
  // Reliable copy helper — navigator.clipboard is blocked in sandboxed iframes
  const copyToClipboard = (text) => {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
      document.body.appendChild(el);
      el.select();
      el.setSelectionRange(0, 99999);
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    } catch { return false; }
  };

  const ModalCopyBox = ({ code }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
      const ok = copyToClipboard(code);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    };
    return (
      <div style={{ background:"#0a0a0a", border:"1px solid #1e1e1e", borderRadius:14, padding:"18px 16px", textAlign:"center" }}>
        <div style={{ fontSize:10, color:"#333", letterSpacing:2, textTransform:"uppercase", marginBottom:10 }}>Access Code</div>
        <div style={{ fontSize:36, fontWeight:800, letterSpacing:8, color:"#fff", marginBottom:16, fontVariantNumeric:"tabular-nums" }}>{code}</div>
        <button
          onClick={handleCopy}
          style={{
            width:"100%", borderRadius:10, padding:"12px 0", fontSize:14, fontWeight:700,
            cursor:"pointer", letterSpacing:0.5, transition:"all 0.2s",
            background: copied ? "#0a1e0a" : "#fff",
            color: copied ? "#6bff6b" : "#000",
            border: copied ? "1px solid #1a3d1a" : "none",
          }}
        >
          {copied ? "Copied!" : "Copy Code"}
        </button>
      </div>
    );
  };

  // Small copy button used inside invite cards
  const CopyButton = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
      const ok = copyToClipboard(text);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };
    return (
      <button
        onClick={handleCopy}
        style={{ position:"absolute", top:8, right:8, background: copied ? "#0a1e0a" : "#222", border: copied ? "1px solid #1a3d1a" : "1px solid #2a2a2a", color: copied ? "#6bff6b" : "#555", borderRadius:6, padding:"3px 8px", fontSize:10, cursor:"pointer", letterSpacing:0.5, transition:"all 0.2s" }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    );
  };

  const InviteCard = ({ inv }) => {
    const { style: badgeStyle, label: badgeLabel } = inviteBadge(inv);
    const [confirmDelete, setConfirmDelete] = useState(false);
    return (
      <div style={c.itemCard}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <strong style={{ fontSize:14, color:"#e0e0e0" }}>{inv.guestName}</strong>
          <span style={badgeStyle}>{badgeLabel}</span>
        </div>
        <div style={{ fontSize:12, color:"#555", marginBottom:2 }}>
          {fmtDate(inv.date)}{inv.purpose ? " · " + inv.purpose : ""}
        </div>
        <div style={{ fontSize:11, color:"#444" }}>
          {inv.timeFrom} – {inv.timeTo} WAT
        </div>
        <div style={{ ...c.codeBox, position:"relative" }}>
          <div style={{ fontSize:10, color:"#333", letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 }}>Access Code</div>
          <div style={{ fontSize:24, fontWeight:800, letterSpacing:6, color:"#fff" }}>{inv.code}</div>
          <CopyButton text={inv.code} />
        </div>

        {/* Normal action row */}
        {!confirmDelete && (
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button
              onClick={() => hideInvite(inv.id)}
              style={{ flex:1, background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#555", borderRadius:8, padding:"7px 0", fontSize:11, cursor:"pointer", letterSpacing:0.5 }}
            >
              Hide
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ flex:1, background:"#1a0a0a", border:"1px solid #3d1515", color:"#ff6b6b", borderRadius:8, padding:"7px 0", fontSize:11, cursor:"pointer", letterSpacing:0.5 }}
            >
              Delete
            </button>
          </div>
        )}

        {/* Inline confirm row */}
        {confirmDelete && (
          <div style={{ marginTop:10, background:"#1a0a0a", border:"1px solid #3d1515", borderRadius:8, padding:"10px 12px" }}>
            <div style={{ fontSize:12, color:"#ff6b6b", marginBottom:8 }}>Delete this invite? The code will stop working immediately.</div>
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ flex:1, background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#555", borderRadius:8, padding:"7px 0", fontSize:11, cursor:"pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteInvite(inv.id)}
                style={{ flex:1, background:"#3d1515", border:"1px solid #ff6b6b", color:"#ff6b6b", borderRadius:8, padding:"7px 0", fontSize:12, fontWeight:700, cursor:"pointer" }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const navItems = [
    { id:"dashboard", label:"Home",    icon:"⌂" },
    { id:"invite",    label:"Invite",  icon:"✉" },
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
                { label:"Upcoming",         value: myInvites.filter((i) => i.status === "pending" && nowNigeria() < parseNigeriaDateTime(i.date, i.timeFrom)).length },
                { label:"Used",             value: myInvites.filter((i) => i.status === "used").length },
              ].map((s) => (
                <div key={s.label} style={c.statCard}>
                  <div style={{ fontSize:28, fontWeight:800, color:"#fff" }}>{s.value}</div>
                  <div style={{ fontSize:11, color:"#444", marginTop:2, letterSpacing:0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:20 }}>
              <div style={c.section}>Your Recent Invites</div>
              {loadingInvites ? (
                <div style={{ color:"#2a2a2a", fontSize:13 }}>Loading...</div>
              ) : myInvites.length === 0 ? (
                <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:14, padding:"20px 16px", textAlign:"center" }}>
                  <div style={{ fontSize:28, marginBottom:10 }}>&#x2709;</div>
                  <div style={{ fontWeight:700, color:"#e0e0e0", fontSize:14, marginBottom:6 }}>No invites yet</div>
                  <div style={{ fontSize:12, color:"#444", marginBottom:16, lineHeight:1.6 }}>Create a guest invite to give your visitor a secure one-time code to enter the estate.</div>
                  <button
                    onClick={() => setView("invite")}
                    style={{ background:"#fff", color:"#000", border:"none", borderRadius:8, padding:"9px 20px", fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:0.5 }}
                  >
                    Create First Invite
                  </button>
                </div>
              ) : (
                myInvites.filter((i) => !hiddenIds.includes(i.id)).slice(0, 3).map((inv) => <InviteCard key={inv.id} inv={inv} />)
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

            {/* Guest Name */}
            <label style={c.label}>Guest Name</label>
            <input type="text" placeholder="e.g. John Doe" value={inviteForm.guestName}
              onChange={(e) => setInviteForm({ ...inviteForm, guestName: e.target.value })}
              style={c.appInput} />

            {/* Purpose of Visit — dropdown */}
            <label style={c.label}>Purpose of Visit</label>
            <select
              value={inviteForm.purpose}
              onChange={(e) => setInviteForm({ ...inviteForm, purpose: e.target.value })}
              style={{ ...c.select, color: inviteForm.purpose ? "#fff" : "#555" }}
            >
              <option value="" disabled>Select purpose...</option>
              <option value="Delivery">Delivery</option>
              <option value="Visit">Visit</option>
              <option value="Staff">Staff</option>
              <option value="Workman">Workman</option>
            </select>

            {/* Date — three selects, past dates disabled */}
            {(()=>{
              const today    = nowNigeria();
              const todayY   = today.getFullYear();
              const todayM   = today.getMonth() + 1; // 1-indexed
              const todayD   = today.getDate();
              const selY     = Number(inviteForm.year)  || 0;
              const selM     = Number(inviteForm.month) || 0;
              // How many days in the selected month/year
              const daysInMonth = selY && selM ? new Date(selY, selM, 0).getDate() : 31;
              // Years: current year up to 2 years ahead
              const years = Array.from({length:3},(_,i)=> todayY + i);
              return (
                <div>
                  <label style={c.label}>Visit Date</label>
                  <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                    {/* Year */}
                    <select
                      value={inviteForm.year}
                      onChange={(e) => setInviteForm({ ...inviteForm, year: e.target.value, month:"", day:"" })}
                      style={{ flex:1, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color: inviteForm.year ? "#fff" : "#555" }}
                    >
                      <option value="">Year</option>
                      {years.map(y=>(
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                    {/* Month — disable months before today if same year */}
                    <select
                      value={inviteForm.month}
                      onChange={(e) => setInviteForm({ ...inviteForm, month: e.target.value, day:"" })}
                      style={{ flex:2, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color: inviteForm.month ? "#fff" : "#555" }}
                    >
                      <option value="">Month</option>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=>{
                        const mNum = i + 1;
                        const isPast = selY === todayY && mNum < todayM;
                        const val   = String(mNum).padStart(2,"0");
                        return <option key={val} value={val} disabled={isPast}>{m}</option>;
                      })}
                    </select>
                    {/* Day — disable days before today if same year+month */}
                    <select
                      value={inviteForm.day}
                      onChange={(e) => setInviteForm({ ...inviteForm, day: e.target.value })}
                      style={{ flex:1, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color: inviteForm.day ? "#fff" : "#555" }}
                    >
                      <option value="">Day</option>
                      {Array.from({length: daysInMonth},(_,i)=>{
                        const dNum  = i + 1;
                        const isPast = selY === todayY && selM === todayM && dNum < todayD;
                        const val   = String(dNum).padStart(2,"0");
                        return <option key={val} value={val} disabled={isPast}>{dNum}</option>;
                      })}
                    </select>
                  </div>
                </div>
              );
            })()}

            {/* Arrival time */}
            <label style={c.label}>Arrival Time — Nigeria (WAT)</label>
            <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
              <select
                value={inviteForm.fromHour}
                onChange={(e) => setInviteForm({ ...inviteForm, fromHour: e.target.value })}
                style={{ flex:1, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color: inviteForm.fromHour ? "#fff" : "#555" }}
              >
                <option value="">Hour</option>
                {Array.from({length:24},(_,i)=>{
                  const h = String(i).padStart(2,"0");
                  return <option key={h} value={h}>{h}</option>;
                })}
              </select>
              <span style={{ color:"#444", fontSize:18, fontWeight:700 }}>:</span>
              <select
                value={inviteForm.fromMin}
                onChange={(e) => setInviteForm({ ...inviteForm, fromMin: e.target.value })}
                style={{ flex:1, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color: inviteForm.fromMin ? "#fff" : "#555" }}
              >
                <option value="">Min</option>
                <option value="00">00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
              </select>
            </div>

            {/* Expiry time */}
            <label style={c.label}>Expiry Time — Nigeria (WAT)</label>
            <div style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
              <select
                value={inviteForm.toHour}
                onChange={(e) => setInviteForm({ ...inviteForm, toHour: e.target.value })}
                style={{ flex:1, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color: inviteForm.toHour ? "#fff" : "#555" }}
              >
                <option value="">Hour</option>
                {Array.from({length:24},(_,i)=>{
                  const h = String(i).padStart(2,"0");
                  return <option key={h} value={h}>{h}</option>;
                })}
              </select>
              <span style={{ color:"#444", fontSize:18, fontWeight:700 }}>:</span>
              <select
                value={inviteForm.toMin}
                onChange={(e) => setInviteForm({ ...inviteForm, toMin: e.target.value })}
                style={{ flex:1, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color: inviteForm.toMin ? "#fff" : "#555" }}
              >
                <option value="">Min</option>
                <option value="00">00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
              </select>
            </div>
            <div style={{ fontSize:11, color:"#333", marginBottom:16, lineHeight:1.6 }}>
              Your visitor can only check in within this time window on the selected date. The gate will reject the code outside these hours.
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
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={c.section}>Your Invites</div>
                {hiddenIds.length > 0 && (
                  <button onClick={unhideAll} style={{ background:"none", border:"none", color:"#555", fontSize:11, cursor:"pointer", letterSpacing:0.5, textDecoration:"underline" }}>
                    Show {hiddenIds.length} hidden
                  </button>
                )}
              </div>
              {loadingInvites ? (
                <div style={{ color:"#2a2a2a", fontSize:13 }}>Loading...</div>
              ) : myInvites.filter((i) => !hiddenIds.includes(i.id)).length === 0 ? (
                <div style={{ color:"#2a2a2a", fontSize:13 }}>
                  No invites to show.{" "}
                  {hiddenIds.length > 0 && (
                    <button onClick={unhideAll} style={{ background:"none", border:"none", color:"#555", fontSize:11, cursor:"pointer", textDecoration:"underline" }}>Show hidden</button>
                  )}
                </div>
              ) : (
                myInvites.filter((i) => !hiddenIds.includes(i.id)).map((inv) => <InviteCard key={inv.id} inv={inv} />)
              )}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {view === "profile" && (
          <ProfileView user={user} onUserUpdate={onUserUpdate} onLogout={onLogout} />
        )}

      </div>

      {/* Code generated modal */}
      {codeModal && (
        <div
          onClick={() => setCodeModal(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background:"#141414", border:"1px solid #2a2a2a", borderRadius:20, padding:28, width:"100%", maxWidth:340, boxShadow:"0 20px 60px rgba(0,0,0,0.8)" }}
          >
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:17, color:"#fff", marginBottom:3 }}>Invite Created!</div>
                <div style={{ fontSize:12, color:"#555" }}>Share this code with your guest</div>
              </div>
              <button
                onClick={() => setCodeModal(null)}
                style={{ background:"#222", border:"1px solid #2a2a2a", color:"#666", borderRadius:"50%", width:28, height:28, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}
              >
                &#x2715;
              </button>
            </div>

            {/* Guest info */}
            <div style={{ background:"#0a0a0a", border:"1px solid #1e1e1e", borderRadius:12, padding:"12px 14px", marginBottom:16 }}>
              {[
                ["Guest",   codeModal.guestName],
                ["Date",    fmtDate(codeModal.date)],
                ["Window",  codeModal.timeFrom + " – " + codeModal.timeTo + " WAT"],
                ...(codeModal.purpose ? [["Purpose", codeModal.purpose]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #1a1a1a" }}>
                  <span style={{ fontSize:11, color:"#444", letterSpacing:0.5 }}>{k}</span>
                  <span style={{ fontSize:12, color:"#888" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Big code + copy */}
            <ModalCopyBox code={codeModal.code} />

            <button
              onClick={() => setCodeModal(null)}
              style={{ width:"100%", background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#666", borderRadius:10, padding:"11px 0", fontSize:13, cursor:"pointer", marginTop:12 }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav — Invite is the prominent centre button */}
      <div style={{ display:"flex", background:"#141414", borderTop:"1px solid #1e1e1e", padding:"6px 0", alignItems:"flex-end", position:"relative" }}>
        {/* Home */}
        <button onClick={() => setView("dashboard")} style={c.navBtn(view === "dashboard")} >
          <span style={{ fontSize:18 }}>⌂</span>
          Home
        </button>

        {/* Invite — raised centre FAB-style */}
        <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center", position:"relative" }}>
          <button
            onClick={() => setView("invite")}
            style={{
              position:"relative",
              bottom:18,
              width:58, height:58,
              borderRadius:"50%",
              background: view === "invite" ? "#fff" : "#e8e8e8",
              border: view === "invite" ? "3px solid #fff" : "3px solid #2a2a2a",
              boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
              cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              gap:1,
              transition:"all 0.15s",
            }}
          >
            <span style={{ fontSize:22, color: view === "invite" ? "#000" : "#333" }}>✉</span>
            <span style={{ fontSize:9, fontWeight:700, letterSpacing:0.5, color: view === "invite" ? "#000" : "#555" }}>INVITE</span>
          </button>
        </div>

        {/* Profile */}
        <button onClick={() => setView("profile")} style={c.navBtn(view === "profile")}>
          <span style={{ fontSize:18 }}>◯</span>
          Profile
        </button>
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

    // Verify current password by re-signing in
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: pwForm.current,
    });
    if (signInErr) return setPwErr("Current password is incorrect.");

    // Update in Supabase Auth
    const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.newPw });
    if (updateErr) return setPwErr("Failed to update password. Please try again.");

    // Keep users table in sync
    await dbUpdatePassword(user.email, pwForm.newPw);

    onUserUpdate({ ...user });
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
          ["Estate",    estate ? estate.name : user.estateId],
          ["Unit",      user.unitName || "—"],
          ["Role",      user.role === "security" ? "Security Officer" : "Resident"],
          ["Member since", user.createdAt || "—"],
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
        <PwInput placeholder="Your current password" value={pwForm.current} onChange={setPw("current")} style={c.appInput} />
        <label style={c.label}>New Password</label>
        <PwInput placeholder="At least 6 characters" value={pwForm.newPw} onChange={setPw("newPw")} style={c.appInput} />
        <label style={c.label}>Confirm New Password</label>
        <PwInput placeholder="Repeat new password" value={pwForm.confirm} onChange={setPw("confirm")} style={{ ...c.appInput, marginBottom:0 }} />
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
  const [refreshing, setRefreshing] = useState(false);
  const [nigeriaTime, setNigeriaTime] = useState("");

  useEffect(() => {
    const tick = () => {
      const t = new Date().toLocaleTimeString("en-NG", { timeZone:"Africa/Lagos", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
      const d = new Date().toLocaleDateString("en-NG", { timeZone:"Africa/Lagos", weekday:"short", day:"numeric", month:"short" });
      setNigeriaTime(d + " · " + t + " WAT");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Hidden log entry ids for security — persisted per user
  const secHiddenKey = "upsidian_sec_hidden_" + user.email;
  const [hiddenLogIds, setHiddenLogIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(secHiddenKey) || "[]"); } catch { return []; }
  });
  const hideLog = (id) => {
    const next = [...hiddenLogIds, id];
    setHiddenLogIds(next);
    try { localStorage.setItem(secHiddenKey, JSON.stringify(next)); } catch {}
  };
  const unhideAllLogs = () => {
    setHiddenLogIds([]);
    try { localStorage.removeItem(secHiddenKey); } catch {}
  };

  const loadLog = async () => {
    const log = await dbGetLog(user.estateId);
    setAccessLog(log);
  };

  useEffect(() => {
    loadLog();
    // Auto-refresh log every 30s so new check-ins from other terminals appear
    const interval = setInterval(loadLog, 30000);
    return () => clearInterval(interval);
  }, [user.estateId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setGateResult(null);
    await loadLog();
    setTimeout(() => setRefreshing(false), 600);
  };

  const verify = async () => {
    if (!gateCode.trim()) return;
    setLoading(true);
    setGateResult(null);
    const code       = gateCode.toUpperCase().trim();
    const allInvites = await dbGetInvites(user.estateId);
    const found      = allInvites.find((i) => i.code === code);

    if (!found) {
      setGateResult({ type:"invalid" });
    } else if (found.status === "used") {
      setGateResult({ type:"used" });
    } else if (!isInviteValid(found)) {
      setGateResult({ type:"expired", invite:found });
    } else {
      await dbMarkInviteUsed(found.id);
      const entry = {
        id: Date.now(), guest: found.guestName, resident: found.residentName,
        unit: found.residentUnit, code: found.code, estateId: user.estateId,
        time: new Date().toLocaleTimeString("en-NG", { timeZone:"Africa/Lagos" }),
        action: "Checked In",
      };
      await dbAddLogEntry(entry);
      const newLog = [entry, ...accessLog];
      setAccessLog(newLog);
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
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ ...c.badge, fontSize:11 }}>Security Officer</div>
                <div style={{ color:"#333", fontSize:11 }}>{user.name}</div>
              </div>
              <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:8, padding:"5px 10px", textAlign:"right" }}>
                <div style={{ fontSize:10, color:"#333", letterSpacing:1, textTransform:"uppercase", marginBottom:2 }}>Nigeria Time</div>
                <div style={{ fontSize:11, color:"#888", fontVariantNumeric:"tabular-nums" }}>{nigeriaTime}</div>
              </div>
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

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={c.section}>Access Log</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {hiddenLogIds.length > 0 && (
                  <button onClick={unhideAllLogs} style={{ background:"none", border:"none", color:"#555", fontSize:11, cursor:"pointer", textDecoration:"underline", letterSpacing:0.5 }}>
                    Show {hiddenLogIds.length} hidden
                  </button>
                )}
                <button
                  onClick={handleRefresh}
                  style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", color: refreshing ? "#444" : "#888", borderRadius:8, padding:"5px 12px", fontSize:11, cursor:"pointer", letterSpacing:0.5, transition:"color 0.2s" }}
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            {accessLog.filter((l) => !hiddenLogIds.includes(l.id)).length === 0 ? (
              <div style={{ color:"#2a2a2a", fontSize:13, padding:"12px 0" }}>
                No check-ins to show.{" "}
                {hiddenLogIds.length > 0 && (
                  <button onClick={unhideAllLogs} style={{ background:"none", border:"none", color:"#555", fontSize:11, cursor:"pointer", textDecoration:"underline" }}>Show hidden</button>
                )}
              </div>
            ) : (
              accessLog.filter((l) => !hiddenLogIds.includes(l.id)).map((log) => (
                <div key={log.id} style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:10, padding:12, marginBottom:8, fontSize:13 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <strong style={{ color:"#e0e0e0" }}>{log.guest}</strong>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ color:"#6bff6b", fontSize:11 }}>{log.action}</span>
                      <button
                        onClick={() => hideLog(log.id)}
                        style={{ background:"none", border:"none", color:"#333", fontSize:10, cursor:"pointer", letterSpacing:0.5 }}
                      >
                        Hide
                      </button>
                    </div>
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
  const [user, setUser]           = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [checking, setChecking]   = useState(true);
  const logout      = () => setUser(null);
  const updateUser  = (updated) => setUser(updated);

  useEffect(() => {
    // Check URL hash immediately on load — Supabase puts recovery tokens here
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setShowReset(true);
      setChecking(false);
      return;
    }

    setChecking(false);

    // Also listen for the event firing after mount
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setShowReset(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (checking) return null;

  if (showReset) {
    return (
      <ResetPasswordScreen
        onDone={() => {
          setShowReset(false);
          window.history.replaceState({}, "", window.location.pathname);
        }}
      />
    );
  }

  if (!user) return <AuthScreen onLogin={setUser} />;
  if (user.role === "security")
    return <SecurityAppWithProfile user={user} onLogout={logout} onUserUpdate={updateUser} />;
  return <ResidentApp user={user} onLogout={logout} onUserUpdate={updateUser} />;
}