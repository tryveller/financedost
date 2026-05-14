import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Priya — Personal Finance Agent Demo" },
      {
        name: "description",
        content:
          "Two-session financial assistant demo: persistent memory, disciplined tool usage, judgment.",
      },
    ],
  }),
});

type Session = 1 | 2;
type Memory = {
  facts: string[];
  reminders: { date: string; content: string; id: string }[];
  session_log: { date: string; summary: string }[];
};
type ToolEvent = { name: string; args: unknown; result: unknown };
type UIMsg = {
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
};

const EMPTY_MEMORY: Memory = { facts: [], reminders: [], session_log: [] };
const MEM_KEY = "priya_agent_memory";
const SESSION_KEY = "priya_agent_session";
const CHAT_PREFIX = "priya_agent_chat_s";

const SAMPLE_TURNS: Record<Session, string[]> = {
  1: [
    "I just got my salary credited. Help me figure out how much I can realistically save this month.",
    "I feel like I'm spending too much on food delivery. How much did I actually spend on it last month?",
    "Okay that's worse than I thought. Let's say I want to cut that in half AND put aside ₹30,000 for my house fund this month — is that realistic given my upcoming bills?",
    "Got it. Remind me to actually transfer the ₹30,000 to my house fund on the 25th.",
  ],
  2: ["Hey, my colleague is selling his MacBook for ₹80,000, barely used. I've been wanting to upgrade. Should I buy it?"],
};

function todayFor(s: Session) {
  return s === 1 ? "2025-11-03 (Mon)" : "2025-11-06 (Thu)";
}

