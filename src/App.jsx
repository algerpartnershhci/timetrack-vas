import { useState, useEffect } from "react";
import { LogIn, LogOut, Shield, Download, Edit2, Trash2, ArrowLeft, Eye, EyeOff, AlertCircle, User, CalendarDays, Timer, Pause, Play, Zap, AlertTriangle, UserPlus, Users, X, Loader2, Lock, Delete } from "lucide-react";
import { db } from "./firebase";
import { collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy } from "firebase/firestore";

// ╔════════════════════════════════════════════════════════════════════════
// ║ CONFIGURATION
// ╚════════════════════════════════════════════════════════════════════════
const ADMIN_PASSWORD = "timetracker";
const TZ             = "America/Los_Angeles";
const DAILY_LIMIT_MS = 8 * 60 * 60 * 1000;

// ╔════════════════════════════════════════════════════════════════════════
// ║ TIME HELPERS
// ╚════════════════════════════════════════════════════════════════════════
const fmtTime = (ts) => new Date(ts).toLocaleTimeString("en-GB", { hour12: false, timeZone: TZ });
const fmtDate = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ });
const todayLA = ()   => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const tzAbbr  = (ts) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "short" });
  return f.formatToParts(new Date(ts)).find(p => p.type === "timeZoneName")?.value || "PT";
};
function prettyDate(ymd) {
  const [y, mo, d] = ymd.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+mo - 1]} ${+d}, ${y}`;
}
function laToUTC(dateStr, timeStr) {
  let ts = new Date(`${dateStr}T${timeStr}-07:00`).getTime();
  if (fmtTime(ts) === timeStr && fmtDate(ts) === dateStr) return ts;
  return new Date(`${dateStr}T${timeStr}-08:00`).getTime();
}
function msToHMS(ms) {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function workedMs(session, atTs = Date.now()) {
  if (!session) return 0;
  let w = atTs - session.clockInTs - (session.totalPausedMs || 0);
  if (session.status === "paused" && session.pausedAt) w -= (atTs - session.pausedAt);
  return Math.max(0, w);
}
async function sGet(key) {
  try { const r = await window.storage?.get(key); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ STYLES
// ╚════════════════════════════════════════════════════════════════════════
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',sans-serif;background:#0f1117;color:#e8eaf0;min-height:100vh}
  :root{--navy:#0f1117;--card:#1e2333;--border:#2a2f45;--accent:#4f8ef7;--green:#3ecf8e;--red:#f76b6b;--amber:#f5a623;--purple:#a78bfa;--muted:#7a82a0;--text:#e8eaf0}
  ::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:var(--navy)}::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
  @keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
`;

// ╔════════════════════════════════════════════════════════════════════════
// ║ SHARED COMPONENTS
// ╚════════════════════════════════════════════════════════════════════════
function Toast({ msg, type }) {
  const bg = type === "error" ? "var(--red)" : type === "warn" ? "var(--amber)" : type === "ot" ? "var(--purple)" : "var(--green)";
  return (
    <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:bg, color:"#fff", padding:"12px 24px", borderRadius:10, fontWeight:600, fontSize:14, boxShadow:"0 8px 32px rgba(0,0,0,.4)", zIndex:9999, animation:"fadeUp .25s ease", maxWidth:"90vw" }}>
      {msg}
    </div>
  );
}
function LoadingScreen({ msg = "Connecting…" }) {
  return (
    <div style={{ minHeight:"100vh", background:"var(--navy)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      <Loader2 size={36} color="var(--accent)" style={{ animation:"spin 1s linear infinite" }} />
      <p style={{ color:"var(--muted)", fontSize:14 }}>{msg}</p>
    </div>
  );
}
function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return (
    <div style={{ textAlign:"center", padding:"28px 0 16px" }}>
      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:38, fontWeight:500, color:"var(--accent)", letterSpacing:2 }}>
        {t.toLocaleTimeString("en-GB", { hour12: false, timeZone: TZ })}
        <span style={{ fontSize:14, marginLeft:10, color:"var(--muted)", verticalAlign:"middle", fontWeight:600, letterSpacing:1 }}>{tzAbbr(Date.now())}</span>
      </div>
      <div style={{ color:"var(--muted)", fontSize:13, marginTop:6 }}>{t.toLocaleDateString("en-US", { timeZone: TZ, weekday:"long", year:"numeric", month:"long", day:"numeric" })}</div>
    </div>
  );
}
function LiveDuration({ session }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  return <span>{msToHMS(workedMs(session, now))}</span>;
}
function Btn({ onClick, children, variant="primary", disabled, fullWidth, size="md" }) {
  const base = { border:"none", cursor: disabled ? "not-allowed" : "pointer", borderRadius:10, fontFamily:"'DM Sans', sans-serif", fontWeight:600, transition:"all .18s", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, width: fullWidth ? "100%" : "auto", opacity: disabled ? .45 : 1 };
  const sz = size === "sm" ? { padding:"7px 14px", fontSize:13 } : { padding:"13px 24px", fontSize:15 };
  const vars = {
    primary:{ background:"var(--accent)", color:"#fff" },
    green:  { background:"var(--green)",  color:"#0f1117" },
    red:    { background:"var(--red)",    color:"#fff" },
    amber:  { background:"var(--amber)",  color:"#0f1117" },
    purple: { background:"var(--purple)", color:"#0f1117" },
    ghost:  { background:"var(--border)", color:"var(--text)" },
    outline:{ background:"transparent",   color:"var(--accent)", border:"1.5px solid var(--accent)" },
  };
  return <button style={{ ...base, ...sz, ...vars[variant] }} onClick={disabled ? undefined : onClick}>{children}</button>;
}
function Input({ label, ...props }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:11, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.7 }}>{label}</label>}
      <input {...props} style={{ background:"var(--navy)", border:"1.5px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"10px 14px", fontSize:14, fontFamily:"'DM Mono', monospace", outline:"none", width:"100%", ...props.style }} />
    </div>
  );
}
function ProgressBar({ workedMs }) {
  const pct = Math.min(100, (workedMs / DAILY_LIMIT_MS) * 100);
  const color = pct >= 100 ? "var(--red)" : pct > 87.5 ? "var(--amber)" : "var(--green)";
  return (
    <div style={{ marginTop:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--muted)", fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:.7 }}>
        <span>Daily Progress</span><span>{msToHMS(workedMs)} / 08:00:00</span>
      </div>
      <div style={{ background:"var(--navy)", borderRadius:6, height:8, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, transition:"width .5s ease, background-color .3s" }} />
      </div>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ PIN ENTRY — numeric pad, 4-digit verification
// ╚════════════════════════════════════════════════════════════════════════
function PinEntry({ employee, onSuccess, onBack }) {
  const [pin, setPin]       = useState("");
  const [shake, setShake]   = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const handleDigit = (d) => {
    if (shake) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      if (next === employee.pin) {
        onSuccess();
      } else {
        setShake(true);
        setErrMsg("Incorrect PIN. Try again.");
        setTimeout(() => { setPin(""); setShake(false); setErrMsg(""); }, 1000);
      }
    }
  };

  const handleDel = () => { if (!shake) setPin(p => p.slice(0, -1)); };

  const numpad = [1,2,3,4,5,6,7,8,9,null,0,"del"];

  return (
    <div style={{ maxWidth:360, margin:"0 auto", padding:20 }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:14, marginBottom:20, fontFamily:"'DM Sans'" }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:16, padding:28, textAlign:"center" }}>
        <div style={{ background:"rgba(79,142,247,.15)", borderRadius:14, padding:14, display:"inline-flex", marginBottom:16 }}>
          <Lock size={24} color="var(--accent)" />
        </div>
        <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Enter Your PIN</h2>
        <p style={{ color:"var(--muted)", fontSize:13, marginBottom:24 }}>{employee.name}</p>

        {/* PIN dots */}
        <div style={{ display:"flex", gap:16, justifyContent:"center", marginBottom:16, animation: shake ? "shake .4s ease" : "none" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:18, height:18, borderRadius:"50%",
              background: i < pin.length ? "var(--accent)" : "transparent",
              border: `2px solid ${i < pin.length ? "var(--accent)" : "var(--border)"}`,
              transition:"all .15s"
            }} />
          ))}
        </div>

        {errMsg && <p style={{ color:"var(--red)", fontSize:13, marginBottom:12, fontWeight:600 }}>{errMsg}</p>}

        {/* Numpad */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, maxWidth:240, margin:"0 auto" }}>
          {numpad.map((d, i) => {
            if (d === null) return <div key={i} />;
            const isDel = d === "del";
            return (
              <button key={i} onClick={() => isDel ? handleDel() : handleDigit(String(d))}
                style={{
                  background: isDel ? "var(--border)" : "var(--navy)",
                  border: "1.5px solid var(--border)",
                  borderRadius:12, padding:"16px 0",
                  color:"var(--text)", fontSize: isDel ? 14 : 22,
                  fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans'",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"background .15s",
                }}>
                {isDel ? <Delete size={18} /> : d}
              </button>
            );
          })}
        </div>

        <p style={{ color:"var(--muted)", fontSize:11, marginTop:20 }}>
          Enter the 4-digit PIN assigned to you
        </p>
      </div>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ HOME SCREEN
