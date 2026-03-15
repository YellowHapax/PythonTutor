import { useState, useRef, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { id: 1, title: "Variable Thinking",      color: "#7F77DD" },
  { id: 2, title: "Sequences & Loops",      color: "#1D9E75" },
  { id: 3, title: "Functions & Parameters", color: "#D85A30" },
  { id: 4, title: "NumPy & Equations",      color: "#378ADD" },
  { id: 5, title: "Classes & Simulation",   color: "#EF9F27" },
];

const SYSTEM_PROMPT = `You are a Python tutor teaching someone who can read Python but wants to "think in Python". Your goal is to build them toward understanding this kind of code:

B_next = B * (1 - lam) + I * lam  # MBD equation

You teach in 5 stages:
1. Variable Thinking — assignment, mutation, reference (a = b, lists, a=[1,2,3]; b=a; b.append(4))
2. Sequences & Loops — for loops, range, accumulation, list comprehension, iterating state forward
3. Functions & Parameters — def, arguments, return values, default params (lambda as a param)
4. NumPy & Equations — arrays as vectors, scalar ops, the MBD equation as a one-liner
5. Classes & Simulation — agents as objects, simulation loops, reading MBD lab code

Current stage: {STAGE_TITLE} (Stage {STAGE_NUM} of 5)

Rules:
- Keep responses CONCISE (3-6 sentences max for explanations, short code blocks)
- Use only concepts from the current stage and earlier
- Always use concrete, runnable Python examples
- When giving exercises, give ONE clear exercise only
- When checking answers, be brief: say if correct, fix mistakes tersely, move on
- Format code in triple backticks with python
- If user says "next" or asks to advance, give the first concept of the next stage
- Connect concepts to MBD when natural (e.g., "this is how B(t+1) will work later")
- Use the word "exercise" to signal a challenge
- Do NOT give long essays. Short, sharp, teacherly.`;

const STAGE_INTROS = [
  `Let's start with how Python thinks about variables and memory.

Here's something that surprises most people:

\`\`\`python
a = [1, 2, 3]
b = a
b.append(4)
print(a)  # [1, 2, 3, 4]
\`\`\`

\`b = a\` doesn't copy the list — it makes \`b\` point to the same list. Both names see the change.

Exercise: What does this print, and why?
\`\`\`python
x = 10
y = x
y = 99
print(x)
\`\`\``,

  `Now we iterate. The most important pattern in MBD is "update a value over time" — that's just a loop.

\`\`\`python
B = 0.5
for t in range(5):
    B = B * 0.9
    print(round(B, 3))
\`\`\`

Each step, B overwrites itself. This is exactly how B(t+1) = B(t)·(1−λ) will work.

Exercise: Modify the loop to also print \`t\` alongside B.`,

  `Functions let you name a calculation and reuse it with different inputs.

\`\`\`python
def update_baseline(B, I, lam=0.3):
    return B * (1 - lam) + I * lam
\`\`\`

\`lam=0.3\` is a default — you can override it. This is the MBD equation as a function.

\`\`\`python
print(update_baseline(0.5, 1.0))        # lam=0.3
print(update_baseline(0.5, 1.0, 0.8))   # lam=0.8
\`\`\`

Exercise: Call this function 5 times in a loop, feeding the output back as the new B. Start with B=0.2, I=0.9, lam=0.4.`,

  `NumPy lets us treat a whole vector of values as one variable.

\`\`\`python
import numpy as np

B = np.array([0.2, 0.5, 0.8])
I = np.array([1.0, 0.0, 0.5])
lam = 0.3

B_next = B * (1 - lam) + I * lam
print(B_next)  # [0.44 0.35 0.71]
\`\`\`

One line updates all three dimensions at once. That's the MBD equation, fully implemented.

Exercise: What happens if you set \`lam = 0.0\`? What about \`lam = 1.0\`? Try both and explain what they mean for memory.`,

  `Now we wrap an agent in a class — state + behavior together.

\`\`\`python
import numpy as np

class Agent:
    def __init__(self, baseline, lam=0.3):
        self.B = np.array(baseline)
        self.lam = lam

    def update(self, I):
        self.B = self.B * (1 - self.lam) + np.array(I) * self.lam
        return self.B.copy()

agent = Agent([0.5, 0.5], lam=0.3)
for _ in range(4):
    print(agent.update([1.0, 0.0]))
\`\`\`

This is the structure of every lab in the MBD framework.

Exercise: Create two agents with different \`lam\` values. Run both for 10 steps with the same input \`[1.0, 0.0]\`. Print their final B vectors side by side.`,
];

