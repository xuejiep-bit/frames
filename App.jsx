import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════ PROMPTS ═══════════════════ */
const MOVIE_PROMPT = (line, movie) => `Analyze this English movie dialogue line from "${movie || "a movie"}":
"${line}"

Return ONLY a JSON object, nothing else:
{"vocabulary":[{"word":"...","phonetic":"...","pos":"...","meaning_en":"...","meaning_cn":"...","example":"..."}],"phrases":[{"phrase":"...","meaning_en":"...","meaning_cn":"...","example":"..."}],"grammar":[{"pattern":"...","explanation_en":"...","explanation_cn":"...","example":"..."}],"translation":"natural Chinese translation","one_liner":"one Chinese sentence about the key learning point","context_note":"brief cultural or situational context","auto_tags":["tag1","tag2"]}

Rules: Focus on intermediate-level vocabulary. Only include words a Chinese learner might not know. auto_tags: 2-3 short Chinese tags.`;

const READING_PROMPT = (sentence, source) => `Analyze this English sentence${source ? ` from "${source}"` : ""} for a Chinese learner:
"${sentence}"

Return ONLY a JSON object, nothing else:
{"grammar_structure":{"main_clause":"the main clause","subordinate_clauses":["clause 1"],"structure_diagram":"[主语 ...] [谓语 ...] [宾语/状语 ...]","explanation_cn":"Chinese explanation of grammar"},"vocabulary":[{"word":"...","phonetic":"...","pos":"...","meaning_en":"...","meaning_cn":"...","level":"CET4","example":"..."}],"phrases":[{"phrase":"...","meaning_en":"...","meaning_cn":"...","example":"..."}],"translation":"natural Chinese translation","one_liner":"one Chinese sentence about the key grammar point","auto_tags":["tag1","tag2"]}

Rules: vocabulary ONLY includes words above Chinese high school level. level must be CET4, CET6 or GRE. structure_diagram uses Chinese labels in brackets. auto_tags: 2-3 Chinese tags like "长难句","定语从句".`;


/* ═══════════════════ API ═══════════════════ */
function extractJSON(text) {
  // Strategy 1: Clean markdown fences and parse directly
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  // Strategy 2: Find the outermost { ... } block
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch {}
  }
  // Strategy 3: Try line-by-line removal of non-JSON prefix/suffix
  const lines = text.split("\n");
  let start = 0, end = lines.length - 1;
  while (start < lines.length && !lines[start].trim().startsWith("{")) start++;
  while (end > start && !lines[end].trim().endsWith("}")) end--;
  if (start <= end) {
    try { return JSON.parse(lines.slice(start, end + 1).join("\n")); } catch {}
  }
  return null;
}

async function callAI(prompt) {
  const res = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`API 请求失败 (${res.status})${errBody ? ": " + errBody.slice(0, 200) : ""}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API 返回错误");
  const text = data.content?.map(b => b.text || "").join("") || "";
  if (!text) throw new Error("API 返回为空，请重试");
  const parsed = extractJSON(text);
  if (parsed) return parsed;
  console.error("JSON extraction failed. Raw:", text);
  throw new Error("AI 返回格式异常，请重试");
}

/* ═══════════════════ AUTH & STORAGE ═══════════════════ */
const AUTH_KEY = "frames-auth";
const GUEST_KEY = "frames-data-guest";
const getUserKey = (uid) => `frames-data-${uid}`;
const FREE_LIMIT = 10;

function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) { h = ((h << 5) - h + pw.charCodeAt(i)) | 0; }
  return "h_" + Math.abs(h).toString(36) + pw.length;
}

function getAllUsers() {
  try { return JSON.parse(localStorage.getItem("frames-users")) || {}; } catch { return {}; }
}
function saveAllUsers(users) { localStorage.setItem("frames-users", JSON.stringify(users)); }

function register(email, password, name) {
  const users = getAllUsers();
  if (users[email]) return { ok: false, msg: "该邮箱已注册" };
  if (password.length < 6) return { ok: false, msg: "密码至少6位" };
  const uid = "u_" + Date.now().toString(36);
  users[email] = { uid, name, email, pw: hashPassword(password), createdAt: Date.now() };
  saveAllUsers(users);
  const session = { uid, name, email };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return { ok: true, user: session };
}

function login(email, password) {
  const users = getAllUsers();
  const u = users[email];
  if (!u) return { ok: false, msg: "邮箱未注册" };
  if (u.pw !== hashPassword(password)) return { ok: false, msg: "密码错误" };
  const session = { uid: u.uid, name: u.name, email: u.email };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return { ok: true, user: session };
}

function logout() { localStorage.removeItem(AUTH_KEY); }

function getSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}

function loadNotes(uid) {
  try { return JSON.parse(localStorage.getItem(getUserKey(uid))) || []; } catch { return []; }
}
function saveNotes(uid, n) { localStorage.setItem(getUserKey(uid), JSON.stringify(n)); }
function loadGuestNotes() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || []; } catch { return []; }
}
function saveGuestNotes(n) { localStorage.setItem(GUEST_KEY, JSON.stringify(n)); }
function migrateGuestNotes(uid) {
  const guest = loadGuestNotes();
  if (guest.length === 0) return [];
  const existing = loadNotes(uid);
  const merged = [...guest, ...existing];
  saveNotes(uid, merged);
  localStorage.removeItem(GUEST_KEY);
  return merged;
}

/* ═══════════════════ TTS ═══════════════════ */
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

/* ═══════════════════ SPACED REPETITION ═══════════════════ */
function getDueNotes(notes) {
  const now = Date.now();
  return notes.filter(n => {
    const last = n.lastReview || n.timestamp;
    const count = n.reviewCount || 0;
    let interval;
    if (count === 0) interval = 1 * 86400000;
    else if (count === 1) interval = 3 * 86400000;
    else if (count === 2) interval = 7 * 86400000;
    else if (count === 3) interval = 14 * 86400000;
    else interval = 30 * 86400000;
    return (now - last) >= interval;
  });
}

/* ═══════════════════ EXPORTS ═══════════════════ */
function exportAnki(notes) {
  let csv = "";
  notes.forEach(n => {
    if (n.data?.vocabulary) n.data.vocabulary.forEach(v => { csv += `"${(v.word + " " + (v.phonetic||"")).replace(/"/g,'""')}","${(v.meaning_cn+"<br>"+v.meaning_en).replace(/"/g,'""')}","${n.category||""}"\n`; });
  });
  dl(csv, "csv", "Anki");
}
function exportMD(notes) {
  let md = `# 🎬 Frames 帧记 — 英语学习笔记\n> ${new Date().toLocaleString("zh-CN")} · ${notes.length} 条\n\n---\n\n`;
  const g = {}; notes.forEach(n => { (g[n.category||"未分类"] = g[n.category||"未分类"] || []).push(n); });
  Object.entries(g).forEach(([c, items]) => {
    md += `## 📂 ${c}\n\n`;
    items.forEach(n => {
      const icon = n.type==="reading" ? "📰" : "🎬";
      md += `### ${icon} ${n.input}\n*${new Date(n.timestamp).toLocaleString("zh-CN")}* · 复习${n.reviewCount||0}次${n.tags?.length?" · "+n.tags.map(t=>"#"+t).join(" "):""}\n\n`;
      if (n.data?.translation) md += `**翻译:** ${n.data.translation}\n\n`;
      if (n.data?.grammar_structure?.explanation_cn) md += `**语法:** ${n.data.grammar_structure.explanation_cn}\n\n`;
      if (n.data?.grammar_structure?.structure_diagram) md += `\`${n.data.grammar_structure.structure_diagram}\`\n\n`;
      n.data?.vocabulary?.forEach(v => md += `- **${v.word}** ${v.phonetic||""} ${v.level ? `[${v.level}]` : ""} — ${v.meaning_cn}\n`);
      n.data?.phrases?.forEach(p => md += `- **${p.phrase}** — ${p.meaning_cn}\n`);
      md += "\n---\n\n";
    });
  });
  dl(md, "md", "Notes");
}
function dl(content, ext, label) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + content], { type: ext === "csv" ? "text/csv;charset=utf-8" : "text/markdown;charset=utf-8" }));
  a.download = `Frames-${label}-${new Date().toISOString().slice(0,10)}.${ext}`;
  a.click();
}