// ╚════════════════════════════════════════════════════════════════════════
function HomeScreen({ onEmployee, onAdmin }) {
  return (
    <div style={{ minHeight:"100vh", background:"var(--navy)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ marginBottom:12, background:"var(--accent)", borderRadius:16, padding:14, display:"inline-flex" }}><Timer size={28} color="#fff" /></div>
      <h1 style={{ fontSize:28, fontWeight:700, marginBottom:6 }}>TimeTrack</h1>
      <p style={{ color:"var(--muted)", marginBottom:36, fontSize:14, textAlign:"center" }}>Employee Time Management • {tzAbbr(Date.now())} Timezone</p>
      <div style={{ display:"flex", flexDirection:"column", gap:14, width:"100%", maxWidth:340 }}>
        <button onClick={onEmployee} style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:14, color:"var(--text)", padding:"20px 24px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans'" }} onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}><User size={20} color="var(--accent)" /><span style={{ fontWeight:700, fontSize:16 }}>I'm an Employee</span></div>
          <div style={{ color:"var(--muted)", fontSize:13 }}>Clock in, take breaks, clock out</div>
        </button>
        <button onClick={onAdmin} style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:14, color:"var(--text)", padding:"20px 24px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans'" }} onMouseEnter={e=>e.currentTarget.style.borderColor="var(--green)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}><Shield size={20} color="var(--green)" /><span style={{ fontWeight:700, fontSize:16 }}>Admin Panel</span></div>
          <div style={{ color:"var(--muted)", fontSize:13 }}>Manage employees, reports, OT, export PDF</div>
        </button>
      </div>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ EMPLOYEE SCREEN — with PIN gate
// ╚════════════════════════════════════════════════════════════════════════
function EmployeeScreen({ employees, activeSessions, onClockIn, onStartOT, onPause, onResume, onClockOut, onBack }) {
  const [selected,     setSelected]     = useState("");
  const [pinVerified,  setPinVerified]  = useState(false);
  const [todayEntries, setTodayEntries] = useState([]);
  const [tick,         setTick]         = useState(0);
  const [empView,      setEmpView]      = useState("today"); // "today" | "records"

  useEffect(() => { const i = setInterval(() => setTick(x => x+1), 1000); return () => clearInterval(i); }, []);

  // Reset PIN when selecting a different employee
  const handleSelect = (name) => { setSelected(name); setPinVerified(false); };

  // Subscribe to selected employee's today entries
  useEffect(() => {
    if (!selected || !pinVerified) { setTodayEntries([]); return; }
    const q = query(collection(db, "entries"), where("employee", "==", selected), where("date", "==", todayLA()));
    return onSnapshot(q, snap => setTodayEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [selected, pinVerified]);

  // Auto-pause regular sessions at 8h
  useEffect(() => {
    if (!selected || !pinVerified) return;
    const s = activeSessions[selected];
    if (!s) return;
    if (s.type === "regular" && s.status === "working" && workedMs(s) >= DAILY_LIMIT_MS) onPause(selected);
  }, [tick, selected, pinVerified, activeSessions]);

  const selectedEmp  = employees.find(e => e.name === selected);
  const session      = selected ? activeSessions[selected] : null;
  const todayRegular = todayEntries.find(e => e.type === "regular");
  const todayOTs     = todayEntries.filter(e => e.type === "overtime");
  const otAuthorized = !!todayRegular?.otAuthorized;

  // ── Show PIN entry if name selected but not verified ──
  if (selected && !pinVerified) {
    if (!selectedEmp?.pin) {
      return (
        <div style={{ minHeight:"100vh", background:"var(--navy)", padding:20, maxWidth:480, margin:"0 auto" }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:14, marginBottom:20, fontFamily:"'DM Sans'" }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ background:"var(--card)", border:"1.5px solid var(--amber)", borderRadius:14, padding:24, textAlign:"center", marginTop:40 }}>
            <AlertTriangle size={32} color="var(--amber)" style={{ marginBottom:12 }} />
            <h3 style={{ fontWeight:700, marginBottom:8 }}>No PIN Set</h3>
            <p style={{ color:"var(--muted)", fontSize:13, marginBottom:16 }}>Your account doesn't have a PIN yet. Please ask your admin to set one for you.</p>
            <Btn variant="ghost" onClick={() => setSelected("")}>← Go Back</Btn>
          </div>
        </div>
      );
    }
    return (
      <div style={{ minHeight:"100vh", background:"var(--navy)" }}>
        <PinEntry employee={selectedEmp} onSuccess={() => setPinVerified(true)} onBack={() => setSelected("")} />
      </div>
    );
  }

  // ── Name selector screen ──
  return (
    <div style={{ minHeight:"100vh", background:"var(--navy)", padding:20, maxWidth:480, margin:"0 auto" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:14, marginBottom:12, fontFamily:"'DM Sans'" }}>
        <ArrowLeft size={16} /> Back
      </button>

      {!selected && (
        <>
          <LiveClock />
          <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:14, padding:20 }}>
            <label style={{ fontSize:11, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.8, display:"block", marginBottom:12 }}>Select Your Name</label>
            {employees.length === 0 ? (
              <p style={{ color:"var(--muted)", fontSize:13, textAlign:"center", padding:"20px 0" }}>No employees added yet. Ask your admin to add you.</p>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {employees.map(emp => {
                  const s = activeSessions[emp.name];
                  let badge = "IDLE", bg = "var(--border)", fg = "var(--muted)";
                  if (s?.type === "overtime" && s?.status === "working") { badge = "⚡ ON OT"; bg = "rgba(167,139,250,.18)"; fg = "var(--purple)"; }
                  else if (s?.type === "overtime" && s?.status === "paused") { badge = "⚡ OT BREAK"; bg = "rgba(167,139,250,.18)"; fg = "var(--purple)"; }
                  else if (s?.type === "regular" && s?.status === "working") { badge = "● WORKING"; bg = "rgba(62,207,142,.18)"; fg = "var(--green)"; }
                  else if (s?.type === "regular" && s?.status === "paused") { badge = "❙❙ ON BREAK"; bg = "rgba(245,166,35,.18)"; fg = "var(--amber)"; }
                  return (
                    <button key={emp.id} onClick={() => handleSelect(emp.name)} style={{ background:"var(--navy)", border:"1.5px solid var(--border)", borderRadius:10, padding:"12px 16px", cursor:"pointer", textAlign:"left", color:"var(--text)", fontFamily:"'DM Sans'", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontWeight:600, fontSize:14 }}>{emp.name}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:20, background:bg, color:fg }}>{badge}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {selected && pinVerified && (
        <>
          <LiveClock />

          {/* Tab bar */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {[["today","Today's Shift"],["records","My Records"]].map(([v,label]) => (
              <button key={v} onClick={() => setEmpView(v)} style={{ flex:1, background: empView===v ? "var(--accent)" : "var(--card)", border: empView===v ? "1.5px solid var(--accent)" : "1.5px solid var(--border)", borderRadius:10, padding:"10px 0", color: empView===v ? "#fff" : "var(--muted)", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"'DM Sans'", transition:"all .18s" }}>{label}</button>
            ))}
          </div>

          {/* MY RECORDS VIEW */}
          {empView === "records" && <MyRecords employeeName={selected} onSwitch={() => { setSelected(""); setPinVerified(false); }} />}

          {/* TODAY VIEW */}
          {empView === "today" && (
          <div style={{ background:"var(--card)", border: session?.type === "overtime" ? "1.5px solid var(--purple)" : "1.5px solid var(--border)", borderRadius:14, padding:20 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>{selected}</div>
              <button onClick={() => { setSelected(""); setPinVerified(false); }} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:12, fontFamily:"'DM Sans'" }}>← Switch</button>
            </div>

            {session?.type === "regular" && <RegularSessionView session={session} onPause={() => onPause(selected)} onResume={() => onResume(selected)} onClockOut={() => onClockOut(selected)} />}
            {session?.type === "overtime" && <OvertimeSessionView session={session} onPause={() => onPause(selected)} onResume={() => onResume(selected)} onClockOut={() => onClockOut(selected)} />}

            {!session && !todayRegular && (
              <>
                <p style={{ color:"var(--muted)", fontSize:13, marginTop:14, marginBottom:14 }}>Ready to start your shift?</p>
                <Btn variant="green" fullWidth onClick={() => onClockIn(selected)}><LogIn size={18} /> Clock In</Btn>
              </>
            )}

            {!session && todayRegular && (
              <>
                <div style={{ background:"rgba(62,207,142,.08)", border:"1px solid rgba(62,207,142,.25)", borderRadius:10, padding:16, marginTop:14 }}>
                  <div style={{ color:"var(--green)", fontWeight:700, fontSize:13, marginBottom:10 }}>✓ Regular shift complete</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                    {[["Clock In", fmtTime(todayRegular.clockIn)], ["Clock Out", fmtTime(todayRegular.clockOut)], ["Total", todayRegular.duration]].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:.6, marginBottom:4 }}>{l}</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, fontWeight:500 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {todayRegular.breakMs > 0 && <div style={{ marginTop:10, fontSize:12, color:"var(--muted)" }}>Break: <span style={{ color:"var(--amber)", fontFamily:"'DM Mono'" }}>{msToHMS(todayRegular.breakMs)}</span></div>}
                </div>
                {todayOTs.length > 0 && (
                  <div style={{ background:"rgba(167,139,250,.08)", border:"1px solid rgba(167,139,250,.3)", borderRadius:10, padding:16, marginTop:12 }}>
                    <div style={{ color:"var(--purple)", fontWeight:700, fontSize:13, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}><Zap size={14} /> Overtime today ({todayOTs.length})</div>
                    {todayOTs.map(ot => (
                      <div key={ot.id} style={{ background:"rgba(167,139,250,.05)", borderRadius:6, padding:"8px 12px", marginBottom:6, fontSize:12, fontFamily:"'DM Mono'", display:"flex", justifyContent:"space-between" }}>
                        <span>{fmtTime(ot.clockIn)} – {fmtTime(ot.clockOut)}</span>
                        <span style={{ color:"var(--purple)", fontWeight:600 }}>{ot.duration}</span>
                      </div>
                    ))}
                  </div>
                )}
                {otAuthorized && (
                  <div style={{ marginTop:14 }}>
                    <Btn variant="purple" fullWidth onClick={() => onStartOT(selected)}><Zap size={18} /> Start Overtime</Btn>
                    <p style={{ color:"var(--muted)", fontSize:12, textAlign:"center", marginTop:10 }}>Overtime authorized by admin</p>
                  </div>
                )}
                {!otAuthorized && todayOTs.length === 0 && (
                  <p style={{ color:"var(--muted)", fontSize:13, textAlign:"center", marginTop:14 }}>See you tomorrow! 👋</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ MY RECORDS — employee's own time history with date filter + PDF export
// ╚════════════════════════════════════════════════════════════════════════
function MyRecords({ employeeName, onSwitch }) {
  const [filterStart, setFilterStart] = useState(() => new Date(Date.now()-30*24*60*60*1000).toLocaleDateString("en-CA",{timeZone:TZ}));
  const [filterEnd,   setFilterEnd]   = useState("");
  const [allEntries,  setAllEntries]  = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    const constraints = [where("employee","==",employeeName)];
    if (filterStart) constraints.push(where("date",">=",filterStart));
    if (filterEnd)   constraints.push(where("date","<=",filterEnd));
    const q = query(collection(db,"entries"), ...constraints);
    return onSnapshot(q, snap => {
      setAllEntries(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.clockIn-a.clockIn));
      setLoading(false);
    }, () => setLoading(false));
  }, [employeeName, filterStart, filterEnd]);

  const regular = allEntries.filter(e => e.type === "regular");
  const ot      = allEntries.filter(e => e.type === "overtime");
  const sumMs   = (list) => list.reduce((acc,e) => acc+(e.clockOut-e.clockIn-(e.breakMs||0)),0);
  const fmtTot  = (ms) => `${Math.floor(ms/3_600_000)}h ${Math.floor((ms%3_600_000)/60_000)}m`;

  const handleExport = () => {
    const periodLabel = filterStart && filterEnd ? `${prettyDate(filterStart)} – ${prettyDate(filterEnd)}` : filterStart ? `From ${prettyDate(filterStart)}` : "All Dates";
    const regRows = regular.map(e=>`<tr><td>${prettyDate(e.date)}</td><td>${fmtTime(e.clockIn)}</td><td>${fmtTime(e.clockOut)}</td><td>${msToHMS(e.breakMs||0)}</td><td style="font-weight:600">${e.duration}</td></tr>`).join("");
    const otRows  = ot.map(e=>`<tr><td>${prettyDate(e.date)}</td><td>${fmtTime(e.clockIn)}</td><td>${fmtTime(e.clockOut)}</td><td>${msToHMS(e.breakMs||0)}</td><td style="font-weight:600;color:#7c3aed">${e.duration}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><title>My Time Records</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;color:#111}h1{font-size:22px;font-weight:700;margin-bottom:4px}h2{font-size:16px;font-weight:700;margin-top:28px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #0f1117}h2.ot{color:#7c3aed;border-bottom-color:#7c3aed}.meta{color:#555;font-size:13px;margin-bottom:6px}.badge{display:inline-block;background:#0f1117;color:#fff;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}th{background:#0f1117;color:#fff;padding:10px 12px;text-align:left}th.ot{background:#7c3aed}td{padding:9px 12px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#f8f8f8}.summary{margin-top:8px;font-size:13px;color:#444;display:flex;gap:24px}.summary span{font-weight:700;color:#0f1117}.footer{margin-top:24px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:20px}}</style></head><body>
<h1>My Time Records</h1>
<div class="meta">Employee: <strong>${employeeName}</strong> &nbsp;|&nbsp; Period: <strong>${periodLabel}</strong> &nbsp;|&nbsp; Timezone: <strong>${tzAbbr(Date.now())} (Los Angeles)</strong></div>
<div class="badge">Generated: ${new Date().toLocaleString("en-US",{timeZone:TZ})}</div>
<h2>Regular Shifts</h2>${regular.length>0?`<table><thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Break</th><th>Total</th></tr></thead><tbody>${regRows}</tbody></table><div class="summary"><div>Entries: <span>${regular.length}</span></div><div>Total Hours: <span>${fmtTot(sumMs(regular))}</span></div></div>`:'<p style="color:#999;font-style:italic;padding:12px 0">No regular shifts in this period.</p>'}
<h2 class="ot">⚡ Overtime</h2>${ot.length>0?`<table><thead><tr><th class="ot">Date</th><th class="ot">Clock In</th><th class="ot">Clock Out</th><th class="ot">Break</th><th class="ot">Total</th></tr></thead><tbody>${otRows}</tbody></table><div class="summary"><div>OT Entries: <span>${ot.length}</span></div><div>OT Hours: <span style="color:#7c3aed">${fmtTot(sumMs(ot))}</span></div></div>`:'<p style="color:#999;font-style:italic;padding:12px 0">No overtime in this period.</p>'}
<div class="footer">All times in PST/PDT (Los Angeles, California) • Combined total: ${fmtTot(sumMs(regular)+sumMs(ot))}</div>
</body></html>`;
    const w = window.open("","_blank"); if(!w){alert("Please allow popups");return;} w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
  };

  return (
    <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:14, padding:20 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:16 }}>{employeeName}</div>
        <button onClick={onSwitch} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:12, fontFamily:"'DM Sans'" }}>← Switch</button>
      </div>

      {/* Date filter */}
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <label style={{ fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:.7, display:"block", marginBottom:4 }}>From</label>
          <input type="date" value={filterStart} onChange={e=>setFilterStart(e.target.value)} style={{ width:"100%", background:"var(--navy)", border:"1.5px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"8px 10px", fontSize:13, fontFamily:"'DM Mono'", outline:"none" }} />
        </div>
        <div style={{ flex:1 }}>
          <label style={{ fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:.7, display:"block", marginBottom:4 }}>To</label>
          <input type="date" value={filterEnd} onChange={e=>setFilterEnd(e.target.value)} style={{ width:"100%", background:"var(--navy)", border:"1.5px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"8px 10px", fontSize:13, fontFamily:"'DM Mono'", outline:"none" }} />
        </div>
        <div style={{ display:"flex", alignItems:"flex-end" }}>
          <button onClick={handleExport} style={{ background:"var(--accent)", border:"none", borderRadius:8, color:"#fff", padding:"8px 14px", cursor:"pointer", fontWeight:600, fontSize:13, fontFamily:"'DM Sans'", display:"flex", alignItems:"center", gap:6 }}>
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:"32px 0" }}>
          <Loader2 size={22} color="var(--accent)" style={{ animation:"spin 1s linear infinite" }} />
        </div>
      ) : allEntries.length === 0 ? (
        <div style={{ textAlign:"center", padding:"32px 0", color:"var(--muted)" }}>
          <CalendarDays size={28} style={{ marginBottom:10, opacity:.4 }} />
          <p style={{ fontSize:13 }}>No entries found for this period.</p>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:14 }}>
            {[["Regular",regular.length,"var(--accent)"],["Reg Hours",fmtTot(sumMs(regular)),"var(--green)"],["OT",ot.length,"var(--purple)"],["OT Hours",fmtTot(sumMs(ot)),"var(--purple)"]].map(([l,v,c])=>(
              <div key={l} style={{ background:"var(--navy)", borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:.6, marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:18, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Regular entries */}
          {regular.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.8, marginBottom:8 }}>Regular Shifts</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {regular.map(e => (
                  <div key={e.id} style={{ background:"var(--navy)", borderRadius:8, padding:"10px 14px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, fontSize:12 }}>
                    <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:2 }}>DATE</div><div style={{ fontWeight:600 }}>{prettyDate(e.date)}</div></div>
                    <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:2 }}>IN</div><div style={{ fontFamily:"'DM Mono'", color:"var(--green)" }}>{fmtTime(e.clockIn)}</div></div>
                    <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:2 }}>OUT</div><div style={{ fontFamily:"'DM Mono'", color:"var(--red)" }}>{fmtTime(e.clockOut)}</div></div>
                    <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:2 }}>TOTAL</div><div style={{ fontFamily:"'DM Mono'", color:"var(--accent)", fontWeight:600 }}>{e.duration}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OT entries */}
          {ot.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--purple)", textTransform:"uppercase", letterSpacing:.8, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}><Zap size={12} /> Overtime</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {ot.map(e => (
                  <div key={e.id} style={{ background:"rgba(167,139,250,.08)", border:"1px solid rgba(167,139,250,.2)", borderRadius:8, padding:"10px 14px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, fontSize:12 }}>
                    <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:2 }}>DATE</div><div style={{ fontWeight:600 }}>{prettyDate(e.date)}</div></div>
                    <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:2 }}>IN</div><div style={{ fontFamily:"'DM Mono'", color:"var(--green)" }}>{fmtTime(e.clockIn)}</div></div>
                    <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:2 }}>OUT</div><div style={{ fontFamily:"'DM Mono'", color:"var(--red)" }}>{fmtTime(e.clockOut)}</div></div>
                    <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:2 }}>TOTAL</div><div style={{ fontFamily:"'DM Mono'", color:"var(--purple)", fontWeight:600 }}>{e.duration}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RegularSessionView({ session, onPause, onResume, onClockOut }) {
  const [, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT(x => x+1), 1000); return () => clearInterval(i); }, []);
  const w = workedMs(session);
  const atLimit = w >= DAILY_LIMIT_MS;
  return (
    <>
      {atLimit && (
        <div style={{ background:"rgba(247,107,107,.1)", border:"1px solid rgba(247,107,107,.4)", borderRadius:10, padding:14, marginTop:14, display:"flex", gap:12, alignItems:"flex-start" }}>
          <AlertTriangle size={18} color="var(--red)" style={{ flexShrink:0, marginTop:2 }} />
          <div>
            <div style={{ color:"var(--red)", fontWeight:700, fontSize:13, marginBottom:4 }}>8-hour daily limit reached</div>
            <div style={{ color:"var(--muted)", fontSize:12, lineHeight:1.5 }}>Please clock out. Ask admin to authorize OT if needed.</div>
          </div>
        </div>
      )}
      <div style={{ background:"var(--navy)", borderRadius:10, padding:18, marginTop:14, textAlign:"center" }}>
        <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:.7, marginBottom:6 }}>{session.status === "working" ? "Time Worked" : "On Break"}</div>
        <div style={{ fontSize:34, fontWeight:700, fontFamily:"'DM Mono', monospace", color: atLimit ? "var(--red)" : session.status === "paused" ? "var(--amber)" : "var(--green)" }}>
          <LiveDuration session={session} />
        </div>
        <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>
          Clocked in at {fmtTime(session.clockInTs)} {tzAbbr(session.clockInTs)}
          {(session.totalPausedMs > 0 || (session.status === "paused" && session.pausedAt)) && <> • Break: {msToHMS((session.totalPausedMs||0) + (session.status==="paused"&&session.pausedAt ? Date.now()-session.pausedAt : 0))}</>}
        </div>
        <ProgressBar workedMs={w} />
      </div>
      <div style={{ display:"flex", gap:8, marginTop:14 }}>
        {session.status === "working" && !atLimit && <Btn variant="amber" fullWidth onClick={onPause}><Pause size={18} /> Take Break</Btn>}
        {session.status === "paused" && !atLimit && <Btn variant="green" fullWidth onClick={onResume}><Play size={18} /> Resume</Btn>}
        <Btn variant="red" fullWidth onClick={onClockOut}><LogOut size={18} /> Clock Out</Btn>
      </div>
    </>
  );
}

function OvertimeSessionView({ session, onPause, onResume, onClockOut }) {
  return (
    <>
      <div style={{ background:"rgba(167,139,250,.1)", border:"1px solid rgba(167,139,250,.4)", borderRadius:10, padding:12, marginTop:14, display:"flex", gap:10, alignItems:"center" }}>
        <Zap size={16} color="var(--purple)" /><span style={{ color:"var(--purple)", fontWeight:700, fontSize:13 }}>OVERTIME IN PROGRESS</span>
      </div>
      <div style={{ background:"var(--navy)", borderRadius:10, padding:18, marginTop:14, textAlign:"center" }}>
        <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:.7, marginBottom:6 }}>{session.status === "working" ? "Overtime Worked" : "On Break"}</div>
        <div style={{ fontSize:34, fontWeight:700, fontFamily:"'DM Mono', monospace", color: session.status === "paused" ? "var(--amber)" : "var(--purple)" }}>
          <LiveDuration session={session} />
        </div>
        <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>
          OT started at {fmtTime(session.clockInTs)} {tzAbbr(session.clockInTs)}
          {(session.totalPausedMs > 0 || (session.status === "paused" && session.pausedAt)) && <> • Break: {msToHMS((session.totalPausedMs||0) + (session.status==="paused"&&session.pausedAt ? Date.now()-session.pausedAt : 0))}</>}
        </div>
      </div>
      <div style={{ display:"flex", gap:8, marginTop:14 }}>
        {session.status === "working" && <Btn variant="amber" fullWidth onClick={onPause}><Pause size={18} /> Take Break</Btn>}
        {session.status === "paused" && <Btn variant="purple" fullWidth onClick={onResume}><Play size={18} /> Resume</Btn>}
        <Btn variant="red" fullWidth onClick={onClockOut}><LogOut size={18} /> Clock Out</Btn>
      </div>
    </>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ ADMIN LOGIN
// ╚════════════════════════════════════════════════════════════════════════
function AdminLogin({ onAuth, onBack }) {
  const [pw, setPw] = useState(""); const [show, setShow] = useState(false); const [err, setErr] = useState(false);
  const attempt = () => { if (pw.trim() === ADMIN_PASSWORD) onAuth(); else { setErr(true); setTimeout(() => setErr(false), 2200); } };
  return (
    <div style={{ minHeight:"100vh", background:"var(--navy)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <button onClick={onBack} style={{ position:"absolute", top:20, left:20, background:"none", border:"none", color:"var(--muted)", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:14, fontFamily:"'DM Sans'" }}><ArrowLeft size={16} /> Back</button>
      <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:16, padding:32, width:"100%", maxWidth:360 }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ background:"rgba(62,207,142,.15)", borderRadius:14, padding:14, display:"inline-flex", marginBottom:12 }}><Shield size={24} color="var(--green)" /></div>
          <h2 style={{ fontSize:20, fontWeight:700 }}>Admin Access</h2>
          <p style={{ color:"var(--muted)", fontSize:13, marginTop:4 }}>Enter your password to continue</p>
        </div>
        <div style={{ position:"relative", marginBottom:14 }}>
          <input type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && attempt()} placeholder="Password" autoFocus
            style={{ width:"100%", background:"var(--navy)", border:`1.5px solid ${err ? "var(--red)" : "var(--border)"}`, borderRadius:8, color:"var(--text)", padding:"12px 44px 12px 14px", fontSize:15, fontFamily:"'DM Sans'", outline:"none" }} />
          <button onClick={() => setShow(!show)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"var(--muted)", cursor:"pointer" }}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {err && <p style={{ color:"var(--red)", fontSize:13, marginBottom:12, textAlign:"center" }}>Incorrect password.</p>}
        <Btn variant="green" fullWidth onClick={attempt}><Shield size={16} /> Enter Admin Panel</Btn>
      </div>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ EDIT MODAL