function Index() {
  const [session, setSession] = useState<Session>(1);
  const [memory, setMemory] = useState<Memory>(EMPTY_MEMORY);
  const [chat, setChat] = useState<UIMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const m = localStorage.getItem(MEM_KEY);
      if (m) setMemory(JSON.parse(m));
      const s = localStorage.getItem(SESSION_KEY);
      if (s === "1" || s === "2") setSession(Number(s) as Session);
    } catch {}
  }, []);

  // Load chat for current session
  useEffect(() => {
    try {
      const c = localStorage.getItem(CHAT_PREFIX + session);
      setChat(c ? JSON.parse(c) : []);
    } catch {
      setChat([]);
    }
  }, [session]);

  useEffect(() => {
    localStorage.setItem(CHAT_PREFIX + session, JSON.stringify(chat));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, session]);

  useEffect(() => {
    localStorage.setItem(MEM_KEY, JSON.stringify(memory));
  }, [memory]);

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, String(session));
  }, [session]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: UIMsg[] = [...chat, { role: "user", content: text }];
    setChat(next);
    setInput("");
    setBusy(true);

    // Build ModelMessages from full chat history
    const modelMessages: ModelMessage[] = next.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: modelMessages, memory, session }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        text: string;
        toolEvents: ToolEvent[];
        newReminders: { date: string; content: string; id: string }[];
      };
      setChat((c) => [
        ...c,
        { role: "assistant", content: data.text, toolEvents: data.toolEvents },
      ]);
      if (data.newReminders.length) {
        setMemory((m) => {
          const existingIds = new Set(m.reminders.map((r) => r.id));
          const fresh = data.newReminders.filter((r) => !existingIds.has(r.id));
          return fresh.length ? { ...m, reminders: [...m.reminders, ...fresh] } : m;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      toast.error(msg);
      setChat((c) => c.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function endSessionAndExtract() {
    if (!chat.length || extracting) return;
    setExtracting(true);
    try {
      const transcript = chat
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");
      const res = await fetch("/api/extract-memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { new_facts: string[]; summary: string };
      setMemory((m) => {
        const merged = [...m.facts];
        for (const f of data.new_facts) if (!merged.includes(f)) merged.push(f);
        const date = todayFor(session).split(" ")[0];
        const lastLog = m.session_log[m.session_log.length - 1];
        const logEntry = { date, summary: data.summary };
        const session_log =
          lastLog && lastLog.date === date && lastLog.summary === data.summary
            ? m.session_log
            : [...m.session_log, logEntry];
        return { ...m, facts: merged, session_log };
      });
      toast.success(
        `Extracted ${data.new_facts.length} fact(s). Switch to Session ${session === 1 ? 2 : 1} to see memory carry over.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setExtracting(false);
    }
  }

  function resetAll() {
    if (!confirm("Wipe memory and both session chats?")) return;
    setMemory(EMPTY_MEMORY);
    setChat([]);
    localStorage.removeItem(CHAT_PREFIX + 1);
    localStorage.removeItem(CHAT_PREFIX + 2);
    toast.success("Reset.");
  }

  const memoryEmpty =
    !memory.facts.length && !memory.reminders.length && !memory.session_log.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-right" />
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight term-glow" style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", letterSpacing: "0.05em" }}>
              ┌─[PRIYA@finance-agent]─$ ./run
            </h1>
            <p className="text-sm text-muted-foreground">
              &gt; two-session demo · persistent memory · disciplined tool usage<span className="term-cursor"></span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setSession(1)}
                className={`px-3 py-1.5 text-sm ${session === 1 ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
              >
                Session 1
              </button>
              <button
                onClick={() => setSession(2)}
                className={`px-3 py-1.5 text-sm ${session === 2 ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
              >
                Session 2
              </button>
            </div>
            <Badge variant="secondary">Today: {todayFor(session)}</Badge>
            <Button variant="outline" size="sm" onClick={resetAll}>
              Reset
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col h-[calc(100vh-180px)]">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {chat.length === 0 ? (
                <div className="text-sm text-muted-foreground space-y-3">
                  <p>
                    Empty chat for Session {session}. Try a sample turn or type your own.
                  </p>
                  <div className="space-y-2">
                    {SAMPLE_TURNS[session].map((t) => (
                      <button
                        key={t}
                        onClick={() => send(t)}
                        className="block w-full text-left text-sm rounded-md border px-3 py-2 hover:bg-accent"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chat.map((m, i) => (
                  <div key={i} className="space-y-2">
                    <div
                      className={`text-xs uppercase tracking-wide font-bold ${m.role === "user" ? "text-destructive" : "text-primary term-glow"}`}
                    >
                      {m.role === "user" ? "user@priya:~$" : "agent@finance:~#"}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                    {m.toolEvents && m.toolEvents.length > 0 && (
                      <details className="rounded-md border bg-muted/40 p-2 text-xs">
                        <summary className="cursor-pointer font-medium">
                          {m.toolEvents.length} tool call{m.toolEvents.length > 1 ? "s" : ""}
                        </summary>
                        <div className="mt-2 space-y-2">
                          {m.toolEvents.map((ev, j) => (
                            <div key={j} className="rounded bg-background p-2">
                              <div className="font-mono text-xs">
                                <span className="text-primary">{ev.name}</span>(
                                {JSON.stringify(ev.args)})
                              </div>
                              <pre className="mt-1 text-xs whitespace-pre-wrap break-words text-muted-foreground">
                                {JSON.stringify(ev.result, null, 2).slice(0, 600)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))
              )}
              {busy && <div className="text-sm text-muted-foreground italic">thinking…</div>}
            </div>
            <div className="border-t p-3 space-y-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Message Priya's agent (Session ${session})…`}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={endSessionAndExtract}
                  disabled={extracting || !chat.length}
                >
                  {extracting ? "Extracting…" : "End session & extract memory"}
                </Button>
                <Button size="sm" onClick={() => send(input)} disabled={busy || !input.trim()}>
                  Send
                </Button>
              </div>
            </div>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-2">Persistent memory</h2>
            {memoryEmpty ? (
              <p className="text-xs text-muted-foreground">
                Empty. Run Session 1, click <em>End session & extract memory</em>, then switch to
                Session 2.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                {memory.facts.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Facts</div>
                    <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                      {memory.facts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {memory.reminders.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Reminders</div>
                    <ul className="space-y-1 text-muted-foreground">
                      {memory.reminders.map((r, i) => (
                        <li key={i}>
                          <span className="font-mono">{r.date}</span> — {r.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {memory.session_log.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Past sessions</div>
                    <ul className="space-y-1 text-muted-foreground">
                      {memory.session_log.map((s, i) => (
                        <li key={i}>
                          <span className="font-mono">{s.date}</span> — {s.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-4 text-xs text-muted-foreground space-y-2">
            <h2 className="text-sm font-semibold text-foreground">How to demo</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>Stay on Session 1. Run all 4 sample turns.</li>
              <li>Click <em>End session & extract memory</em>.</li>
              <li>Switch to Session 2 (date jumps to Nov 6).</li>
              <li>Send the MacBook turn — agent recalls the ₹30k plan and re-fetches live balance.</li>
            </ol>
          </Card>
        </aside>
      </main>
    </div>
  );
}