/* ═══════════════════ EXAMPLES ═══════════════════ */
const MOVIE_EXAMPLES = [
  { line: "Get busy living or get busy dying.", movie: "The Shawshank Redemption" },
  { line: "You had me at hello.", movie: "Jerry Maguire" },
  { line: "After all, tomorrow is another day.", movie: "Gone with the Wind" },
  { line: "I'm going to make him an offer he can't refuse.", movie: "The Godfather" },
  { line: "To infinity and beyond!", movie: "Toy Story" },
  { line: "Why so serious?", movie: "The Dark Knight" },
];

/* ═══════════════════ ANIMATED LOGO ═══════════════════ */
function FramesLogo({ size = 34 }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: size, height: size, cursor: "pointer", position: "relative" }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block" }}>
        <rect x="4" y="4" width="92" height="92" rx="18" ry="18" fill="var(--brand)" />
        {/* Pencil body */}
        <g transform="translate(50,50) rotate(-45)" style={{ transition: "transform 0.3s ease", transform: `translate(50px,50px) rotate(${hovered ? -40 : -45}deg)` }}>
          <rect x="-6" y="-30" width="12" height="42" rx="2" fill="#fff" opacity="0.95" />
          {/* Pencil tip */}
          <polygon points="-6,12 6,12 0,22" fill="#fff" opacity="0.95" />
          {/* Eraser band */}
          <rect x="-6" y="-30" width="12" height="6" rx="2" fill="#fff" opacity="0.5" />
          {/* Writing line */}
          <line x1="0" y1="22" x2="0" y2={hovered ? "30" : "22"} stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity={hovered ? "0.6" : "0"} style={{ transition: "all 0.3s ease" }} />
        </g>
      </svg>
    </div>
  );
}