// ╚════════════════════════════════════════════════════════════════════════
function EditModal({ entry, onSave, onClose }) {
  const [dateStr, setDateStr] = useState(entry.date);
  const [clockInStr, setClockInStr] = useState(fmtTime(entry.clockIn));
  const [clockOutStr, setClockOutStr] = useState(fmtTime(entry.clockOut));
  const save = () => {
    const inTs = laToUTC(dateStr, clockInStr); const outTs = laToUTC(dateStr, clockOutStr);
    if (isNaN(inTs) || isNaN(outTs)) return alert("Invalid time values");
    if (outTs <= inTs) return alert("Clock Out must be after Clock In");
    let w = outTs - inTs - (entry.breakMs || 0);
    if (entry.type === "regular" && w > DAILY_LIMIT_MS) w = DAILY_LIMIT_MS;
    onSave({ ...entry, date: dateStr, clockIn: inTs, clockOut: outTs, duration: msToHMS(w) });
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
      <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:16, padding:28, width:"100%", maxWidth:400 }}>
        <h3 style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>Edit {entry.type === "overtime" ? "Overtime" : "Time"} Entry {entry.type === "overtime" && <Zap size={16} color="var(--purple)" style={{ verticalAlign:"middle" }} />}</h3>
        <p style={{ color:"var(--muted)", fontSize:13, marginBottom:20 }}>{entry.employee} • Times in {tzAbbr(entry.clockIn)}</p>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Input label="Date" type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} />
          <Input label="Clock In" type="time" step="1" value={clockInStr} onChange={e => setClockInStr(e.target.value)} />
          <Input label="Clock Out" type="time" step="1" value={clockOutStr} onChange={e => setClockOutStr(e.target.value)} />
        </div>
        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <Btn variant="ghost" onClick={onClose} fullWidth>Cancel</Btn>
          <Btn variant="primary" onClick={save} fullWidth>Save Changes</Btn>
        </div>
      </div>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ EMPLOYEE MANAGEMENT — with PIN setup