// OpenRouter config
const OR_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL    = "anthropic/claude-sonnet-4-5";

// ─── Design tokens ────────────────────────────────────────────────────────────

const D = {
  bg:       "#0f1117",
  surface:  "#1a1d27",
  surface2: "#22263a",
  border:   "#2e3248",
  text:     "#e8eaf0",
  muted:    "#8b90a8",
  hint:     "#555a72",
  warn:     "#f0834a",
  warnBg:   "#1e100a",
  warnBorder:"#3a1a0a",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  stageChange?: boolean;
  stageNum?: number;
}

// ─── renderContent ────────────────────────────────────────────────────────────
// Handles fenced code blocks and inline backtick spans.

function renderContent(text: string) {
  const parts: { type: "code" | "prose"; content: string }[] = [];
  const fenceRe = /```(?:\w+)?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "prose", content: text.slice(last, m.index) });
    parts.push({ type: "code", content: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "prose", content: text.slice(last) });

  return parts.map((p, i) => {
    if (p.type === "code") {
      return (
        <pre
          key={i}
          style={{
            background: "#0a0c13",
            border: `1px solid ${D.border}`,
            borderRadius: 8,
            padding: "11px 14px",
            margin: "10px 0",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            lineHeight: 1.65,
            overflowX: "auto",
            color: "#c9d1e8",
          }}
        >
          {p.content}
        </pre>
      );
    }

    // Prose — render inline backticks as <code>
    const inlineRe = /`([^`]+)`/g;
    const spans: React.ReactNode[] = [];
    let last2 = 0;
    let m2: RegExpExecArray | null;
    while ((m2 = inlineRe.exec(p.content)) !== null) {
      if (m2.index > last2) spans.push(<span key={`t${last2}`}>{p.content.slice(last2, m2.index)}</span>);
      spans.push(
        <code
          key={`c${m2.index}`}
          style={{
            background: "#0a0c13",
            border: `1px solid ${D.border}`,
            borderRadius: 4,
            padding: "1px 5px",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "#c9d1e8",
          }}
        >
          {m2[1]}
        </code>
      );
      last2 = m2.index + m2[0].length;
    }
    if (last2 < p.content.length) spans.push(<span key={`t${last2}`}>{p.content.slice(last2)}</span>);

    return (
      <span key={i} style={{ whiteSpace: "pre-wrap" }}>
        {spans}
      </span>
    );
  });
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [stage, setStage]       = useState(0);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: STAGE_INTROS[0] }]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);

  // API key — persisted to localStorage
  const [apiKey, setApiKey]       = useState(() => localStorage.getItem("or_key") ?? "");
  const [keyDraft, setKeyDraft]   = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const systemPrompt = SYSTEM_PROMPT
    .replace("{STAGE_TITLE}", STAGES[stage].title)
    .replace("{STAGE_NUM}",   String(stage + 1));

  // ── Key management ──────────────────────────────────────────────────────────

  function saveKey(raw: string) {
    const trimmed = raw.trim();
    setApiKey(trimmed);
    localStorage.setItem("or_key", trimmed);
    setShowKeyInput(false);
    setKeyDraft("");
  }

  function clearKey() {
    setApiKey("");
    localStorage.removeItem("or_key");
    setShowKeyInput(false);
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    if (!apiKey) {
      // Nudge user to enter key instead of silently doing nothing
      setShowKeyInput(true);
      return;
    }

    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    const advanceStage = /\b(next stage|move on|advance|next)\b/i.test(text);

    try {
      const res = await fetch(OR_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer":  "https://github.com/YellowHapax/PythonTutor",
          "X-Title":       "PythonTutor",
        },
        body: JSON.stringify({
          model:      OR_MODEL,
          max_tokens: 1000,
          messages: [
            { role: "system", content: systemPrompt },
            ...newMessages.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      const data = await res.json();

      // OpenRouter surfaces API errors in data.error
      const reply: string =
        data.choices?.[0]?.message?.content ??
        (data.error ? `Error: ${data.error.message}` : "Sorry, something went wrong.");

      let newStage = stage;
      if (advanceStage && stage < 4) newStage = stage + 1;

      setMessages(prev => [...prev, { role: "assistant", content: reply }]);

      if (newStage !== stage) {
        setTimeout(() => {
          setStage(newStage);
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: STAGE_INTROS[newStage], stageChange: true, stageNum: newStage },
          ]);
        }, 400);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function goToStage(i: number) {
    setStage(i);
    setMessages([{ role: "assistant", content: STAGE_INTROS[i] }]);
  }

  const s          = STAGES[stage];
  const keyMasked  = apiKey ? `sk-or-…${apiKey.slice(-4)}` : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight:      "100vh",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        background:     D.bg,
        padding:        "24px 16px",
      }}
    >
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        width:         "100%",
        maxWidth:      860,
        height:        "90vh",
        maxHeight:     760,
        background:    D.bg,
        color:         D.text,
        fontFamily:    "var(--font-sans)",
        borderRadius:  16,
        border:        `1px solid ${D.border}`,
        overflow:      "hidden",
        boxShadow:     "0 8px 40px rgba(0,0,0,0.5)",
      }}
    >
      {/* ── Header: stage tabs + key widget ── */}
      <div style={{ padding: "12px 14px 0", borderBottom: `1px solid ${D.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>

          {/* Stage tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
            {STAGES.map((st, i) => (
              <button
                key={i}
                onClick={() => goToStage(i)}
                style={{
                  padding:     "5px 12px",
                  borderRadius: 20,
                  fontSize:    12,
                  cursor:      "pointer",
                  background:  i === stage ? st.color : D.surface2,
                  color:       i === stage ? "#fff"   : D.muted,
                  border:      i === stage ? "none"   : `1px solid ${D.border}`,
                  fontWeight:  i === stage ? 500      : 400,
                  transition:  "background 0.15s",
                }}
              >
                {i + 1}. {st.title}
              </button>
            ))}
          </div>

          {/* API key widget */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {showKeyInput ? (
              <>
                <input
                  autoFocus
                  type="password"
                  value={keyDraft}
                  onChange={e => setKeyDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter")  saveKey(keyDraft);
                    if (e.key === "Escape") setShowKeyInput(false);
                  }}
                  placeholder="sk-or-v1-..."
                  style={{
                    width:       180,
                    padding:     "4px 8px",
                    borderRadius: 8,
                    background:  D.surface2,
                    border:      `1px solid ${D.border}`,
                    color:       D.text,
                    fontSize:    12,
                    fontFamily:  "var(--font-mono)",
                    outline:     "none",
                  }}
                />
                <button
                  onClick={() => saveKey(keyDraft)}
                  style={{ padding: "4px 10px", borderRadius: 8, fontSize: 12, background: s.color, color: "#fff", border: "none", cursor: "pointer" }}
                >
                  Save
                </button>
                {apiKey && (
                  <button
                    onClick={clearKey}
                    title="Remove key"
                    style={{ padding: "4px 8px", borderRadius: 8, fontSize: 12, background: D.warnBg, color: D.warn, border: `1px solid ${D.warnBorder}`, cursor: "pointer" }}
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setShowKeyInput(false)}
                  style={{ padding: "4px 8px", borderRadius: 8, fontSize: 12, background: D.surface2, color: D.muted, border: `1px solid ${D.border}`, cursor: "pointer" }}
                >
                  ✕
                </button>
              </>
            ) : (
              <button
                onClick={() => { setKeyDraft(apiKey); setShowKeyInput(true); }}
                style={{
                  padding:      "4px 10px",
                  borderRadius:  8,
                  fontSize:     12,
                  cursor:       "pointer",
                  background:   apiKey ? D.surface2        : D.warnBg,
                  color:        apiKey ? D.muted           : D.warn,
                  border:       `1px solid ${apiKey ? D.border : D.warnBorder}`,
                  fontWeight:   apiKey ? 400 : 500,
                }}
              >
                {apiKey ? `🔑 ${keyMasked}` : "🔑 Enter OpenRouter key"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── No-key banner ── */}
      {!apiKey && (
        <div
          style={{
            padding:      "8px 14px",
            background:   D.warnBg,
            borderBottom: `1px solid ${D.warnBorder}`,
            fontSize:     12,
            color:        D.warn,
            textAlign:    "center",
          }}
        >
          To chat, paste your{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: D.warn, textDecoration: "underline" }}>
            free OpenRouter API key
          </a>{" "}
          above. It never leaves your browser.
        </div>
      )}

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 0" }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}
          >
            {m.stageChange && m.stageNum !== undefined && (
              <div
                style={{ alignSelf: "center", fontSize: 11, color: D.hint, borderTop: `1px solid ${D.border}`, padding: "6px 16px", marginBottom: 8 }}
              >
                ── Stage {m.stageNum + 1}: {STAGES[m.stageNum].title} ──
              </div>
            )}
            <div
              style={{
                maxWidth:     "90%",
                background:   m.role === "user" ? s.color   : D.surface,
                color:        m.role === "user" ? "#fff"    : D.text,
                borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                padding:      "10px 14px",
                fontSize:     14,
                lineHeight:   1.7,
                border:       m.role === "assistant" ? `1px solid ${D.border}` : "none",
              }}
            >
              {renderContent(m.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display:      "inline-block",
                background:   D.surface,
                border:       `1px solid ${D.border}`,
                borderRadius: "14px 14px 14px 4px",
                padding:      "10px 14px",
                fontSize:     13,
                color:        D.muted,
              }}
            >
              thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick actions ── */}
      <div style={{ padding: "8px 14px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["Give me a hint", "Show me the answer", "Next stage →"].map(q => (
          <button
            key={q}
            onClick={() => send(q)}
            style={{
              padding:      "4px 10px",
              borderRadius:  16,
              fontSize:     12,
              cursor:       "pointer",
              background:   D.surface2,
              color:        D.muted,
              border:       `1px solid ${D.border}`,
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* ── Input row ── */}
      <div style={{ padding: 12, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize(); }}
          onKeyDown={handleKey}
          placeholder={apiKey ? "Type your answer or code… (Shift+Enter for newline)" : "Enter your OpenRouter key above to start →"}
          style={{
            flex:         1,
            fontFamily:   "var(--font-mono)",
            fontSize:     13,
            padding:      "9px 13px",
            minHeight:    40,
            maxHeight:    160,
            background:   D.surface2,
            border:       `1px solid ${apiKey ? D.border : D.warnBorder}`,
            borderRadius:  10,
            color:        D.text,
            outline:      "none",
            opacity:      apiKey ? 1 : 0.6,
            resize:       "none",
            overflowY:    "auto",
            lineHeight:   1.5,
          }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            padding:      "9px 18px",
            borderRadius:  10,
            cursor:       loading || !input.trim() ? "default" : "pointer",
            height:       40,
            background:   input.trim() ? s.color : D.surface2,
            color:        input.trim() ? "#fff"  : D.hint,
            border:       "none",
            fontSize:     14,
            fontWeight:   500,
          }}
        >
          Send
        </button>
      </div>
    </div>
    </div>
  );
}
