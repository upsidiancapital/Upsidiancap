import { useState, useEffect, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// ESTATES is loaded from Supabase at runtime — see dbGetEstates()
// Kept as empty fallback only
let ESTATES = [];

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

// ESTATES
async function dbGetEstates() {
  const { data, error } = await supabase.from("estates").select("*").eq("active", true).order("name");
  if (error) { console.error("dbGetEstates:", error); return []; }
  return (data || []).map(e => ({
    id: e.id, name: e.name, code: e.security_code, active: e.active,
    createdAt: e.created_at,
  }));
}
async function dbCreateEstate(estate) {
  const { error } = await supabase.from("estates").insert({
    id: estate.id, name: estate.name, security_code: estate.code,
  });
  if (error) { console.error("dbCreateEstate:", error); return false; }
  return true;
}
async function dbDeactivateEstate(id) {
  const { error } = await supabase.from("estates").update({ active: false }).eq("id", id);
  if (error) { console.error("dbDeactivateEstate:", error); return false; }
  return true;
}
async function dbUpdateEstateCode(id, newCode) {
  const { error } = await supabase.from("estates").update({ security_code: newCode }).eq("id", id);
  if (error) { console.error("dbUpdateEstateCode:", error); return false; }
  return true;
}

// ADMIN — approved residents management
async function dbGetApprovedResidents(estateId) {
  const q = supabase.from("approved_residents").select("*").order("unit_name");
  if (estateId) q.eq("estate_id", estateId);
  const { data, error } = await q;
  if (error) { console.error("dbGetApprovedResidents:", error); return []; }
  return data || [];
}
async function dbAddApprovedResident(email, estateId, unitName, role="resident") {
  const { error } = await supabase.from("approved_residents").upsert({
    email: email.trim().toLowerCase(), estate_id: estateId, unit_name: unitName,
    used: false, role: role,
  }, { onConflict: "email,estate_id" });
  if (error) { console.error("dbAddApprovedResident:", error); return false; }
  return true;
}
async function dbResetApprovedResident(email, estateId) {
  const { error } = await supabase.from("approved_residents")
    .update({ used: false }).eq("email", email).eq("estate_id", estateId);
  if (error) { console.error("dbResetApprovedResident:", error); return false; }
  return true;
}
async function dbDeleteApprovedResident(id) {
  const { error } = await supabase.from("approved_residents").delete().eq("id", id);
  if (error) { console.error("dbDeleteApprovedResident:", error); return false; }
  return true;
}
async function dbGetAllUsersAdmin() {
  const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
  if (error) { console.error("dbGetAllUsersAdmin:", error); return []; }
  return data || [];
}
async function dbDeleteUser(email) {
  // 1. Delete all profiles for this email from our users table
  const { error } = await supabase.from("users").delete().eq("email", email);
  if (error) { console.error("dbDeleteUser:", error); return false; }

  // 2. Reset their approved_residents entries so they can re-register
  await supabase.from("approved_residents").update({ used: false }).eq("email", email);

  // 3. Delete from Supabase Auth via Edge Function (requires service role)
  try {
    await supabase.functions.invoke("delete-user", { body: { email } });
  } catch (err) {
    console.warn("Could not delete from Supabase Auth:", err);
    // Still return true — table deletion succeeded, Auth cleanup may need manual attention
  }
  return true;
}

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
// Get ALL profiles for an email (security can have one per estate)
async function dbGetAllProfilesForEmail(email) {
  const { data, error } = await supabase.from("users").select("*").eq("email", email);
  if (error || !data) return [];
  return data.map(d => ({
    email: d.email, name: d.name,
    estateId: d.estate_id, role: d.role,
    unitName: d.unit_name || null,
    createdAt: d.created_at ? new Date(d.created_at).toLocaleDateString("en-NG", { day:"numeric", month:"short", year:"numeric" }) : null,
  }));
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
async function dbGetUserProfile(email, estateId) {
  const { data, error } = await supabase.from("users").select("*")
    .eq("email", email).eq("estate_id", estateId).single();
  if (error || !data) return null;
  return {
    email: data.email, name: data.name,
    estateId: data.estate_id, role: data.role,
    unitName: data.unit_name || null,
    createdAt: data.created_at ? new Date(data.created_at).toLocaleDateString("en-NG", { day:"numeric", month:"short", year:"numeric" }) : null,
  };
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
  page:      { fontFamily:"'DM Sans','Helvetica Neue',sans-serif", minHeight:"100dvh", background:"#0a0a0a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px" },
  authCard:  { background:"#141414", border:"1px solid #2a2a2a", borderRadius:20, padding:"40px 32px", width:"100%", maxWidth:390 },
  appWrap:   { fontFamily:"'DM Sans','Helvetica Neue',sans-serif", maxWidth:430, margin:"0 auto", height:"100dvh", maxHeight:"100dvh", background:"#0f0f0f", display:"flex", flexDirection:"column", color:"#fff", position:"relative", overflow:"hidden" },
  header:    { background:"#141414", borderBottom:"1px solid #1e1e1e", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" },
  content:   { flex:1, padding:16, overflowY:"auto", WebkitOverflowScrolling:"touch" },
  bottomNav: { display:"flex", background:"#141414", borderTop:"1px solid #1e1e1e", padding:"6px 0", paddingBottom:"calc(6px + env(safe-area-inset-bottom))" },

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

function AuthScreen({ onLogin, onLogoTap = () => {} }) {
  const [mode, setMode]   = useState("login");
  const [role, setRole]   = useState("resident");
  const [form, setForm]   = useState({ firstName:"", lastName:"", email:"", password:"", confirm:"", estateId:"", estateCode:"", adminCode:"" });
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const set      = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const goLogin  = () => { setMode("login");  setError(""); setSuccess(""); };
  const goSignup = () => { setMode("signup"); setError(""); setSuccess(""); };
  const goForgot = () => { setMode("forgot"); setError(""); setSuccess(""); };

  // If user has multiple estate profiles (security), show estate picker
  const [profiles, setProfiles]     = useState(null); // null = not yet fetched
  const [selProfile, setSelProfile] = useState(null);

  const handleLogin = async () => {
    setError("");
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (authError || !authData.user) return setError("Invalid email or password.");

    const allProfiles = await dbGetAllProfilesForEmail(form.email.trim().toLowerCase());
    if (allProfiles.length === 0) return setError("Account not found. Please contact your estate admin.");

    if (allProfiles.length === 1) {
      // Single profile — log straight in
      const estate = ESTATES.find((e) => e.id === allProfiles[0].estateId);
      onLogin({ ...allProfiles[0], estateName: estate ? estate.name : "Estate" });
    } else {
      // Multiple profiles (security with multiple estates) — show picker
      setProfiles(allProfiles);
    }
  };

  const handleSelectProfile = (profile) => {
    const estate = ESTATES.find((e) => e.id === profile.estateId);
    onLogin({ ...profile, estateName: estate ? estate.name : "Estate" });
    setProfiles(null);
  };

  const handleSignup = async () => {
    setError(""); setSuccess("");

    // Basic validation for all roles
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email || !form.password)
      return setError("All name, email and password fields are required.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");

    let resolvedEstateId = null;
    let resolvedUnitName = null;

    if (role === "resident") {
      // Check approved_residents — the approved entry determines their estate and unit
      let approved = null;
      for (const estate of ESTATES) {
        const check = await dbCheckApprovedResident(form.email, estate.id);
        if (check && check.unitName !== "__security__") {
          approved = check;
          resolvedEstateId = estate.id;
          break;
        }
      }
      if (!approved) {
        return setError("Your email is not on the approved residents list. Contact your estate manager to be added first.");
      }
      resolvedUnitName = approved.unitName;

    } else if (role === "security") {
      // Security: must select estate + enter admin code + be on approved security list
      if (!form.estateId) return setError("Please select your estate.");
      if (!form.adminCode) return setError("Admin code is required to register as Security.");
      const estateRec = ESTATES.find(e => e.id === form.estateId);
      if (!estateRec || form.adminCode !== estateRec.code)
        return setError("Invalid admin code. Contact your estate administrator.");
      const approvedSec = await dbCheckApprovedResident(form.email, form.estateId);
      if (!approvedSec || approvedSec.unitName !== "__security__") {
        return setError("Your email is not approved as a security officer for this estate. Contact your administrator.");
      }
      resolvedEstateId = form.estateId;
      resolvedUnitName = null;
    }

    const estate = ESTATES.find((e) => e.id === resolvedEstateId);
    if (!estate) return setError("Could not determine your estate. Please contact support.");

    // Check if a profile already exists for this email + estate combination
    const existingProfile = await dbGetUserProfile(form.email.trim().toLowerCase(), resolvedEstateId);
    if (existingProfile) return setError("An account already exists for this email and estate.");

    // Create Supabase Auth account (only on first signup — subsequent estates share the same Auth account)
    const { error: authError } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (authError && !authError.message.includes("already registered")) {
      return setError("Sign-up failed: " + authError.message);
    }

    // Save this estate profile
    const newUser = {
      email: form.email.trim().toLowerCase(),
      name: (form.firstName.trim() + " " + form.lastName.trim()),
      estateId: resolvedEstateId,
      role,
      unitName: resolvedUnitName,
    };
    const saved = await dbCreateUser(newUser);
    if (!saved) {
      await supabase.auth.signOut();
      return setError("Sign-up failed — could not save your profile. Please try again.");
    }

    // Mark the approved slot as used
    await dbMarkResidentUsed(form.email, resolvedEstateId);

    await supabase.auth.signOut();
    setSuccess(
      "Account created! Registered to " + estate.name +
      (resolvedUnitName ? " — " + resolvedUnitName : " as Security Officer") +
      ". You can now sign in."
    );
    setMode("login");
    setForm({ firstName:"", lastName:"", email:form.email, password:"", confirm:"", estateId:"", estateCode:"", adminCode:"" });
  };

  if (mode === "forgot") return <ForgotPasswordScreen onBack={goLogin} />;

  // Estate picker — shown when a security officer has multiple estate profiles
  if (profiles) {
    return (
      <div style={c.page}>
        <div style={c.authCard}>
          <div style={{ ...c.logo, cursor:"default", userSelect:"none" }}>UPSIDIAN</div>
          <div style={c.logoSub}>SMART ESTATE MANAGEMENT</div>
          <div style={c.title}>Select Estate</div>
          <div style={c.desc}>Your account is linked to multiple estates. Choose which one to log into.</div>
          {profiles.map(p => {
            const estate = ESTATES.find(e => e.id === p.estateId);
            return (
              <button
                key={p.estateId}
                onClick={() => handleSelectProfile(p)}
                style={{ width:"100%", background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#fff", borderRadius:12, padding:"14px 16px", marginBottom:10, cursor:"pointer", textAlign:"left", display:"block" }}
              >
                <div style={{ fontWeight:700, fontSize:14 }}>{estate ? estate.name : p.estateId}</div>
                <div style={{ fontSize:11, color:"#555", marginTop:3 }}>
                  {p.role === "security" ? "Security Officer" : "Resident" + (p.unitName ? " — " + p.unitName : "")}
                </div>
              </button>
            );
          })}
          <button onClick={() => { setProfiles(null); supabase.auth.signOut(); }}
            style={{ background:"none", border:"none", color:"#444", fontSize:12, cursor:"pointer", marginTop:8, width:"100%" }}>
            &larr; Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={c.page}>
      <div style={c.authCard}>
        {mode === "signup" && (
          <button style={c.btnBack} onClick={goLogin}>&larr; Back to Sign In</button>
        )}
        <div style={{ ...c.logo, cursor:"default", userSelect:"none" }} onClick={onLogoTap}>UPSIDIAN</div>
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
            <label style={c.label}>First Name</label>
            <input style={c.input} placeholder="e.g. Adeola" value={form.firstName} onChange={set("firstName")} />
            <label style={c.label}>Last Name</label>
            <input style={c.input} placeholder="e.g. Martins" value={form.lastName} onChange={set("lastName")} />
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
  const [inviteForm, setInviteForm] = useState(() => {
    const now    = nowNigeria();
    const y      = String(now.getFullYear());
    const mo     = String(now.getMonth() + 1).padStart(2, "0");
    const d      = String(now.getDate()).padStart(2, "0");
    // Round current minute up to nearest 15
    const rawMin = now.getMinutes();
    const rMin   = Math.ceil(rawMin / 15) * 15;
    const fromH  = rMin === 60
      ? String((now.getHours() + 1) % 24).padStart(2, "0")
      : String(now.getHours()).padStart(2, "0");
    const fromM  = rMin === 60 ? "00" : String(rMin).padStart(2, "0");
    // End time = start + 1hr
    const toH    = String((Number(fromH) + 1) % 24).padStart(2, "0");
    const toM    = fromM;
    return {
      guestName:"", purpose:"",
      day: d, month: mo, year: y,
      fromHour: fromH, fromMin: fromM,
      toHour: toH, toMin: toM,
    };
  });
  const [inviteErr, setInviteErr]       = useState("");
  const [codeModal, setCodeModal] = useState(null); // popup for newly created invite
  const [codesVisible, setCodesVisible] = useState(true); // toggle all codes on dashboard

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

    const newInvite = {
      id: Date.now(),
      guestName:    inviteForm.guestName,
      purpose:      inviteForm.purpose,
      date,
      timeFrom,
      timeTo,
      residentId:   null,
      residentName: user.name,
      residentUnit: user.unitName || "—",
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
    // Reset form but keep today's defaults
    const now2   = nowNigeria();
    const rMin2  = Math.ceil(now2.getMinutes() / 15) * 15;
    const fromH2 = rMin2 === 60 ? String((now2.getHours()+1)%24).padStart(2,"0") : String(now2.getHours()).padStart(2,"0");
    const fromM2 = rMin2 === 60 ? "00" : String(rMin2).padStart(2,"0");
    setInviteForm({
      guestName:"", purpose:"",
      day: String(now2.getDate()).padStart(2,"0"),
      month: String(now2.getMonth()+1).padStart(2,"0"),
      year: String(now2.getFullYear()),
      fromHour: fromH2, fromMin: fromM2,
      toHour: String((Number(fromH2)+1)%24).padStart(2,"0"), toMin: fromM2,
    });
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
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={c.section}>Your Recent Invites</div>
                {myInvites.length > 0 && (
                  <button
                    onClick={() => setCodesVisible(v => !v)}
                    style={{ background:"none", border:"1px solid #2a2a2a", color:"#555", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer", letterSpacing:0.5 }}
                  >
                    {codesVisible ? "Hide" : "Show"}
                  </button>
                )}
              </div>
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
              ) : codesVisible ? (
                <>
                  {myInvites.filter((i) => !hiddenIds.includes(i.id)).slice(0, 3).map((inv) => <InviteCard key={inv.id} inv={inv} />)}
                  {myInvites.filter((i) => !hiddenIds.includes(i.id)).length > 3 && (
                    <button
                      onClick={() => setView("invite")}
                      style={{ width:"100%", background:"none", border:"1px solid #1e1e1e", color:"#555", borderRadius:10, padding:"10px 0", fontSize:12, cursor:"pointer", letterSpacing:0.5, marginTop:4 }}
                    >
                      View all {myInvites.filter((i) => !hiddenIds.includes(i.id)).length} invites &rarr;
                    </button>
                  )}
                </>
              ) : (
                <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:12, color:"#333" }}>
                    {myInvites.length} invite{myInvites.length !== 1 ? "s" : ""} hidden &middot;{" "}
                    <button onClick={() => setCodesVisible(true)} style={{ background:"none", border:"none", color:"#555", fontSize:12, cursor:"pointer", textDecoration:"underline", padding:0 }}>
                      Show
                    </button>
                  </div>
                </div>
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
              const today       = nowNigeria();
              const todayY      = today.getFullYear();
              const todayM      = today.getMonth() + 1;
              const todayD      = today.getDate();
              // Year is always current year — no dropdown needed
              const fixedYear   = todayY;
              const selM        = Number(inviteForm.month) || 0;
              const daysInMonth = selM ? new Date(fixedYear, selM, 0).getDate() : 31;
              return (
                <div>
                  <label style={c.label}>Visit Date — {fixedYear}</label>
                  <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                    {/* Month */}
                    <select
                      value={inviteForm.month}
                      onChange={(e) => setInviteForm({ ...inviteForm, month: e.target.value, day:"", year: String(fixedYear) })}
                      style={{ flex:2, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff" }}
                    >
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=>{
                        const mNum  = i + 1;
                        const isPast = mNum < todayM;
                        const val   = String(mNum).padStart(2,"0");
                        return <option key={val} value={val} disabled={isPast}>{m}</option>;
                      })}
                    </select>
                    {/* Day */}
                    <select
                      value={inviteForm.day}
                      onChange={(e) => setInviteForm({ ...inviteForm, day: e.target.value })}
                      style={{ flex:1, padding:"12px 8px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, fontSize:14, color:"#fff" }}
                    >
                      {Array.from({length: daysInMonth},(_,i)=>{
                        const dNum  = i + 1;
                        const isPast = selM === todayM && dNum < todayD;
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

            {/* Resident info — auto-filled from logged in user */}
            <div style={{ background:"#0a0a0a", border:"1px solid #1e1e1e", borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
              <div style={{ fontSize:10, color:"#333", letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 }}>Visiting</div>
              <div style={{ fontSize:13, color:"#888" }}>{user.name} &middot; {user.unitName || "Your unit"}</div>
            </div>

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
          ...(user.role === "resident" ? [["Unit", user.unitName || "—"]] : []),
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
  const [refreshing, setRefreshing]   = useState(false);
  const [nigeriaTime, setNigeriaTime] = useState("");
  const [logVisible, setLogVisible]   = useState(true); // toggle all accepted codes

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
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {hiddenLogIds.length > 0 && (
                  <button onClick={unhideAllLogs} style={{ background:"none", border:"none", color:"#555", fontSize:11, cursor:"pointer", textDecoration:"underline", letterSpacing:0.5 }}>
                    Show {hiddenLogIds.length} hidden
                  </button>
                )}
                {accessLog.length > 0 && (
                  <button
                    onClick={() => setLogVisible(v => !v)}
                    style={{ background:"none", border:"1px solid #2a2a2a", color:"#555", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer", letterSpacing:0.5 }}
                  >
                    {logVisible ? "Hide" : "Show"}
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
            {!logVisible ? (
              <div style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                <div style={{ fontSize:12, color:"#333" }}>
                  {accessLog.length} check-in{accessLog.length !== 1 ? "s" : ""} hidden &middot;{" "}
                  <button onClick={() => setLogVisible(true)} style={{ background:"none", border:"none", color:"#555", fontSize:12, cursor:"pointer", textDecoration:"underline", padding:0 }}>
                    Show
                  </button>
                </div>
              </div>
            ) : accessLog.filter((l) => !hiddenLogIds.includes(l.id)).length === 0 ? (
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


// ─── Admin Panel ──────────────────────────────────────────────────────────────

function AdminPanel({ onExit }) {
  const ADMIN_PW = "rtglisunq58tghq59g8p8fhqb94wqb8p98qb3pfbdliweauksnc";
  const [authed, setAuthed]       = useState(false);
  const [pwInput, setPwInput]     = useState("");
  const [pwErr, setPwErr]         = useState("");
  const [view, setView]           = useState("estates"); // estates | residents | users
  const [estates, setEstates]     = useState([]);
  const [residents, setResidents] = useState([]);
  const [users, setUsers]         = useState([]);
  const [selEstate, setSelEstate]       = useState("");
  const [userEstateFilter, setUserEstateFilter] = useState(""); // filter users by estate
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null); // email of user pending delete
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState("");

  // New estate form
  const [newEstate, setNewEstate] = useState({ id:"", name:"", code:"" });
  // New resident form
  const [newRes, setNewRes]       = useState({ email:"", unit:"" });
  // New security form
  const [newSec, setNewSec]       = useState({ email:"" });
  const [accessSubTab, setAccessSubTab] = useState("residents"); // residents | security
  // Bulk paste
  const [bulkText, setBulkText]   = useState("");
  const [bulkMsg, setBulkMsg]     = useState("");

  // Inline estate row with editable code
  const EstateRow = ({ estate: e, onRefresh }) => {
    const [editing, setEditing] = useState(false);
    const [newCode, setNewCode] = useState(e.code);
    const [saving, setSaving]   = useState(false);
    const save = async () => {
      if (!newCode.trim()) return;
      setSaving(true);
      await dbUpdateEstateCode(e.id, newCode.trim());
      setSaving(false);
      setEditing(false);
      onRefresh();
    };
    return (
      <div style={{ ...a.row, flexDirection:"column", alignItems:"flex-start", gap:8 }}>
        <div style={{ display:"flex", justifyContent:"space-between", width:"100%", alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:600, color:"#e0e0e0" }}>{e.name}</div>
            <div style={{ fontSize:11, color:"#444" }}>ID: {e.id}</div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button style={a.btnSm} onClick={() => setEditing(v => !v)}>
              {editing ? "Cancel" : "Edit Code"}
            </button>
            <button style={a.btnRed} onClick={async () => { await dbDeactivateEstate(e.id); onRefresh(); }}>
              Deactivate
            </button>
          </div>
        </div>
        {editing ? (
          <div style={{ display:"flex", gap:8, width:"100%", alignItems:"center" }}>
            <input
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              style={{ ...a.input, marginBottom:0, flex:1, fontSize:12 }}
              placeholder="New security code"
            />
            <button style={a.btn} onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        ) : (
          <div style={{ fontSize:11, color:"#555" }}>Security code: <span style={{ color:"#777" }}>{e.code}</span></div>
        )}
      </div>
    );
  };

  const load = async () => {
    setLoading(true);
    const [e, u] = await Promise.all([dbGetEstates(), dbGetAllUsersAdmin()]);
    setEstates(e); setUsers(u);
    ESTATES.length = 0; ESTATES.push(...e);
    setLoading(false);
  };

  const loadResidents = async (estateId) => {
    const r = await dbGetApprovedResidents(estateId);
    setResidents(r);
  };

  useEffect(() => { if (authed) load(); }, [authed]);
  useEffect(() => { if (authed && selEstate) loadResidents(selEstate); }, [selEstate, authed]);

  const handleLogin = () => {
    if (pwInput === ADMIN_PW) { setAuthed(true); setPwErr(""); }
    else setPwErr("Incorrect password.");
  };

  const addEstate = async () => {
    if (!newEstate.id || !newEstate.name || !newEstate.code)
      return setMsg("All estate fields required.");
    const id = newEstate.id.toLowerCase().replace(/\s+/g, "_");
    const ok = await dbCreateEstate({ ...newEstate, id });
    if (ok) { setMsg("Estate added!"); setNewEstate({ id:"", name:"", code:"" }); load(); }
    else setMsg("Failed to add estate.");
  };

  const addResident = async () => {
    if (!selEstate || !newRes.email || !newRes.unit)
      return setMsg("Select estate, enter email and unit.");
    const ok = await dbAddApprovedResident(newRes.email, selEstate, newRes.unit, "resident");
    if (ok) { setMsg("Resident added!"); setNewRes({ email:"", unit:"" }); loadResidents(selEstate); }
    else setMsg("Failed. Email may already exist for this estate.");
  };

  const addSecurity = async () => {
    if (!selEstate || !newSec.email)
      return setMsg("Select estate and enter email.");
    const ok = await dbAddApprovedResident(newSec.email, selEstate, "__security__", "security");
    if (ok) { setMsg("Security officer approved!"); setNewSec({ email:"" }); loadResidents(selEstate); }
    else setMsg("Failed. Email may already exist for this estate.");
  };

  const handleBulkAdd = async () => {
    if (!selEstate || !bulkText.trim()) return setBulkMsg("Select an estate and paste data.");
    const lines = bulkText.trim().split("\n").filter(l => l.trim());
    let added = 0, failed = 0;
    for (const line of lines) {
      // Support: "email, unit" or "email  unit" (tab-separated)
      const parts = line.split(/[,	]/).map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) { failed++; continue; }
      const [email, ...unitParts] = parts;
      const unit = unitParts.join(", ");
      const ok = await dbAddApprovedResident(email, selEstate, unit);
      ok ? added++ : failed++;
    }
    setBulkMsg(`Done — ${added} added, ${failed} failed.`);
    setBulkText("");
    loadResidents(selEstate);
  };

  const a = {
    wrap:    { fontFamily:"'DM Sans','Helvetica Neue',sans-serif", minHeight:"100vh", background:"#0a0a0a", color:"#fff", padding:24 },
    header:  { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28, paddingBottom:16, borderBottom:"1px solid #1e1e1e" },
    logo:    { fontSize:20, fontWeight:800, letterSpacing:4, color:"#fff" },
    tab:     (active) => ({ background: active ? "#fff" : "#1a1a1a", color: active ? "#000" : "#555", border: active ? "none" : "1px solid #2a2a2a", borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:0.5 }),
    card:    { background:"#141414", border:"1px solid #1e1e1e", borderRadius:14, padding:20, marginBottom:16 },
    label:   { fontSize:10, fontWeight:600, color:"#666", letterSpacing:1.5, display:"block", marginBottom:6, textTransform:"uppercase" },
    input:   { width:"100%", padding:"10px 12px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:8, fontSize:13, color:"#fff", boxSizing:"border-box", outline:"none", marginBottom:10 },
    btn:     { background:"#fff", color:"#000", border:"none", padding:"10px 20px", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" },
    btnSm:   { background:"#1a1a1a", color:"#888", border:"1px solid #2a2a2a", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" },
    btnRed:  { background:"#1a0a0a", color:"#ff6b6b", border:"1px solid #3d1515", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" },
    section: { fontWeight:700, fontSize:11, color:"#555", letterSpacing:2, textTransform:"uppercase", marginBottom:12 },
    row:     { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #1a1a1a", fontSize:13 },
    msg:     { background:"#0a1e0a", border:"1px solid #1a3d1a", borderRadius:8, padding:"10px 14px", color:"#6bff6b", fontSize:12, marginBottom:12 },
    err:     { background:"#1e0a0a", border:"1px solid #3d1515", borderRadius:8, padding:"10px 14px", color:"#ff6b6b", fontSize:12, marginBottom:12 },
  };

  // ── Login gate ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ ...a.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:"#141414", border:"1px solid #2a2a2a", borderRadius:20, padding:"40px 32px", width:"100%", maxWidth:360 }}>
          <div style={a.logo}>UPSIDIAN</div>
          <div style={{ fontSize:10, color:"#444", letterSpacing:1.5, marginBottom:28 }}>ADMIN PANEL</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:20 }}>Admin Access</div>
          {pwErr && <div style={a.err}>{pwErr}</div>}
          <label style={a.label}>Admin Password</label>
          <input style={a.input} type="password" placeholder="Enter admin password"
            value={pwInput} onChange={e => setPwInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()} />
          <button style={{ ...a.btn, width:"100%", marginTop:4 }} onClick={handleLogin}>
            Enter Admin Panel &rarr;
          </button>
          <div style={{ marginTop:16, textAlign:"center" }}>
            <button onClick={onExit} style={{ background:"none", border:"none", color:"#444", fontSize:12, cursor:"pointer" }}>
              &larr; Back to App
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main admin panel ──────────────────────────────────────────────────────
  return (
    <div style={a.wrap}>
      <div style={a.header}>
        <div>
          <div style={a.logo}>UPSIDIAN</div>
          <div style={{ fontSize:10, color:"#444", letterSpacing:1.5 }}>ADMIN PANEL</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={a.btnSm} onClick={load}>Refresh</button>
          <button style={a.btnSm} onClick={onExit}>Exit Admin</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
        {[
          { label:"Estates", value: estates.length },
          { label:"Approved Residents", value: residents.length || "—" },
          { label:"Signed Up Users", value: users.filter(u => u.role === "resident").length },
        ].map(s => (
          <div key={s.label} style={{ background:"#141414", border:"1px solid #1e1e1e", borderRadius:12, padding:16 }}>
            <div style={{ fontSize:26, fontWeight:800 }}>{s.value}</div>
            <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[
          { id:"estates",   label:"Estates" },
          { id:"residents", label:"Access" },
          { id:"users",     label:"Users" },
        ].map(t => (
          <button key={t.id} style={a.tab(view === t.id)} onClick={() => setView(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div style={a.msg}>{msg}</div>}

      {/* ── ESTATES TAB ── */}
      {view === "estates" && (
        <div>
          <div style={a.card}>
            <div style={a.section}>Add New Estate</div>
            <label style={a.label}>Estate ID (no spaces, e.g. lekki_gardens)</label>
            <input style={a.input} placeholder="lekki_gardens" value={newEstate.id}
              onChange={e => setNewEstate(p => ({ ...p, id: e.target.value.toLowerCase().replace(/\s/g,"_") }))} />
            <label style={a.label}>Display Name</label>
            <input style={a.input} placeholder="Lekki Gardens" value={newEstate.name}
              onChange={e => setNewEstate(p => ({ ...p, name: e.target.value }))} />
            <label style={a.label}>Security Admin Code</label>
            <input style={a.input} placeholder="e.g. gate9999" value={newEstate.code}
              onChange={e => setNewEstate(p => ({ ...p, code: e.target.value }))} />
            <button style={a.btn} onClick={addEstate}>Add Estate</button>
          </div>

          <div style={a.card}>
            <div style={a.section}>All Estates ({estates.length})</div>
            {loading ? <div style={{ color:"#333", fontSize:13 }}>Loading...</div> :
              estates.length === 0 ? <div style={{ color:"#333", fontSize:13 }}>No estates yet.</div> :
              estates.map(e => <EstateRow key={e.id} estate={e} onRefresh={load} />)
            }
          </div>
        </div>
      )}

      {/* ── ACCESS TAB (Residents + Security) ── */}
      {view === "residents" && (
        <div>
          {/* Estate selector */}
          <div style={a.card}>
            <div style={a.section}>Select Estate</div>
            <select value={selEstate} onChange={e => setSelEstate(e.target.value)}
              style={{ ...a.input, marginBottom:0, color: selEstate ? "#fff" : "#555" }}>
              <option value="">Choose estate...</option>
              {estates.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          {selEstate && (
            <>
              {/* Sub-tab toggle: Residents | Security */}
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <button style={a.tab(accessSubTab === "residents")} onClick={() => setAccessSubTab("residents")}>
                  Residents ({residents.filter(r => r.unit_name !== "__security__").length})
                </button>
                <button style={a.tab(accessSubTab === "security")} onClick={() => setAccessSubTab("security")}>
                  Security Officers ({residents.filter(r => r.unit_name === "__security__").length})
                </button>
              </div>

              {/* ── RESIDENTS SUB-TAB ── */}
              {accessSubTab === "residents" && (
                <>
                  <div style={a.card}>
                    <div style={a.section}>Add Single Resident</div>
                    <label style={a.label}>Email Address</label>
                    <input style={a.input} type="email" placeholder="resident@email.com"
                      value={newRes.email} onChange={e => setNewRes(p => ({ ...p, email: e.target.value }))} />
                    <label style={a.label}>Unit Name</label>
                    <input style={a.input} placeholder="Block A, Flat 3"
                      value={newRes.unit} onChange={e => setNewRes(p => ({ ...p, unit: e.target.value }))} />
                    <button style={a.btn} onClick={addResident}>Add Resident</button>
                  </div>

                  <div style={a.card}>
                    <div style={a.section}>Bulk Add Residents</div>
                    <div style={{ fontSize:11, color:"#444", marginBottom:8 }}>
                      One per line: <span style={{ color:"#666" }}>email, unit name</span>
                    </div>
                    <textarea
                      value={bulkText}
                      onChange={e => setBulkText(e.target.value)}
                      placeholder={"john@gmail.com, Block A Flat 1\njane@gmail.com, Block B Flat 3"}
                      style={{ ...a.input, height:100, resize:"vertical", fontFamily:"monospace", fontSize:12 }}
                    />
                    {bulkMsg && <div style={{ ...a.msg, marginBottom:8 }}>{bulkMsg}</div>}
                    <button style={a.btn} onClick={handleBulkAdd}>Bulk Add</button>
                  </div>

                  <div style={a.card}>
                    <div style={a.section}>
                      Approved Residents — {estates.find(e => e.id === selEstate)?.name}
                    </div>
                    {residents.filter(r => r.unit_name !== "__security__").length === 0
                      ? <div style={{ color:"#333", fontSize:13 }}>No residents added yet.</div>
                      : residents.filter(r => r.unit_name !== "__security__").map(r => (
                          <div key={r.id} style={a.row}>
                            <div>
                              <div style={{ fontSize:13, color: r.used ? "#555" : "#e0e0e0" }}>{r.email}</div>
                              <div style={{ fontSize:11, color:"#444" }}>
                                {r.unit_name} &nbsp;&middot;&nbsp;
                                <span style={{ color: r.used ? "#6bff6b" : "#888" }}>{r.used ? "Signed up" : "Pending"}</span>
                              </div>
                            </div>
                            <div style={{ display:"flex", gap:6 }}>
                              {r.used && (
                                <button style={a.btnSm} onClick={async () => {
                                  await dbResetApprovedResident(r.email, selEstate);
                                  loadResidents(selEstate);
                                }}>Reset</button>
                              )}
                              <button style={a.btnRed} onClick={async () => {
                                await dbDeleteApprovedResident(r.id);
                                loadResidents(selEstate);
                              }}>Remove</button>
                            </div>
                          </div>
                        ))
                    }
                  </div>
                </>
              )}

              {/* ── SECURITY SUB-TAB ── */}
              {accessSubTab === "security" && (
                <>
                  <div style={a.card}>
                    <div style={a.section}>Add Security Officer</div>
                    <div style={{ fontSize:11, color:"#444", marginBottom:10, lineHeight:1.6 }}>
                      Add the email address of a gate security officer. They will be able to sign up using this email and the security admin code for this estate.
                    </div>
                    <label style={a.label}>Email Address</label>
                    <input style={a.input} type="email" placeholder="security@email.com"
                      value={newSec.email} onChange={e => setNewSec(p => ({ ...p, email: e.target.value }))} />
                    <button style={a.btn} onClick={addSecurity}>Approve Security Officer</button>
                  </div>

                  <div style={a.card}>
                    <div style={a.section}>
                      Approved Security Officers — {estates.find(e => e.id === selEstate)?.name}
                    </div>
                    {residents.filter(r => r.unit_name === "__security__").length === 0
                      ? <div style={{ color:"#333", fontSize:13 }}>No security officers added yet.</div>
                      : residents.filter(r => r.unit_name === "__security__").map(r => (
                          <div key={r.id} style={a.row}>
                            <div>
                              <div style={{ fontSize:13, color: r.used ? "#555" : "#e0e0e0" }}>{r.email}</div>
                              <div style={{ fontSize:11 }}>
                                <span style={{ color: r.used ? "#6bff6b" : "#c8860a" }}>
                                  {r.used ? "Signed up" : "Pending — awaiting registration"}
                                </span>
                              </div>
                            </div>
                            <div style={{ display:"flex", gap:6 }}>
                              {r.used && (
                                <button style={a.btnSm} onClick={async () => {
                                  await dbResetApprovedResident(r.email, selEstate);
                                  loadResidents(selEstate);
                                }}>Reset</button>
                              )}
                              <button style={a.btnRed} onClick={async () => {
                                await dbDeleteApprovedResident(r.id);
                                loadResidents(selEstate);
                              }}>Remove</button>
                            </div>
                          </div>
                        ))
                    }
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── USERS TAB ── */}
      {view === "users" && (
        <div>
          {/* Estate filter */}
          <div style={a.card}>
            <div style={a.section}>Filter by Estate</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button
                style={{ ...a.btnSm, background: userEstateFilter === "" ? "#fff" : "#1a1a1a", color: userEstateFilter === "" ? "#000" : "#555" }}
                onClick={() => setUserEstateFilter("")}
              >
                All ({users.length})
              </button>
              {estates.map(e => {
                const count = users.filter(u => u.estate_id === e.id).length;
                return (
                  <button
                    key={e.id}
                    style={{ ...a.btnSm, background: userEstateFilter === e.id ? "#fff" : "#1a1a1a", color: userEstateFilter === e.id ? "#000" : "#555" }}
                    onClick={() => setUserEstateFilter(e.id)}
                  >
                    {e.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* User list */}
          <div style={a.card}>
            {(() => {
              const filtered = userEstateFilter
                ? users.filter(u => u.estate_id === userEstateFilter)
                : users;
              const estName = estates.find(e => e.id === userEstateFilter)?.name;
              return (
                <>
                  <div style={a.section}>
                    {userEstateFilter ? estName + " Users" : "All Users"} ({filtered.length})
                  </div>
                  {loading ? (
                    <div style={{ color:"#333", fontSize:13 }}>Loading...</div>
                  ) : filtered.length === 0 ? (
                    <div style={{ color:"#333", fontSize:13 }}>No users in this estate yet.</div>
                  ) : (
                    filtered.map(u => (
                      <div key={u.id}>
                        <div style={a.row}>
                          <div>
                            <div style={{ fontSize:13, color:"#e0e0e0", fontWeight:600 }}>{u.name}</div>
                            <div style={{ fontSize:11, color:"#444", marginTop:2 }}>
                              {u.email}
                            </div>
                            <div style={{ fontSize:11, color:"#333", marginTop:1 }}>
                              {estates.find(e => e.id === u.estate_id)?.name || u.estate_id}
                              {u.unit_name ? " · " + u.unit_name : ""}
                              {" · "}
                              <span style={{ color: u.role === "security" ? "#c8860a" : "#666" }}>{u.role}</span>
                            </div>
                          </div>
                          <button
                            style={a.btnRed}
                            onClick={() => setConfirmDeleteUser(u.email)}
                          >
                            Delete
                          </button>
                        </div>

                        {/* Inline confirm delete */}
                        {confirmDeleteUser === u.email && (
                          <div style={{ background:"#1a0a0a", border:"1px solid #3d1515", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
                            <div style={{ fontSize:12, color:"#ff6b6b", marginBottom:8 }}>
                              Delete {u.name}? This removes them from the app. Their approved resident slot will be reset so they can re-register.
                            </div>
                            <div style={{ display:"flex", gap:8 }}>
                              <button
                                style={{ ...a.btnSm, flex:1 }}
                                onClick={() => setConfirmDeleteUser(null)}
                              >
                                Cancel
                              </button>
                              <button
                                style={{ ...a.btnRed, flex:1, padding:"6px 0", fontWeight:700 }}
                                onClick={async () => {
                                  await dbDeleteUser(u.email);
                                  setConfirmDeleteUser(null);
                                  const updated = await dbGetAllUsersAdmin();
                                  setUsers(updated);
                                  setMsg("User " + u.name + " deleted.");
                                }}
                              >
                                Yes, Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const ADMIN_PASSWORD = "rtglisunq58tghq59g8p8fhqb94wqb8p98qb3pfbdliweauksnc";

export default function UpsidianApp() {
  const [user, setUser]           = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [checking, setChecking]   = useState(true);
  const [adminMode, setAdminMode] = useState(false);
  const [logoTaps, setLogoTaps]   = useState(0);
  const logout      = () => setUser(null);
  const updateUser  = (updated) => setUser(updated);

  useEffect(() => {
    // Load estates from DB into the global ESTATES array on app start
    dbGetEstates().then(estates => { ESTATES.length = 0; ESTATES.push(...estates); });

    // Check URL hash for password recovery
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setShowReset(true);
      setChecking(false);
      return;
    }

    // Check URL for admin param — ?admin=true
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "true") {
      setAdminMode(true);
    }

    setChecking(false);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setShowReset(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Secret: tap the logo 7 times to open admin
  const handleLogoTap = () => {
    const next = logoTaps + 1;
    setLogoTaps(next);
    if (next >= 7) { setAdminMode(true); setLogoTaps(0); }
    setTimeout(() => setLogoTaps(0), 3000);
  };

  if (checking) return null;

  if (adminMode) {
    return <AdminPanel onExit={() => { setAdminMode(false); window.history.replaceState({}, "", window.location.pathname); }} />;
  }

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

  if (!user) return <AuthScreen onLogin={setUser} onLogoTap={handleLogoTap} />;
  if (user.role === "security")
    return <SecurityAppWithProfile user={user} onLogout={logout} onUserUpdate={updateUser} />;
  return <ResidentApp user={user} onLogout={logout} onUserUpdate={updateUser} />;
}