// ╚════════════════════════════════════════════════════════════════════════
function EmployeeManagement({ employees, onAdd, onRemove, onSetPin }) {
  const [newName,    setNewName]    = useState("");
  const [newPin,     setNewPin]     = useState("");
  const [removeId,   setRemoveId]   = useState(null);
  const [editPinId,  setEditPinId]  = useState(null);
  const [pinInput,   setPinInput]   = useState("");
  const [pinError,   setPinError]   = useState("");

  const validatePin = (p) => /^\d{4}$/.test(p);

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (!validatePin(newPin)) { setPinError("PIN must be exactly 4 digits"); return; }
    if (employees.some(e => e.name.toLowerCase() === name.toLowerCase())) { setPinError("Employee with this name already exists"); return; }
    onAdd(name, newPin);
    setNewName(""); setNewPin(""); setPinError("");
  };

  const savePin = (id) => {
    if (!validatePin(pinInput)) { setPinError("PIN must be exactly 4 digits"); return; }
    onSetPin(id, pinInput);
    setEditPinId(null); setPinInput(""); setPinError("");
  };

  return (
    <>
      {removeId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
          <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:16, padding:28, width:"100%", maxWidth:360, textAlign:"center" }}>
            <AlertCircle size={32} color="var(--amber)" style={{ marginBottom:12 }} />
            <h3 style={{ fontWeight:700, marginBottom:8 }}>Remove Employee?</h3>
            <p style={{ color:"var(--muted)", fontSize:13, marginBottom:8 }}>{employees.find(e=>e.id===removeId)?.name} will be removed from the active list.</p>
            <p style={{ color:"var(--muted)", fontSize:12, marginBottom:20 }}>Their existing time entries will <strong style={{color:"var(--text)"}}>remain</strong> in the records.</p>
            <div style={{ display:"flex", gap:10 }}>
              <Btn variant="ghost" fullWidth onClick={() => setRemoveId(null)}>Cancel</Btn>
              <Btn variant="red" fullWidth onClick={() => { onRemove(removeId); setRemoveId(null); }}>Remove</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:12, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.8, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}><Users size={14} /> Manage Employees ({employees.length})</div>

        {/* Add employee form */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", gap:8, marginBottom:6 }}>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key==="Enter" && add()} placeholder="Full name"
              style={{ flex:3, background:"var(--navy)", border:"1.5px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"10px 14px", fontSize:14, fontFamily:"'DM Sans'", outline:"none" }} />
            <input type="text" value={newPin} onChange={e => { setNewPin(e.target.value.replace(/\D/g,"")); setPinError(""); }} onKeyDown={e => e.key==="Enter" && add()} placeholder="PIN" maxLength={4}
              style={{ width:80, background:"var(--navy)", border:`1.5px solid ${pinError ? "var(--red)" : "var(--border)"}`, borderRadius:8, color:"var(--text)", padding:"10px 14px", fontSize:14, fontFamily:"'DM Mono'", outline:"none", textAlign:"center", letterSpacing:4 }} />
            <Btn variant="primary" size="sm" onClick={add} disabled={!newName.trim() || newPin.length !== 4}><UserPlus size={14} /> Add</Btn>
          </div>
          <p style={{ fontSize:11, color: pinError ? "var(--red)" : "var(--muted)" }}>
            {pinError || "Enter the 4-digit PIN assigned to you"}
          </p>
        </div>

        {/* Employee list */}
        {employees.length === 0 ? (
          <p style={{ color:"var(--muted)", fontSize:13, textAlign:"center", padding:"20px 0" }}>No employees yet. Add your first VA above.</p>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:320, overflowY:"auto" }}>
            {employees.map(emp => (
              <div key={emp.id} style={{ background:"var(--navy)", borderRadius:8, padding:"10px 14px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{emp.name}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", marginTop:2, display:"flex", alignItems:"center", gap:6 }}>
                      <Lock size={10} />
                      {emp.pin ? <span style={{ fontFamily:"'DM Mono'", color:"var(--accent)", fontWeight:600, letterSpacing:3 }}>PIN: {emp.pin}</span> : <span style={{ color:"var(--amber)" }}>⚠ No PIN set</span>}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => { setEditPinId(emp.id); setPinInput(""); setPinError(""); }} title="Change PIN"
                      style={{ background:"rgba(79,142,247,.15)", border:"none", borderRadius:6, padding:"5px 10px", cursor:"pointer", color:"var(--accent)", fontSize:11, fontWeight:600, fontFamily:"'DM Sans'" }}>
                      {emp.pin ? "Change PIN" : "Set PIN"}
                    </button>
                    <button onClick={() => setRemoveId(emp.id)} title="Remove" style={{ background:"rgba(247,107,107,.15)", border:"none", borderRadius:6, padding:"5px 8px", cursor:"pointer", color:"var(--red)", display:"flex", alignItems:"center" }}>
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {/* Inline PIN edit */}
                {editPinId === emp.id && (
                  <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"flex-start", flexDirection:"column" }}>
                    <div style={{ display:"flex", gap:8, width:"100%" }}>
                      <input type="text" value={pinInput} onChange={e => { setPinInput(e.target.value.replace(/\D/g,"")); setPinError(""); }} placeholder="New PIN" maxLength={4} autoFocus
                        style={{ flex:1, background:"var(--card)", border:`1.5px solid ${pinError ? "var(--red)" : "var(--border)"}`, borderRadius:8, color:"var(--text)", padding:"8px 12px", fontSize:16, fontFamily:"'DM Mono'", outline:"none", textAlign:"center", letterSpacing:6 }} />
                      <Btn variant="primary" size="sm" onClick={() => savePin(emp.id)} disabled={pinInput.length !== 4}>Save</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => { setEditPinId(null); setPinError(""); }}>Cancel</Btn>
                    </div>
                    {pinError && <p style={{ fontSize:11, color:"var(--red)" }}>{pinError}</p>}
                    <p style={{ fontSize:11, color:"var(--muted)" }}>4 digits only</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ ACTIVE SESSIONS
// ╚════════════════════════════════════════════════════════════════════════
function ActiveSessions({ activeSessions }) {
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(x => x+1), 1000); return () => clearInterval(i); }, []);
  const list = Object.entries(activeSessions).filter(([,s]) => s);
  if (list.length === 0) return null;
  return (
    <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:12, padding:16, marginBottom:16 }}>
      <div style={{ fontSize:12, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.8, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ width:8, height:8, borderRadius:"50%", background:"var(--green)", boxShadow:"0 0 0 3px rgba(62,207,142,.3)" }} />Active Right Now ({list.length})
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {list.map(([name, s]) => {
          const w = workedMs(s); const isOT = s.type === "overtime"; const atLimit = !isOT && w >= DAILY_LIMIT_MS;
          return (
            <div key={name} style={{ background:"var(--navy)", border: isOT ? "1px solid rgba(167,139,250,.4)" : "1px solid var(--border)", borderRadius:10, padding:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                <span style={{ fontWeight:700, fontSize:14 }}>{name}</span>
                {isOT && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:10, background:"rgba(167,139,250,.18)", color:"var(--purple)", fontWeight:700 }}>⚡ OVERTIME</span>}
                {!isOT && s.status === "paused" && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:10, background:"rgba(245,166,35,.18)", color:"var(--amber)", fontWeight:700 }}>ON BREAK</span>}
                {atLimit && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:10, background:"rgba(247,107,107,.18)", color:"var(--red)", fontWeight:700 }}>LIMIT HIT</span>}
              </div>
              <div style={{ fontSize:12, color:"var(--muted)" }}>In: <span style={{ fontFamily:"'DM Mono'", color:"var(--text)" }}>{fmtTime(s.clockInTs)}</span> • Worked: <span style={{ fontFamily:"'DM Mono'", color: isOT ? "var(--purple)" : atLimit ? "var(--red)" : "var(--green)" }}>{msToHMS(w)}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ ENTRIES TABLE
// ╚════════════════════════════════════════════════════════════════════════
function EntriesTable({ entries, type, onEdit, onDelete, onToggleOT }) {
  const isOT = type === "overtime";
  const headers = isOT ? ["Employee","Date","Clock In","Clock Out","Break","Total","Actions"] : ["Employee","Date","Clock In","Clock Out","Break","Total","Authorize OT","Actions"];
  if (entries.length === 0) {
    return (
      <div style={{ padding:"48px 20px", textAlign:"center", color:"var(--muted)" }}>
        {isOT ? <Zap size={32} style={{ marginBottom:12, opacity:.4 }} /> : <CalendarDays size={32} style={{ marginBottom:12, opacity:.4 }} />}
        <p style={{ fontSize:14 }}>No {isOT ? "overtime" : "regular"} entries found{isOT && " yet"}.</p>
      </div>
    );
  }
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ background:"rgba(255,255,255,.03)" }}>
            {headers.map((h, i) => <th key={i} style={{ padding:"10px 14px", textAlign:"left", color:"var(--muted)", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:.7, whiteSpace:"nowrap", borderBottom:"1px solid var(--border)" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id} style={{ borderBottom: i < entries.length-1 ? "1px solid var(--border)" : "none" }}>
              <td style={{ padding:"12px 14px", fontWeight:600 }}>{e.employee}</td>
              <td style={{ padding:"12px 14px", color:"var(--muted)" }}>{prettyDate(e.date)}</td>
              <td style={{ padding:"12px 14px", fontFamily:"'DM Mono'", color:"var(--green)" }}>{fmtTime(e.clockIn)}</td>
              <td style={{ padding:"12px 14px", fontFamily:"'DM Mono'", color:"var(--red)" }}>{fmtTime(e.clockOut)}</td>
              <td style={{ padding:"12px 14px", fontFamily:"'DM Mono'", color:"var(--amber)" }}>{msToHMS(e.breakMs || 0)}</td>
              <td style={{ padding:"12px 14px", fontFamily:"'DM Mono'", fontWeight:600, color: isOT ? "var(--purple)" : "var(--accent)" }}>{e.duration}</td>
              {!isOT && (
                <td style={{ padding:"12px 14px" }}>
                  <button onClick={() => onToggleOT(e.id)} style={{ background: e.otAuthorized ? "rgba(167,139,250,.2)" : "var(--border)", border: e.otAuthorized ? "1.5px solid var(--purple)" : "1.5px solid transparent", borderRadius:6, padding:"5px 10px", cursor:"pointer", color: e.otAuthorized ? "var(--purple)" : "var(--muted)", fontFamily:"'DM Sans'", fontSize:11, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}>
                    {e.otAuthorized ? <><Zap size={11} /> ON</> : "OFF"}
                  </button>
                </td>
              )}
              <td style={{ padding:"12px 14px" }}>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => onEdit(e)} style={{ background:"rgba(79,142,247,.15)", border:"none", borderRadius:6, padding:"6px 8px", cursor:"pointer", color:"var(--accent)" }}><Edit2 size={13} /></button>
                  <button onClick={() => onDelete(e.id)} style={{ background:"rgba(247,107,107,.15)", border:"none", borderRadius:6, padding:"6px 8px", cursor:"pointer", color:"var(--red)" }}><Trash2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ ADMIN DASHBOARD
// ╚════════════════════════════════════════════════════════════════════════
function AdminDashboard({ employees, activeSessions, onSaveEntry, onDeleteEntry, onToggleEntryOT, onAddEmployee, onRemoveEmployee, onSetPin, onBack }) {
  const [filterEmp,   setFilterEmp]   = useState("all");
  const [filterStart, setFilterStart] = useState(() => new Date(Date.now()-30*24*60*60*1000).toLocaleDateString("en-CA",{timeZone:TZ}));
  const [filterEnd,   setFilterEnd]   = useState("");
  const [editEntry,   setEditEntry]   = useState(null);
  const [toast,       setToast]       = useState(null);
  const [delConfirm,  setDelConfirm]  = useState(null);
  const [entries,     setEntries]     = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  const showToast = (msg, type="success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    setEntriesLoading(true);
    const constraints = [];
    if (filterStart) constraints.push(where("date", ">=", filterStart));
    if (filterEnd)   constraints.push(where("date", "<=", filterEnd));
    const q = constraints.length ? query(collection(db, "entries"), ...constraints) : collection(db, "entries");
    return onSnapshot(q, snap => { setEntries(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.clockIn-a.clockIn)); setEntriesLoading(false); }, () => setEntriesLoading(false));
  }, [filterStart, filterEnd]);

  const filtered         = entries.filter(e => filterEmp === "all" || e.employee === filterEmp);
  const regularFiltered  = filtered.filter(e => e.type === "regular");
  const otFiltered       = filtered.filter(e => e.type === "overtime");
  const sumMs            = (list) => list.reduce((acc,e) => acc+(e.clockOut-e.clockIn-(e.breakMs||0)),0);
  const fmtTotal         = (ms) => `${Math.floor(ms/3_600_000)}h ${Math.floor((ms%3_600_000)/60_000)}m`;

  const handleExport = () => {
    const periodLabel = filterStart && filterEnd ? `${prettyDate(filterStart)} – ${prettyDate(filterEnd)}` : filterStart ? `From ${prettyDate(filterStart)}` : filterEnd ? `Through ${prettyDate(filterEnd)}` : "All Dates";
    const empLabel    = filterEmp === "all" ? "All Employees" : filterEmp;
    const regularRows = regularFiltered.map(e=>`<tr><td>${e.employee}</td><td>${prettyDate(e.date)}</td><td>${fmtTime(e.clockIn)}</td><td>${fmtTime(e.clockOut)}</td><td>${msToHMS(e.breakMs||0)}</td><td style="font-weight:600">${e.duration}</td></tr>`).join("");
    const otRows      = otFiltered.map(e=>`<tr><td>${e.employee}</td><td>${prettyDate(e.date)}</td><td>${fmtTime(e.clockIn)}</td><td>${fmtTime(e.clockOut)}</td><td>${msToHMS(e.breakMs||0)}</td><td style="font-weight:600;color:#7c3aed">${e.duration}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><title>Time Report</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;color:#111}h1{font-size:22px;font-weight:700;margin-bottom:4px}h2{font-size:16px;font-weight:700;margin-top:32px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #0f1117}h2.ot{color:#7c3aed;border-bottom-color:#7c3aed}.meta{color:#555;font-size:13px;margin-bottom:6px}.badge{display:inline-block;background:#0f1117;color:#fff;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}th{background:#0f1117;color:#fff;padding:10px 12px;text-align:left}th.ot{background:#7c3aed}td{padding:9px 12px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#f8f8f8}.summary{margin-top:8px;font-size:13px;color:#444;display:flex;gap:24px}.summary span{font-weight:700;color:#0f1117}.footer{margin-top:24px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:20px}}</style></head><body>
<h1>Employee Time Report</h1><div class="meta">Period: <strong>${periodLabel}</strong> | Employee: <strong>${empLabel}</strong> | Timezone: <strong>${tzAbbr(Date.now())} (Los Angeles)</strong></div>
<div class="badge">Generated: ${new Date().toLocaleString("en-US",{timeZone:TZ})}</div>
<h2>Regular Time Entries</h2>${regularFiltered.length>0?`<table><thead><tr><th>Employee</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Break</th><th>Total</th></tr></thead><tbody>${regularRows}</tbody></table><div class="summary"><div>Entries: <span>${regularFiltered.length}</span></div><div>Total Hours: <span>${fmtTotal(sumMs(regularFiltered))}</span></div></div>`:'<p style="color:#999;font-style:italic;padding:12px 0">No regular entries in this period.</p>'}
<h2 class="ot">⚡ Overtime Entries</h2>${otFiltered.length>0?`<table><thead><tr><th class="ot">Employee</th><th class="ot">Date</th><th class="ot">Clock In</th><th class="ot">Clock Out</th><th class="ot">Break</th><th class="ot">Total</th></tr></thead><tbody>${otRows}</tbody></table><div class="summary"><div>OT Entries: <span>${otFiltered.length}</span></div><div>OT Hours: <span style="color:#7c3aed">${fmtTotal(sumMs(otFiltered))}</span></div></div>`:'<p style="color:#999;font-style:italic;padding:12px 0">No overtime entries in this period.</p>'}
<div class="footer">All times in PST/PDT (Los Angeles, California) • Combined total: ${fmtTotal(sumMs(regularFiltered)+sumMs(otFiltered))}</div></body></html>`;
    const w = window.open("","_blank"); if(!w){alert("Please allow popups");return;} w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--navy)", padding:20 }}>
      {toast && <Toast {...toast} />}
      {editEntry && <EditModal entry={editEntry} onSave={u=>{onSaveEntry(u);setEditEntry(null);showToast("Entry updated");}} onClose={()=>setEditEntry(null)} />}
      {delConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}>
          <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:16, padding:28, width:"100%", maxWidth:360, textAlign:"center" }}>
            <AlertCircle size={32} color="var(--red)" style={{ marginBottom:12 }} />
            <h3 style={{ fontWeight:700, marginBottom:8 }}>Delete Entry?</h3>
            <p style={{ color:"var(--muted)", fontSize:13, marginBottom:20 }}>This action cannot be undone.</p>
            <div style={{ display:"flex", gap:10 }}>
              <Btn variant="ghost" fullWidth onClick={()=>setDelConfirm(null)}>Cancel</Btn>
              <Btn variant="red" fullWidth onClick={()=>{onDeleteEntry(delConfirm);setDelConfirm(null);showToast("Entry deleted","error");}}>Delete</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth:1100, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={onBack} style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:8, color:"var(--muted)", cursor:"pointer", display:"flex", padding:8 }}><ArrowLeft size={18} /></button>
            <div>
              <h1 style={{ fontSize:20, fontWeight:700 }}>Admin Dashboard</h1>
              <p style={{ color:"var(--muted)", fontSize:12 }}>{new Date().toLocaleDateString("en-US",{timeZone:TZ,weekday:"long",year:"numeric",month:"long",day:"numeric"})} • {tzAbbr(Date.now())}</p>
            </div>
          </div>
          <Btn variant="outline" onClick={handleExport} size="sm"><Download size={15} /> Export PDF</Btn>
          <a href="https://github.com/algerpartnershhci/timetrack-vas/blob/main/src/App.jsx" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:"var(--muted)", textDecoration:"none", display:"flex", alignItems:"center", gap:4 }}>⚙️ Change admin password</a>
        </div>

        <ActiveSessions activeSessions={activeSessions} />
        <EmployeeManagement employees={employees} onAdd={(n,p)=>{onAddEmployee(n,p);showToast(`${n} added`);}} onRemove={id=>{onRemoveEmployee(id);showToast("Employee removed","warn");}} onSetPin={(id,p)=>{onSetPin(id,p);showToast("PIN updated");}} />

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:20 }}>
          {[["Regular Entries",regularFiltered.length,"var(--accent)"],["Regular Hours",fmtTotal(sumMs(regularFiltered)),"var(--green)"],["OT Entries",otFiltered.length,"var(--purple)"],["OT Hours",fmtTotal(sumMs(otFiltered)),"var(--purple)"]].map(([l,v,c])=>(
            <div key={l} style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
              <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:.8, marginBottom:8 }}>{l}</div>
              <div style={{ fontSize:24, fontWeight:700, color:c }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:12, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.8, marginBottom:12 }}>Filter Reports</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            <div>
              <label style={{ fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:.6, display:"block", marginBottom:6 }}>Employee</label>
              <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)} style={{ width:"100%", background:"var(--navy)", border:"1.5px solid var(--border)", borderRadius:8, color:"var(--text)", padding:"9px 12px", fontSize:13, fontFamily:"'DM Sans'" }}>
                <option value="all">All Employees</option>
                {employees.map(e=><option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </div>
            <Input label="From Date" type="date" value={filterStart} onChange={e=>setFilterStart(e.target.value)} />
            <Input label="To Date" type="date" value={filterEnd} onChange={e=>setFilterEnd(e.target.value)} />
          </div>
          <p style={{ marginTop:8, color:"var(--muted)", fontSize:11 }}>Default shows last 30 days.</p>
        </div>

        {entriesLoading ? (
          <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:12, padding:48, textAlign:"center" }}>
            <Loader2 size={24} color="var(--accent)" style={{ animation:"spin 1s linear infinite", marginBottom:12 }} />
            <p style={{ color:"var(--muted)", fontSize:13 }}>Loading entries…</p>
          </div>
        ) : (
          <>
            <div style={{ background:"var(--card)", border:"1.5px solid var(--border)", borderRadius:12, overflow:"hidden", marginBottom:20 }}>
              <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontWeight:700, fontSize:14 }}>Time Entries</span>
                <span style={{ color:"var(--muted)", fontSize:13 }}>{regularFiltered.length} record{regularFiltered.length!==1?"s":""}</span>
              </div>
              <EntriesTable entries={regularFiltered} type="regular" onEdit={setEditEntry} onDelete={setDelConfirm} onToggleOT={id=>{onToggleEntryOT(id);showToast("OT authorization updated");}} />
            </div>
            <div style={{ background:"var(--card)", border:"1.5px solid var(--purple)", borderRadius:12, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(167,139,250,.05)" }}>
                <span style={{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center", gap:8, color:"var(--purple)" }}><Zap size={15} /> Overtime Entries</span>
                <span style={{ color:"var(--muted)", fontSize:13 }}>{otFiltered.length} record{otFiltered.length!==1?"s":""}</span>
              </div>
              <EntriesTable entries={otFiltered} type="overtime" onEdit={setEditEntry} onDelete={setDelConfirm} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════════════
// ║ ROOT APP
// ╚════════════════════════════════════════════════════════════════════════
export default function App() {
  const [view,           setView]           = useState("home");
  const [employees,      setEmployees]      = useState([]);
  const [activeSessions, setActiveSessions] = useState({});
  const [toast,          setToast]          = useState(null);
  const [loaded,         setLoaded]         = useState(false);

  useEffect(() => {
    const unsubEmp = onSnapshot(query(collection(db,"employees"),orderBy("createdAt","asc")), snap => { setEmployees(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoaded(true); }, () => setLoaded(true));
    const unsubAct = onSnapshot(collection(db,"activeSessions"), snap => { const s={}; snap.docs.forEach(d=>{s[d.id]=d.data();}); setActiveSessions(s); });
    return () => { unsubEmp(); unsubAct(); };
  }, []);

  const showToast = (msg, type="success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const safe = async (fn, errMsg="Operation failed") => { try { await fn(); } catch(e) { console.error(e); showToast(errMsg,"error"); } };

  const handleAddEmployee    = (name, pin) => safe(() => addDoc(collection(db,"employees"), { name, pin, createdAt: Date.now() }));
  const handleRemoveEmployee = (id)        => safe(() => deleteDoc(doc(db,"employees",id)));
  const handleSetPin         = (id, pin)   => safe(() => updateDoc(doc(db,"employees",id), { pin }));

  const handleClockIn = async (name) => {
    const today = todayLA();
    const { getDocs } = await import("firebase/firestore");
    const existing = await getDocs(query(collection(db,"entries"),where("employee","==",name),where("date","==",today),where("type","==","regular")));
    if (!existing.empty) { showToast("You've already done your regular shift today","error"); return; }
    await safe(() => setDoc(doc(db,"activeSessions",name), { type:"regular", clockInTs:Date.now(), status:"working", pausedAt:null, totalPausedMs:0 }));
    showToast(`${name.split(" ")[0]} clocked in at ${fmtTime(Date.now())} ${tzAbbr(Date.now())}`);
  };

  const handleStartOT = async (name) => {
    const today = todayLA();
    const { getDocs } = await import("firebase/firestore");
    const snap = await getDocs(query(collection(db,"entries"),where("employee","==",name),where("date","==",today),where("type","==","regular")));
    if (snap.empty || !snap.docs[0].data().otAuthorized) { showToast("Overtime not authorized","error"); return; }
    await safe(() => setDoc(doc(db,"activeSessions",name), { type:"overtime", clockInTs:Date.now(), status:"working", pausedAt:null, totalPausedMs:0, parentEntryId:snap.docs[0].id }));
    showToast(`${name.split(" ")[0]} started overtime ⚡`,"ot");
  };

  const handlePause = (name) => safe(async () => {
    const s = activeSessions[name]; if (!s || s.status!=="working") return;
    await updateDoc(doc(db,"activeSessions",name), { status:"paused", pausedAt:Date.now() });
    showToast(`${name.split(" ")[0]} on break`,"warn");
  });

  const handleResume = (name) => safe(async () => {
    const s = activeSessions[name]; if (!s || s.status!=="paused") return;
    if (s.type==="regular" && workedMs(s)>=DAILY_LIMIT_MS) { showToast("8h limit reached. Please clock out.","error"); return; }
    const breakLength = Date.now() - s.pausedAt;
    await updateDoc(doc(db,"activeSessions",name), { status:"working", pausedAt:null, totalPausedMs:(s.totalPausedMs||0)+breakLength });
    showToast(`${name.split(" ")[0]} resumed`);
  });

  const handleClockOut = (name) => safe(async () => {
    const s = activeSessions[name]; if (!s) return;
    const outTs = Date.now();
    let totalPaused = s.totalPausedMs||0;
    if (s.status==="paused" && s.pausedAt) totalPaused += (outTs-s.pausedAt);
    let worked = outTs - s.clockInTs - totalPaused;
    if (s.type==="regular" && worked>DAILY_LIMIT_MS) worked=DAILY_LIMIT_MS;
    const entry = { type:s.type, employee:name, date:fmtDate(s.clockInTs), clockIn:s.clockInTs, clockOut:outTs, breakMs:totalPaused, duration:msToHMS(worked), ...(s.type==="regular"?{otAuthorized:false}:{parentEntryId:s.parentEntryId||null}) };
    await addDoc(collection(db,"entries"), entry);
    await deleteDoc(doc(db,"activeSessions",name));
    showToast(`${name.split(" ")[0]} clocked out — ${entry.duration} ${s.type==="overtime"?"OT logged ⚡":"logged"}`, s.type==="overtime"?"ot":"success");
  });

  const handleSaveEntry     = (u)  => safe(() => updateDoc(doc(db,"entries",u.id), { date:u.date, clockIn:u.clockIn, clockOut:u.clockOut, duration:u.duration }));
  const handleDeleteEntry   = (id) => safe(() => deleteDoc(doc(db,"entries",id)));
  const handleToggleEntryOT = (id) => safe(async () => {
    const { getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db,"entries",id));
    if (snap.exists()) await updateDoc(doc(db,"entries",id), { otAuthorized:!snap.data().otAuthorized });
  });

  if (!loaded) return (<><style>{CSS}</style><LoadingScreen /></>);

  return (
    <>
      <style>{CSS}</style>
      {toast && <Toast {...toast} />}
      {view==="home"         && <HomeScreen onEmployee={()=>setView("employee")} onAdmin={()=>setView("admin-login")} />}
      {view==="employee"     && <EmployeeScreen employees={employees} activeSessions={activeSessions} onClockIn={handleClockIn} onStartOT={handleStartOT} onPause={handlePause} onResume={handleResume} onClockOut={handleClockOut} onBack={()=>setView("home")} />}
      {view==="admin-login"  && <AdminLogin onAuth={()=>setView("admin")} onBack={()=>setView("home")} />}
      {view==="admin"        && <AdminDashboard employees={employees} activeSessions={activeSessions} onSaveEntry={handleSaveEntry} onDeleteEntry={handleDeleteEntry} onToggleEntryOT={handleToggleEntryOT} onAddEmployee={handleAddEmployee} onRemoveEmployee={handleRemoveEmployee} onSetPin={handleSetPin} onBack={()=>setView("home")} />}
    </>
  );
}