/* ═══════════════════ COLLAPSIBLE SECTION ═══════════════════ */
function Section({ icon, title, color, children, count, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div style={{ borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden", transition: "all 0.2s", boxShadow: open ? "var(--shadow-sm)" : "none" }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{
        width: "100%", padding: "13px 18px", border: "none", cursor: "pointer",
        background: open ? `${color}08` : "var(--surface)", display: "flex", alignItems: "center",
        gap: 10, fontFamily: "var(--body)", fontSize: 13, fontWeight: 700, color: open ? color : "var(--fg-dim)",
        transition: "all 0.2s",
      }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ flex: 1, textAlign: "left" }}>{title}</span>
        {count > 0 && <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}12`, padding: "2px 8px", borderRadius: 6 }}>{count}</span>}
        <span style={{ fontSize: 10, transform: open ? "rotate(180deg)" : "", transition: "transform 0.2s", color: "var(--fg-muted)" }}>▼</span>
      </button>
      {open && <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>{children}</div>}
    </div>
  );
}

/* ═══════════════════ SPEAK BTN ═══════════════════ */
function SpeakBtn({ text }) {
  const [on, setOn] = useState(false);
  return (
    <button onClick={e => { e.stopPropagation(); setOn(true); speak(text); setTimeout(() => setOn(false), 1000); }}
      style={{ width: 22, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: on ? "var(--brand)" : "var(--surface)", color: on ? "#fff" : "var(--fg-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, transition: "all 0.2s", flexShrink: 0, padding: 0 }}
      title="发音">🔊</button>
  );
}

/* ═══════════════════ VOCAB ITEM ═══════════════════ */
function VocabItem({ v }) {
  return (
    <div style={{ padding: "10px 14px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", lineHeight: 1.7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", fontFamily: "var(--serif)" }}>{v.word}</span>
        <SpeakBtn text={v.word} />
        {v.phonetic && <span style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "var(--mono)" }}>{v.phonetic}</span>}
        {v.pos && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--violet)", background: "var(--violet-bg)", padding: "1px 7px", borderRadius: 5 }}>{v.pos}</span>}
      </div>
      <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 600, marginTop: 3 }}>{v.meaning_cn}</div>
      <div style={{ fontSize: 12, color: "var(--fg-dim)", marginTop: 1 }}>{v.meaning_en}</div>
      {v.example && <div style={{ fontSize: 11, color: "var(--fg-muted)", fontStyle: "italic", marginTop: 5, paddingLeft: 9, borderLeft: "2px solid var(--border)" }}>{v.example}</div>}
    </div>
  );
}

/* ═══════════════════ MOVIE DETAIL ═══════════════════ */
function MovieDetail({ data, compact }) {
  if (!data) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
      <div style={{ background: "var(--warm)", borderRadius: 14, padding: "16px 20px" }}>
        <div style={{ fontSize: 18, fontWeight: 400, color: "var(--fg)", lineHeight: 1.6, fontFamily: "var(--serif)" }}>{data.translation}</div>
        {data.one_liner && <div style={{ fontSize: 13, color: "var(--brand-text)", marginTop: 8, fontWeight: 600 }}>💡 {data.one_liner}</div>}
      </div>
      <Section icon="📖" title="生词 Vocabulary" color="var(--brand)" count={data.vocabulary?.length} defaultOpen={false}>
        <div style={{ display: "grid", gap: 8 }}>{data.vocabulary?.map((v, i) => <VocabItem key={i} v={v} />)}</div>
      </Section>
      <Section icon="🔗" title="词组 Phrases" color="var(--teal)" count={data.phrases?.length}>
        <div style={{ display: "grid", gap: 8 }}>
          {data.phrases?.map((p, i) => (
            <div key={i} style={{ padding: "10px 14px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", lineHeight: 1.7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--serif)" }}>{p.phrase}</span>
                <SpeakBtn text={p.phrase} />
              </div>
              <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 600, marginTop: 2 }}>{p.meaning_cn}</div>
              <div style={{ fontSize: 12, color: "var(--fg-dim)" }}>{p.meaning_en}</div>
              {p.example && <div style={{ fontSize: 11, color: "var(--fg-muted)", fontStyle: "italic", marginTop: 5, paddingLeft: 9, borderLeft: "2px solid var(--border)" }}>{p.example}</div>}
            </div>
          ))}
        </div>
      </Section>
      <Section icon="📐" title="语法 Grammar" color="var(--emerald)" count={data.grammar?.length}>
        <div style={{ display: "grid", gap: 8 }}>
          {data.grammar?.map((g, i) => (
            <div key={i} style={{ padding: "10px 14px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", lineHeight: 1.7 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>{g.pattern}</div>
              <div style={{ fontSize: 13, color: "var(--fg)", marginTop: 2 }}>{g.explanation_cn}</div>
              <div style={{ fontSize: 12, color: "var(--fg-dim)" }}>{g.explanation_en}</div>
              {g.example && <div style={{ fontSize: 11, color: "var(--fg-muted)", fontStyle: "italic", marginTop: 5, paddingLeft: 9, borderLeft: "2px solid var(--border)" }}>{g.example}</div>}
            </div>
          ))}
        </div>
      </Section>
      {data.context_note && (
        <div style={{ padding: "10px 14px", background: "var(--warm)", borderRadius: 10, fontSize: 12, color: "var(--fg-dim)", lineHeight: 1.6 }}>
          🎬 {data.context_note}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ READING DETAIL ═══════════════════ */
function ReadingDetail({ data, compact }) {
  if (!data) return null;
  const levelColor = { "CET4": "var(--emerald)", "CET6": "var(--brand)", "考研": "var(--violet)", "GRE": "var(--red)", "专业": "var(--navy)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
      {/* Translation + one-liner */}
      <div style={{ background: "var(--warm)", borderRadius: 14, padding: "16px 20px" }}>
        <div style={{ fontSize: 18, fontWeight: 400, color: "var(--fg)", lineHeight: 1.6, fontFamily: "var(--serif)" }}>{data.translation}</div>
        {data.one_liner && <div style={{ fontSize: 13, color: "var(--navy)", marginTop: 8, fontWeight: 600 }}>💡 {data.one_liner}</div>}
      </div>
      {/* Grammar Structure — always open by default */}
      {data.grammar_structure && (
        <Section icon="🧩" title="语法结构拆解" color="var(--navy)" count={null} defaultOpen={true}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.grammar_structure.structure_diagram && (
              <div style={{ padding: "14px 16px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 2, color: "var(--fg)", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {data.grammar_structure.structure_diagram}
              </div>
            )}
            {data.grammar_structure.main_clause && (
              <div style={{ padding: "10px 14px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", lineHeight: 1.7 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>主句</div>
                <div style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--fg)" }}>{data.grammar_structure.main_clause}</div>
              </div>
            )}
            {data.grammar_structure.subordinate_clauses?.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                {data.grammar_structure.subordinate_clauses.map((cl, i) => (
                  <div key={i} style={{ padding: "10px 14px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", borderLeft: "3px solid var(--violet)", lineHeight: 1.7 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--violet)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>从句 {i + 1}</div>
                    <div style={{ fontSize: 13, fontFamily: "var(--serif)", color: "var(--fg)" }}>{cl}</div>
                  </div>
                ))}
              </div>
            )}
            {data.grammar_structure.explanation_cn && (
              <div style={{ padding: "10px 14px", background: "var(--surface)", borderRadius: 10, fontSize: 13, color: "var(--fg)", lineHeight: 1.8 }}>
                📝 {data.grammar_structure.explanation_cn}
              </div>
            )}
          </div>
        </Section>
      )}
      {/* Vocabulary */}
      <Section icon="📖" title="进阶生词" color="var(--brand)" count={data.vocabulary?.length} defaultOpen={false}>
        <div style={{ display: "grid", gap: 8 }}>
          {data.vocabulary?.map((v, i) => (
            <div key={i} style={{ padding: "10px 14px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", lineHeight: 1.7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", fontFamily: "var(--serif)" }}>{v.word}</span>
                <SpeakBtn text={v.word} />
                {v.phonetic && <span style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "var(--mono)" }}>{v.phonetic}</span>}
                {v.pos && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--violet)", background: "var(--violet-bg)", padding: "1px 7px", borderRadius: 5 }}>{v.pos}</span>}
                {v.level && <span style={{ fontSize: 9, fontWeight: 700, color: levelColor[v.level] || "var(--fg-muted)", background: (levelColor[v.level] || "var(--fg-muted)") + "12", padding: "1px 7px", borderRadius: 5 }}>{v.level}</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 600, marginTop: 3 }}>{v.meaning_cn}</div>
              <div style={{ fontSize: 12, color: "var(--fg-dim)", marginTop: 1 }}>{v.meaning_en}</div>
              {v.example && <div style={{ fontSize: 11, color: "var(--fg-muted)", fontStyle: "italic", marginTop: 5, paddingLeft: 9, borderLeft: "2px solid var(--border)" }}>{v.example}</div>}
            </div>
          ))}
        </div>
      </Section>
      {/* Phrases */}
      <Section icon="🔗" title="词组搭配" color="var(--teal)" count={data.phrases?.length}>
        <div style={{ display: "grid", gap: 8 }}>
          {data.phrases?.map((p, i) => (
            <div key={i} style={{ padding: "10px 14px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", lineHeight: 1.7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--serif)" }}>{p.phrase}</span>
                <SpeakBtn text={p.phrase} />
              </div>
              <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 600, marginTop: 2 }}>{p.meaning_cn}</div>
              <div style={{ fontSize: 12, color: "var(--fg-dim)" }}>{p.meaning_en}</div>
              {p.example && <div style={{ fontSize: 11, color: "var(--fg-muted)", fontStyle: "italic", marginTop: 5, paddingLeft: 9, borderLeft: "2px solid var(--border)" }}>{p.example}</div>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}


/* ═══════════════════ NOTE CARD ═══════════════════ */
function NoteCard({ note, onDelete, onReview }) {
  const [open, setOpen] = useState(false);
  const isR = note.type === "reading";
  const accent = isR ? "var(--navy)" : "var(--brand)";
  const accentBg = isR ? "var(--navy-bg)" : "var(--brand-bg)";
  const icon = isR ? "📰" : "🎬";
  return (
    <div onClick={() => setOpen(!open)} style={{
      background: "var(--card)", borderRadius: 16, overflow: "hidden",
      border: "1px solid var(--border)", cursor: "pointer", transition: "all 0.25s ease",
      boxShadow: open ? "var(--shadow-lg)" : "var(--shadow-sm)",
      borderLeft: `3px solid ${accent}`,
      transform: open ? "scale(1.003)" : "scale(1)",
    }}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, background: accentBg }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            {note.category && <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{note.category}</span>}
            <span style={{ fontSize: 10, color: "var(--fg-muted)", fontFamily: "var(--mono)" }}>{new Date(note.timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}</span>
            {(note.reviewCount||0) > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--navy)", background: "var(--navy-bg)", padding: "1px 7px", borderRadius: 5 }}>复习{note.reviewCount}次</span>}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg)", fontFamily: "var(--serif)", fontStyle: "italic", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: open ? 99 : 2, WebkitBoxOrient: "vertical" }}>"{note.input}"</p>
          {note.tags?.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>{note.tags.map((t, i) => <span key={i} style={{ fontSize: 10, color: "var(--fg-muted)", background: "var(--surface)", padding: "1px 7px", borderRadius: 5 }}>#{t}</span>)}</div>}
        </div>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onReview(note.id); }} title="复习+1" style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", color: "var(--fg-muted)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</button>
          <button onClick={e => { e.stopPropagation(); onDelete(note.id); }} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", color: "var(--fg-muted)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          <span style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--fg-muted)", transform: open ? "rotate(180deg)" : "", transition: "transform 0.2s" }}>▼</span>
        </div>
      </div>
      {open && note.data && <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--border)", paddingTop: 16 }}>{isR ? <ReadingDetail data={note.data} compact /> : <MovieDetail data={note.data} compact />}</div>}
    </div>
  );
}

/* ═══════════════════ FLASHCARD ═══════════════════ */
function Flashcard({ note, onResult }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div style={{ perspective: 1000, width: "100%", maxWidth: 520, margin: "0 auto" }}>
      <div onClick={() => setFlipped(!flipped)} style={{
        position: "relative", width: "100%", minHeight: 240, cursor: "pointer",
        transformStyle: "preserve-3d", transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1)",
        transform: flipped ? "rotateY(180deg)" : "",
      }}>
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          background: "var(--card)", borderRadius: 20, border: "1px solid var(--border)",
          padding: "32px 28px", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", textAlign: "center", boxShadow: "var(--shadow-md)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: note.type === "reading" ? "var(--navy)" : "var(--brand)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>{note.type === "reading" ? "📰 新闻阅读" : "🎬 电影台词"}</div>
          <div style={{ fontSize: 20, fontFamily: "var(--serif)", fontStyle: "italic", lineHeight: 1.5, color: "var(--fg)", maxWidth: 400 }}>"{note.input}"</div>
          {note.category && <div style={{ marginTop: 16, fontSize: 12, color: "var(--fg-muted)" }}>{note.category}</div>}
          <div style={{ marginTop: 20, fontSize: 12, color: "var(--fg-muted)" }}>点击翻面 →</div>
        </div>
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          transform: "rotateY(180deg)", background: "var(--card)", borderRadius: 20,
          border: "1px solid var(--border)", padding: "24px",
          boxShadow: "var(--shadow-md)", overflow: "auto", maxHeight: 420,
        }}>
          {note.type === "reading" ? <ReadingDetail data={note.data} compact /> : <MovieDetail data={note.data} compact />}
        </div>
      </div>
      {flipped && (
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20, animation: "fadeUp 0.3s ease" }}>
          {[
            { label: "😟 不会", color: "var(--red)", value: "hard" },
            { label: "🤔 有点难", color: "var(--brand)", value: "medium" },
            { label: "😊 记住了", color: "var(--emerald)", value: "easy" },
          ].map(btn => (
            <button key={btn.value} onClick={e => { e.stopPropagation(); onResult(note.id, btn.value); setFlipped(false); }}
              style={{
                padding: "10px 22px", borderRadius: 12, border: `2px solid ${btn.color}`,
                background: `${btn.color}10`, color: btn.color, fontSize: 14, fontWeight: 700,
                cursor: "pointer", fontFamily: "var(--body)", transition: "all 0.2s",
              }}>{btn.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ LOADING ═══════════════════ */
function Loader() {
  const shimmerBg = "linear-gradient(90deg, var(--surface) 25%, var(--border) 37%, var(--surface) 63%)";
  const shimmerStyle = { backgroundSize: "200% 100%", animation: "shimmer 1.5s ease infinite" };
  return (
    <div style={{ padding: "24px 0", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Skeleton card */}
      <div style={{ background: "var(--card)", borderRadius: 16, padding: 24, boxShadow: "var(--shadow-sm)" }}>
        {/* Translation skeleton */}
        <div style={{ height: 20, width: "80%", borderRadius: 8, background: shimmerBg, ...shimmerStyle, marginBottom: 10 }} />
        <div style={{ height: 14, width: "50%", borderRadius: 6, background: shimmerBg, ...shimmerStyle, marginBottom: 20 }} />
        {/* Section skeletons */}
        {[1,2,3].map(i => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: shimmerBg, ...shimmerStyle, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 12, width: `${60 + i * 10}%`, borderRadius: 6, background: shimmerBg, ...shimmerStyle }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--fg-muted)", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
        AI 正在解析
        <span style={{ display: "inline-flex", gap: 3, marginLeft: 6 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--brand)", animation: `dot 1.2s ease ${i*0.15}s infinite` }} />)}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════ TAG BUTTON ═══════════════════ */
function TagBtn({ label, active, onClick, color = "var(--brand)" }) {
  return <button onClick={onClick} style={{ padding: "5px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body)", border: "none", background: active ? color+"12" : "var(--surface)", color: active ? color : "var(--fg-muted)", transition: "all 0.2s ease", whiteSpace: "nowrap", transform: active ? "scale(1)" : "scale(1)" }}
    onMouseEnter={e => { if(!active) e.currentTarget.style.background = "var(--border)"; }}
    onMouseLeave={e => { if(!active) e.currentTarget.style.background = "var(--surface)"; }}
  >{label}</button>;
}

/* ═══════════════════ REGISTER PROMPT (10-note wall) ═══════════════════ */
function RegisterPrompt({ onAuth, onClose, noteCount }) {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const inp = { width:"100%",padding:"13px 16px",border:"1px solid var(--input-border)",borderRadius:12,fontSize:14,fontFamily:"var(--body)",background:"var(--input-bg)",outline:"none",color:"var(--fg)",boxSizing:"border-box" };

  const handleSubmit = () => {
    setErr("");
    if (!email.trim() || !password.trim()) return setErr("请填写完整");
    if (!isLogin && !name.trim()) return setErr("请输入昵称");
    const result = isLogin ? login(email.trim(), password) : register(email.trim(), password, name.trim());
    if (result.ok) onAuth(result.user);
    else setErr(result.msg);
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      <div onClick={onClose} style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(8px)" }} />
      <div style={{ position:"relative",width:"100%",maxWidth:420,background:"var(--card)",borderRadius:22,padding:"32px 28px",border:"1px solid var(--border)",boxShadow:"var(--shadow-lg)",animation:"fadeUp 0.4s ease" }}>
        <button onClick={onClose} style={{ position:"absolute",top:14,right:14,width:30,height:30,borderRadius:8,border:"none",background:"var(--surface)",cursor:"pointer",fontSize:14,color:"var(--fg-muted)",display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>

        <div style={{ textAlign:"center",marginBottom:24 }}>
          <div style={{ fontSize:40,marginBottom:10 }}>🎉</div>
          <div style={{ fontSize:20,fontWeight:800,color:"var(--fg)" }}>你已积累 {noteCount} 条笔记！</div>
          <p style={{ fontSize:13,color:"var(--fg-dim)",marginTop:6,lineHeight:1.6 }}>注册后笔记永久保存，解锁无限记录</p>
        </div>

        <div style={{ display:"flex",gap:0,background:"var(--surface)",padding:3,borderRadius:10,marginBottom:20 }}>
          {[["register","注册"],["login","登录"]].map(([k,l]) => (
            <button key={k} onClick={()=>{setIsLogin(k==="login");setErr("");}} style={{
              flex:1,padding:"9px 0",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,
              fontFamily:"var(--body)",transition:"all 0.2s",
              background:(!isLogin&&k==="register")||(isLogin&&k==="login")?"var(--card)":"transparent",
              color:(!isLogin&&k==="register")||(isLogin&&k==="login")?"var(--fg)":"var(--fg-muted)",
            }}>{l}</button>
          ))}
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {!isLogin && <input value={name} onChange={e=>setName(e.target.value)} placeholder="昵称" style={inp} />}
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="邮箱" type="email" style={inp} onKeyDown={e=>{ if(e.key==="Enter") handleSubmit(); }} />
          <input value={password} onChange={e=>setPassword(e.target.value)} placeholder={isLogin?"密码":"至少6位密码"} type="password" style={inp} onKeyDown={e=>{ if(e.key==="Enter") handleSubmit(); }} />
          {err && <div style={{ padding:"8px 12px",background:"var(--red-bg)",borderRadius:8,color:"var(--red)",fontSize:12 }}>{err}</div>}
          <button onClick={handleSubmit} style={{
            width:"100%",padding:"13px 0",border:"none",borderRadius:12,fontSize:14,fontWeight:700,
            fontFamily:"var(--body)",cursor:"pointer",
            background:"linear-gradient(135deg,#F06225,#F5864C)",color:"#fff",
            boxShadow:"0 4px 16px var(--brand-bg)",
          }}>{isLogin ? "登录" : "免费注册"}</button>
          <button onClick={onClose} style={{ width:"100%",padding:"10px 0",border:"none",borderRadius:10,background:"transparent",fontSize:13,color:"var(--fg-muted)",cursor:"pointer",fontFamily:"var(--body)" }}>
            暂时跳过
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ USER MENU ═══════════════════ */
function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(!open)} style={{
        height:32,paddingLeft:3,paddingRight:10,borderRadius:9,border:"1px solid var(--border)",
        background:"var(--surface)",cursor:"pointer",display:"flex",alignItems:"center",gap:7,
        fontFamily:"var(--body)",fontSize:12,fontWeight:600,color:"var(--fg)",
      }}>
        <div style={{
          width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#FF6B2C,#FF8A56)",
          display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:800,
        }}>{(user.name||user.email)[0].toUpperCase()}</div>
        <span style={{ maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{user.name||user.email.split("@")[0]}</span>
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed",inset:0,zIndex:90 }} />
          <div style={{
            position:"absolute",right:0,top:"calc(100% + 6px)",background:"var(--card)",
            border:"1px solid var(--border)",borderRadius:14,padding:6,minWidth:180,
            boxShadow:"var(--shadow-lg)",zIndex:100,animation:"fadeUp 0.2s ease",
          }}>
            <div style={{ padding:"10px 14px",borderBottom:"1px solid var(--border)" }}>
              <div style={{ fontSize:13,fontWeight:700,color:"var(--fg)" }}>{user.name}</div>
              <div style={{ fontSize:11,color:"var(--fg-muted)",marginTop:2 }}>{user.email}</div>
            </div>
            <button onClick={()=>{setOpen(false);onLogout();}} style={{
              width:"100%",padding:"10px 14px",border:"none",background:"transparent",
              cursor:"pointer",fontSize:13,fontWeight:600,color:"var(--red)",
              fontFamily:"var(--body)",textAlign:"left",borderRadius:8,
              display:"flex",alignItems:"center",gap:8,transition:"background 0.15s",
            }}
            onMouseEnter={e=>e.currentTarget.style.background="var(--red-bg)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >🚪 退出登录</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════ MAIN ═══════════════════ */
export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showRegPrompt, setShowRegPrompt] = useState(false);
  const [mode, setMode] = useState("movie");
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);
  const [search, setSearch] = useState("");
  const [movieLine, setMovieLine] = useState("");
  const [movieName, setMovieName] = useState("");
  const [readingSentence, setReadingSentence] = useState("");
  const [readingSource, setReadingSource] = useState("");
  const [noteFilter, setNoteFilter] = useState("all");
  const [noteType, setNoteType] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [cnWarn, setCnWarn] = useState(false);
  const [reviewIdx, setReviewIdx] = useState(0);
  const resRef = useRef(null);

  // Load session or guest notes on mount
  useEffect(() => {
    const s = getSession();
    if (s) { setUser(s); setNotes(loadNotes(s.uid)); }
    else { setNotes(loadGuestNotes()); }
    setAuthChecked(true);
  }, []);

  // Save notes (user-scoped or guest)
  useEffect(() => {
    if (!authChecked) return;
    if (user) saveNotes(user.uid, notes);
    else saveGuestNotes(notes);
  }, [notes, user, authChecked]);
  useEffect(() => { if (result && resRef.current) resRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, [result]);

  // Show register prompt when hitting limit (only for guests)
  useEffect(() => {
    if (!user && notes.length >= FREE_LIMIT && notes.length % FREE_LIMIT === 0) {
      setShowRegPrompt(true);
    }
  }, [notes.length, user]);

  const handleAuth = (u) => {
    const merged = migrateGuestNotes(u.uid);
    setUser(u);
    setNotes(merged.length > 0 ? merged : loadNotes(u.uid));
    setShowRegPrompt(false);
  };
  const handleLogout = () => { logout(); setUser(null); setNotes(loadGuestNotes()); setResult(null); setMode("movie"); };

  const addNote = useCallback((type, input, category, data, tags) => {
    setNotes(prev => [{ id: Date.now().toString(), type, input, category, data, tags: tags||[], timestamp: Date.now(), reviewCount: 0, lastReview: null }, ...prev]);
  }, []);
  const deleteNote = useCallback(id => setNotes(p => p.filter(n => n.id !== id)), []);
  const reviewNote = useCallback(id => setNotes(p => p.map(n => n.id === id ? { ...n, reviewCount: (n.reviewCount||0)+1, lastReview: Date.now() } : n)), []);
  const handleReviewResult = useCallback((id, difficulty) => {
    setNotes(p => p.map(n => n.id === id ? { ...n, reviewCount: (n.reviewCount||0)+1, lastReview: Date.now() } : n));
    setReviewIdx(prev => prev + 1);
  }, []);

  const checkCn = (text) => { setCnWarn(/[\u4e00-\u9fff]/.test(text)); };

  const handleMovie = async () => {
    if (!movieLine.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await callAI(MOVIE_PROMPT(movieLine.trim(), movieName.trim()));
      setResult({ type: "movie", data });
      addNote("movie", movieLine.trim(), movieName.trim()||"未分类", data, data.auto_tags||[]);
      setMovieLine(""); setCnWarn(false);
    } catch (e) { setError("分析出错：" + e.message); }
    setLoading(false);
  };

  const handleReading = async () => {
    if (!readingSentence.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await callAI(READING_PROMPT(readingSentence.trim(), readingSource.trim()));
      setResult({ type: "reading", data });
      addNote("reading", readingSentence.trim(), readingSource.trim()||"新闻阅读", data, data.auto_tags||[]);
      setReadingSentence(""); setCnWarn(false);
    } catch (e) { setError("分析出错：" + e.message); }
    setLoading(false);
  };

  const dueNotes = getDueNotes(notes);
  const allTags = [...new Set(notes.flatMap(n => n.tags||[]))];
  const categories = [...new Set(notes.map(n => n.category))];
  const filtered = notes.filter(n => {
    if (noteType !== "all" && n.type !== noteType) return false;
    if (noteFilter !== "all" && n.category !== noteFilter) return false;
    if (tagFilter && !(n.tags||[]).includes(tagFilter)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return n.input.toLowerCase().includes(q) || (n.category||"").toLowerCase().includes(q) || (n.tags||[]).some(t=>t.includes(q)) ||
        n.data?.vocabulary?.some(v => v.word.toLowerCase().includes(q) || (v.meaning_cn||"").includes(q)) ||
        n.data?.phrases?.some(p => p.phrase.toLowerCase().includes(q));
    }
    return true;
  });

  const totalVocab = notes.reduce((a, n) => a + (n.data?.vocabulary?.length || 0), 0);
  const totalReviews = notes.reduce((a, n) => a + (n.reviewCount || 0), 0);

  /* ═══ THEME: #FF6B2C orange + Midnight Blue + Forest Green ═══ */
  /* ═══ REFINED PALETTE: neutral base + desaturated accents ═══ */
  const themes = {
    light: {
      "--bg":"#F8FAFC","--card":"#FFFFFF","--surface":"#F1F5F9","--warm":"#FFF8F3",
      "--border":"#E2E8F0","--fg":"#1E293B","--fg-dim":"#475569","--fg-muted":"#94A3B8",
      "--brand":"#F06225","--brand-dark":"#c44f1a","--brand-bg":"rgba(240,98,37,0.06)","--brand-text":"#F06225",
      "--emerald":"#059669","--emerald-bg":"rgba(5,150,105,0.06)",
      "--teal":"#0D9488","--teal-bg":"rgba(13,148,136,0.06)",
      "--navy":"#3B4FA8","--navy-bg":"rgba(59,79,168,0.06)",
      "--violet":"#7C3AED","--violet-bg":"rgba(124,58,237,0.06)",
      "--red":"#DC2626","--red-bg":"rgba(220,38,38,0.05)",
      "--input-bg":"#FFFFFF","--input-border":"#CBD5E1",
      "--header-bg":"rgba(248,250,252,0.80)",
      "--shadow-sm":"0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.03)",
      "--shadow-md":"0 4px 12px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)",
      "--shadow-lg":"0 12px 32px rgba(15,23,42,0.08), 0 4px 8px rgba(15,23,42,0.04)",
    },
    dark: {
      "--bg":"#0F1117","--card":"#181B25","--surface":"#1E2130","--warm":"#1E1D18",
      "--border":"#2A2E3D","--fg":"#F1F5F9","--fg-dim":"#CBD5E1","--fg-muted":"#64748B",
      "--brand":"#F5864C","--brand-dark":"#cc5a22","--brand-bg":"rgba(245,134,76,0.1)","--brand-text":"#FBB584",
      "--emerald":"#34D399","--emerald-bg":"rgba(52,211,153,0.1)",
      "--teal":"#2DD4BF","--teal-bg":"rgba(45,212,191,0.1)",
      "--navy":"#A8B8F8","--navy-bg":"rgba(168,184,248,0.1)",
      "--violet":"#C4B5FD","--violet-bg":"rgba(196,181,253,0.1)",
      "--red":"#FCA5A5","--red-bg":"rgba(252,165,165,0.08)",
      "--input-bg":"#1A1D28","--input-border":"#2D3348",
      "--header-bg":"rgba(15,17,23,0.80)",
      "--shadow-sm":"0 1px 3px rgba(0,0,0,0.2)",
      "--shadow-md":"0 4px 12px rgba(0,0,0,0.25)",
      "--shadow-lg":"0 12px 32px rgba(0,0,0,0.35)",
    },
  };
  const themeVars = dark ? themes.dark : themes.light;
  const cv = Object.entries(themeVars).map(([k,v])=>`${k}:${v}`).join(";");
  const themeStyle = Object.fromEntries(Object.entries(themeVars));
  const inp = { width:"100%",padding:"14px 18px",border:"1px solid var(--input-border)",borderRadius:12,fontSize:14,fontFamily:"var(--body)",background:"var(--input-bg)",outline:"none",color:"var(--fg)",transition:"all 0.2s",boxSizing:"border-box",lineHeight:1.6 };

  // Global styles (shared between login and main app)
  const globalStyles = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
      :root { --body:'Sora',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; --serif:'Source Serif 4',Georgia,serif; --mono:'JetBrains Mono',monospace; }
      * { box-sizing:border-box; margin:0 }
      @keyframes dot { 0%,80%,100%{transform:scale(.4);opacity:.3} 40%{transform:scale(1);opacity:1} }
      @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      @keyframes pageFlip { 0%{transform:rotateY(0);opacity:.9} 50%{transform:rotateY(-180deg);opacity:.3} 100%{transform:rotateY(0);opacity:.9} }
      @keyframes scanLine { 0%{transform:translateY(0)} 100%{transform:translateY(61px)} }
      @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
      textarea:focus,input:focus { border-color:var(--brand)!important; box-shadow:0 0 0 3px var(--brand-bg)!important }
      ::selection { background:var(--brand-bg); color:var(--brand) }
      ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
    `}</style>
  );

  // Loading state
  if (!authChecked) return (
    <div style={{ ...themeStyle, fontFamily: "var(--body)", minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {globalStyles}
      <div style={{ textAlign: "center" }}>
        <FramesLogo size={48} />
        <div style={{ marginTop: 16, fontSize: 14, color: "var(--fg-muted)" }}>加载中...</div>
      </div>
    </div>
  );

  // Main app (always accessible, guest or logged in)
  return (
    <div style={{ ...themeStyle, fontFamily: "var(--body)", minHeight: "100vh", background: "var(--bg)", color: "var(--fg)" }}>
      {globalStyles}
      {showRegPrompt && <RegisterPrompt onAuth={handleAuth} onClose={() => setShowRegPrompt(false)} noteCount={notes.length} />}

      {/* ═══ HEADER ═══ */}
      <header style={{ position:"sticky",top:0,zIndex:100,background:"var(--header-bg)",backdropFilter:"blur(20px) saturate(180%)",WebkitBackdropFilter:"blur(20px) saturate(180%)",borderBottom:"1px solid var(--border)" }}>
        <div style={{ maxWidth:860,margin:"0 auto",padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
            <FramesLogo size={34} />
            <div>
              <h1 style={{ fontSize:17,fontWeight:800,letterSpacing:-0.3,lineHeight:1.1,display:"flex",alignItems:"baseline",gap:6 }}>
                <span>Frames</span>
                <span style={{ fontSize:11,fontWeight:500,color:"var(--fg-muted)",fontFamily:"var(--serif)" }}>帧记</span>
              </h1>
              <p style={{ fontSize:9,color:"var(--fg-muted)",fontWeight:500,letterSpacing:0.5 }}>每一帧，都是进步</p>
            </div>
          </div>
          <nav style={{ display:"flex",gap:1,background:"var(--surface)",padding:3,borderRadius:11 }}>
            {[["movie","🎬","电影"],["reading","📰","阅读"],["review","📅",`复习(${dueNotes.length})`],["notes","🗂️",`笔记(${notes.length})`]].map(([k,ic,lb]) => (
              <button key={k} onClick={() => { setMode(k); setResult(null); setError(""); setReviewIdx(0); }} style={{
                padding:"6px 12px",border:"none",cursor:"pointer",borderRadius:9,fontSize:11,fontWeight:600,
                fontFamily:"var(--body)",display:"flex",alignItems:"center",gap:4,
                background:mode===k?"var(--card)":"transparent",color:mode===k?"var(--fg)":"var(--fg-muted)",
                boxShadow:mode===k?"0 1px 6px rgba(0,0,0,.04)":"none",transition:"all .2s",
              }}><span style={{fontSize:13}}>{ic}</span>{lb}</button>
            ))}
          </nav>
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <button onClick={()=>setDark(!dark)} style={{ width:32,height:32,borderRadius:9,border:"1px solid var(--border)",background:"var(--surface)",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{dark?"☀️":"🌙"}</button>
            {user ? (
              <UserMenu user={user} onLogout={handleLogout} />
            ) : (
              <button onClick={()=>setShowRegPrompt(true)} style={{
                height:32,padding:"0 14px",borderRadius:9,border:"none",
                background:"var(--brand)",cursor:"pointer",fontSize:12,fontWeight:700,
                fontFamily:"var(--body)",color:"#fff",display:"flex",alignItems:"center",gap:4,
                transition:"all 0.2s",
              }}>登录 / 注册</button>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth:860,margin:"0 auto",padding:"24px 18px 80px" }}>

        {/* Guest banner */}
        {!user && notes.length > 0 && (
          <div style={{ marginBottom:16,padding:"10px 18px",borderRadius:12,background:"var(--surface)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,fontSize:12,color:"var(--fg-dim)" }}>
            <span>🆓 免费体验中 · 已记录 <strong style={{ color:"var(--brand-text)" }}>{notes.length}</strong> / {FREE_LIMIT} 条</span>
            {notes.length >= FREE_LIMIT - 2 && (
              <button onClick={()=>setShowRegPrompt(true)} style={{ padding:"5px 14px",borderRadius:8,border:"none",background:"var(--brand)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--body)" }}>注册保存</button>
            )}
          </div>
        )}

        {/* ═══ MOVIE ═══ */}
        {mode === "movie" && (
          <div style={{ animation:"fadeUp .4s ease" }}>
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontSize:28,fontWeight:800,letterSpacing:-0.5 }}>
                <span style={{ fontFamily:"var(--serif)",fontStyle:"italic",fontWeight:400 }}>Watch</span> & Learn
              </h2>
              <p style={{ marginTop:5,fontSize:13,color:"var(--fg-dim)" }}>输入台词 → AI 解析 → 自动存档</p>
            </div>
            <div style={{ background:"var(--card)",borderRadius:18,padding:28,border:"1px solid var(--border)",boxShadow:"var(--shadow-md)" }}>
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:"var(--fg-muted)",marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:1.5 }}>电影名称</label>
                  <input value={movieName} onChange={e=>setMovieName(e.target.value)} placeholder="The Shawshank Redemption" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:"var(--fg-muted)",marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:1.5 }}>台词</label>
                  <textarea value={movieLine} onChange={e=>{ setMovieLine(e.target.value); checkCn(e.target.value); }}
                    placeholder='"Get busy living or get busy dying."' rows={3}
                    style={{ ...inp,fontFamily:"var(--serif)",fontSize:16,lineHeight:1.7,resize:"vertical" }}
                    onKeyDown={e=>{ if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleMovie(); }} />
                  {cnWarn && <div style={{ marginTop:6,fontSize:12,color:"var(--brand)",fontWeight:500 }}>💡 建议输入英文台词，分析效果更好</div>}
                </div>
                <div>
                  <div style={{ fontSize:10,fontWeight:600,color:"var(--fg-muted)",marginBottom:6 }}>🎬 试试这些经典台词：</div>
                  <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                    {MOVIE_EXAMPLES.slice(0,4).map((ex,i) => (
                      <button key={i} onClick={() => { setMovieLine(ex.line); setMovieName(ex.movie); setCnWarn(false); }}
                        style={{ padding:"5px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--surface)",fontSize:11,color:"var(--fg-dim)",cursor:"pointer",fontFamily:"var(--body)",transition:"all .15s",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                        {ex.movie}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleMovie} disabled={loading||!movieLine.trim()} style={{
                  padding:"12px 28px",border:"none",borderRadius:12,fontSize:14,fontWeight:700,fontFamily:"var(--body)",
                  cursor:loading?"wait":"pointer",background:loading?"var(--surface)":"linear-gradient(135deg,#FF6B2C,#FF8A56)",
                  color:loading?"var(--fg-muted)":"#fff",boxShadow:loading?"none":"0 4px 18px var(--brand-bg)",alignSelf:"flex-start",
                }}>✨ 分析台词</button>
              </div>
            </div>
            {loading && <Loader/>}
            {error && <div style={{ marginTop:14,padding:14,background:"var(--red-bg)",borderRadius:12,color:"var(--red)",fontSize:13,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10 }}>
              <span>{error}</span>
              <button onClick={handleMovie} style={{ padding:"6px 14px",borderRadius:8,border:"1.5px solid var(--red)",background:"transparent",color:"var(--red)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--body)",whiteSpace:"nowrap" }}>重试</button>
            </div>}
            {result?.type==="movie" && (
              <div ref={resRef} style={{ marginTop:20,background:"var(--card)",borderRadius:18,padding:24,border:"1px solid var(--border)",borderLeft:"3px solid var(--brand)",boxShadow:"var(--shadow-md)",animation:"fadeUp .4s ease" }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16,paddingBottom:14,borderBottom:"1px solid var(--border)" }}>
                  <span style={{ fontSize:13,fontWeight:700,color:"var(--emerald)" }}>✓ 已保存</span>
                  {movieName && <span style={{ fontSize:12,color:"var(--fg-muted)" }}>→ {movieName}</span>}
                  {result.data?.auto_tags?.map((t,i) => <span key={i} style={{ fontSize:10,color:"var(--violet)",background:"var(--violet-bg)",padding:"1px 7px",borderRadius:5,fontWeight:600 }}>#{t}</span>)}
                </div>
                <MovieDetail data={result.data} />
              </div>
            )}
          </div>
        )}


        {/* ═══ READING ═══ */}
        {mode === "reading" && (
          <div style={{ animation:"fadeUp .4s ease" }}>
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontSize:28,fontWeight:800,letterSpacing:-0.5 }}>
                <span style={{ fontFamily:"var(--serif)",fontStyle:"italic",fontWeight:400 }}>Read</span> & Decode
              </h2>
              <p style={{ marginTop:5,fontSize:13,color:"var(--fg-dim)" }}>粘贴新闻长难句 → AI 拆解语法结构 → 提取进阶词汇</p>
            </div>
            <div style={{ background:"var(--card)",borderRadius:18,padding:28,border:"1px solid var(--border)",boxShadow:"var(--shadow-md)" }}>
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:"var(--fg-muted)",marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:1.5 }}>来源 <span style={{ fontWeight:400,textTransform:"none",letterSpacing:0 }}>（用于分类，如 BBC / NYT / The Economist）</span></label>
                  <input value={readingSource} onChange={e=>setReadingSource(e.target.value)} placeholder="The Economist" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:"var(--fg-muted)",marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:1.5 }}>句子</label>
                  <textarea value={readingSentence} onChange={e=>{ setReadingSentence(e.target.value); checkCn(e.target.value); }}
                    placeholder="粘贴你看不懂的英文句子..." rows={4}
                    style={{ ...inp,fontFamily:"var(--serif)",fontSize:16,lineHeight:1.7,resize:"vertical" }}
                    onKeyDown={e=>{ if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleReading(); }} />
                  {cnWarn && <div style={{ marginTop:6,fontSize:12,color:"var(--brand)",fontWeight:500 }}>💡 建议输入英文句子，分析效果更好</div>}
                </div>
                <div style={{ padding:"10px 14px",background:"var(--warm)",borderRadius:10,fontSize:12,color:"var(--fg-dim)",lineHeight:1.6 }}>
                  💡 适合输入：新闻长难句、学术文章句子、公开演讲等。AI 会拆解语法结构，并只提取<strong style={{ color:"var(--fg)" }}>大学四级以上</strong>的生词。
                </div>
                <button onClick={handleReading} disabled={loading||!readingSentence.trim()} style={{
                  padding:"12px 28px",border:"none",borderRadius:12,fontSize:14,fontWeight:700,fontFamily:"var(--body)",
                  cursor:loading?"wait":"pointer",background:loading?"var(--surface)":"linear-gradient(135deg,var(--navy),#2d3561)",
                  color:loading?"var(--fg-muted)":"#fff",boxShadow:loading?"none":"0 4px 18px var(--navy-bg)",alignSelf:"flex-start",
                }}>🧩 拆解句子</button>
              </div>
            </div>
            {loading && <Loader/>}
            {error && <div style={{ marginTop:14,padding:14,background:"var(--red-bg)",borderRadius:12,color:"var(--red)",fontSize:13,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10 }}>
              <span>{error}</span>
              <button onClick={handleReading} style={{ padding:"6px 14px",borderRadius:8,border:"1.5px solid var(--red)",background:"transparent",color:"var(--red)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--body)",whiteSpace:"nowrap" }}>重试</button>
            </div>}
            {result?.type==="reading" && (
              <div ref={resRef} style={{ marginTop:20,background:"var(--card)",borderRadius:18,padding:24,border:"1px solid var(--border)",borderLeft:"3px solid var(--navy)",boxShadow:"var(--shadow-md)",animation:"fadeUp .4s ease" }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16,paddingBottom:14,borderBottom:"1px solid var(--border)" }}>
                  <span style={{ fontSize:13,fontWeight:700,color:"var(--emerald)" }}>✓ 已保存</span>
                  {readingSource && <span style={{ fontSize:12,color:"var(--fg-muted)" }}>→ {readingSource}</span>}
                  {result.data?.auto_tags?.map((t,i) => <span key={i} style={{ fontSize:10,color:"var(--violet)",background:"var(--violet-bg)",padding:"1px 7px",borderRadius:5,fontWeight:600 }}>#{t}</span>)}
                </div>
                <ReadingDetail data={result.data} />
              </div>
            )}
          </div>
        )}

        {/* ═══ REVIEW ═══ */}
        {mode === "review" && (
          <div style={{ animation:"fadeUp .4s ease" }}>
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:28,fontWeight:800,letterSpacing:-0.5 }}>
                <span style={{ fontFamily:"var(--serif)",fontStyle:"italic",fontWeight:400 }}>Daily</span> Review
              </h2>
              <p style={{ marginTop:5,fontSize:13,color:"var(--fg-dim)" }}>间隔复习：1 → 3 → 7 → 14 → 30 天</p>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:24 }}>
              {[
                { label:"待复习",value:dueNotes.length,color:"var(--brand)",icon:"📅" },
                { label:"已掌握词汇",value:totalVocab,color:"var(--emerald)",icon:"📖" },
                { label:"累计复习",value:totalReviews,color:"var(--navy)",icon:"🔁" },
              ].map((s,i) => (
                <div key={i} style={{ background:"var(--card)",borderRadius:14,padding:"18px 20px",border:"1px solid var(--border)",boxShadow:"var(--shadow-sm)",textAlign:"center" }}>
                  <div style={{ fontSize:20,marginBottom:6 }}>{s.icon}</div>
                  <div style={{ fontSize:22,fontWeight:800,color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:11,color:"var(--fg-muted)",marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {dueNotes.length === 0 ? (
              <div style={{ textAlign:"center",padding:"50px 20px",background:"var(--card)",borderRadius:18,border:"1px solid var(--border)",boxShadow:"var(--shadow-sm)" }}>
                <div style={{ fontSize:44,marginBottom:12 }}>🎉</div>
                <div style={{ fontSize:16,fontWeight:700,color:"var(--fg)" }}>今日复习完成！</div>
                <div style={{ fontSize:13,color:"var(--fg-muted)",marginTop:4 }}>明天再来，保持学习节奏</div>
              </div>
            ) : (
              <div>
                <div style={{ textAlign:"center",fontSize:12,color:"var(--fg-muted)",marginBottom:16 }}>{reviewIdx + 1} / {dueNotes.length}</div>
                {reviewIdx < dueNotes.length ? (
                  <Flashcard note={dueNotes[reviewIdx]} onResult={handleReviewResult} />
                ) : (
                  <div style={{ textAlign:"center",padding:"50px 20px",background:"var(--card)",borderRadius:18,border:"1px solid var(--border)",boxShadow:"var(--shadow-sm)" }}>
                    <div style={{ fontSize:44,marginBottom:12 }}>🎉</div>
                    <div style={{ fontSize:16,fontWeight:700,color:"var(--fg)" }}>本轮复习完成！</div>
                    <button onClick={()=>setReviewIdx(0)} style={{ marginTop:14,padding:"10px 24px",borderRadius:10,border:"1.5px solid var(--brand)",background:"var(--brand-bg)",color:"var(--brand)",fontWeight:700,cursor:"pointer",fontFamily:"var(--body)",fontSize:13 }}>再来一轮</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ NOTES ═══ */}
        {mode === "notes" && (
          <div style={{ animation:"fadeUp .4s ease" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:14 }}>
              <div>
                <h2 style={{ fontSize:28,fontWeight:800,letterSpacing:-0.5 }}>
                  <span style={{ fontFamily:"var(--serif)",fontStyle:"italic",fontWeight:400 }}>My</span> Notebook
                </h2>
                <p style={{ marginTop:5,fontSize:13,color:"var(--fg-dim)" }}>{notes.length > 0 ? `${notes.length} 条笔记 · ${totalVocab} 个词汇` : "开始学习来创建笔记"}</p>
              </div>
              {notes.length > 0 && (
                <div style={{ display:"flex",gap:6 }}>
                  <button onClick={()=>exportMD(notes)} style={{ padding:"8px 16px",border:"none",borderRadius:10,background:"var(--surface)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--body)",color:"var(--fg)" }}>📥 MD</button>
                  <button onClick={()=>exportAnki(notes)} style={{ padding:"8px 16px",border:"none",borderRadius:10,background:"var(--surface)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--body)",color:"var(--fg)" }}>🃏 Anki</button>
                </div>
              )}
            </div>
            {notes.length > 0 && (
              <>
                <div style={{ position:"relative",marginBottom:12 }}>
                  <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"var(--fg-muted)" }}>🔍</span>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索台词、生词、词组..." style={{ ...inp,paddingLeft:36,fontSize:13 }} />
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:6,marginBottom:16 }}>
                  <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
                    <TagBtn label={`全部(${notes.length})`} active={noteType==="all"} onClick={()=>{ setNoteType("all"); setNoteFilter("all"); }} />
                    <TagBtn label={`🎬 电影(${notes.filter(n=>n.type==="movie").length})`} active={noteType==="movie"} onClick={()=>setNoteType(noteType==="movie"?"all":"movie")} color="var(--brand)" />
                    <TagBtn label={`📰 阅读(${notes.filter(n=>n.type==="reading").length})`} active={noteType==="reading"} onClick={()=>setNoteType(noteType==="reading"?"all":"reading")} color="var(--navy)" />
                    {categories.length > 1 && <>
                      <div style={{ width:1,height:18,background:"var(--border)",margin:"0 2px",alignSelf:"center" }} />
                      {categories.map(c => <TagBtn key={c} label={c} active={noteFilter===c} onClick={()=>setNoteFilter(noteFilter===c?"all":c)} color="var(--navy)" />)}
                    </>}
                  </div>
                  {allTags.length > 0 && (
                    <div style={{ display:"flex",gap:4,flexWrap:"wrap",alignItems:"center" }}>
                      <span style={{ fontSize:10,color:"var(--fg-muted)",fontWeight:600 }}>标签:</span>
                      {allTags.map(t => <TagBtn key={t} label={`#${t}`} active={tagFilter===t} onClick={()=>setTagFilter(tagFilter===t?"":t)} color="var(--violet)" />)}
                    </div>
                  )}
                </div>
              </>
            )}
            {filtered.length === 0 ? (
              <div style={{ textAlign:"center",padding:"50px 20px",background:"var(--card)",borderRadius:18,border:"1px solid var(--border)",boxShadow:"var(--shadow-sm)" }}>
                <div style={{ fontSize:44,marginBottom:12 }}>{search?"🔍":"📭"}</div>
                <div style={{ fontSize:15,fontWeight:600 }}>{search ? "没有匹配笔记" : "还没有笔记"}</div>
                <div style={{ fontSize:12,color:"var(--fg-muted)",marginTop:3 }}>{search ? "试试其他关键词" : "去电影或阅读模式开始学习"}</div>
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {filtered.map((n,i) => <div key={n.id} style={{ animation:`fadeUp .3s ease ${Math.min(i*.03,.25)}s both` }}><NoteCard note={n} onDelete={deleteNote} onReview={reviewNote} /></div>)}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
