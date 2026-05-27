import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileText,
  Link2,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { createBlankInput, createRelayDraft, relayTemplate, sampleRelayInput } from "./relay";
import type { RelayDraft, RelayDraftInput, RelayTask, TaskStatus } from "./types";
import "./styles.css";

const STORAGE_KEY = "relay:workspace:v1";

type SavedState = {
  input: RelayDraftInput;
  draft: RelayDraft | null;
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  complete: "Complete",
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

function loadSavedState(): SavedState {
  if (typeof window === "undefined") return { input: createBlankInput(), draft: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { input: createBlankInput(), draft: null };
    const parsed = JSON.parse(raw) as SavedState;
    return {
      input: { ...createBlankInput(), ...parsed.input },
      draft: parsed.draft ?? null,
    };
  } catch {
    return { input: createBlankInput(), draft: null };
  }
}

function App() {
  const [input, setInput] = useState<RelayDraftInput>(() => loadSavedState().input);
  const [draft, setDraft] = useState<RelayDraft | null>(() => loadSavedState().draft);
  const [toast, setToast] = useState("");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ input, draft }));
  }, [draft, input]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const completion = useMemo(() => {
    if (!draft?.tasks.length) return 0;
    return Math.round((draft.tasks.filter((task) => task.status === "complete").length / draft.tasks.length) * 100);
  }, [draft]);

  const updateInput = (key: keyof RelayDraftInput, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const generateDraft = () => {
    const next = createRelayDraft(input);
    setDraft(next);
    setToast("Draft generated.");
  };

  const loadSample = () => {
    setInput(sampleRelayInput);
    setDraft(null);
    setToast("Sample meeting loaded.");
  };

  const reset = () => {
    const blank = createBlankInput();
    setInput(blank);
    setDraft(null);
    window.localStorage.removeItem(STORAGE_KEY);
    setToast("Relay reset.");
  };

  const copyTemplate = async () => {
    await copyText(relayTemplate);
    setToast("Template copied.");
  };

  const copyRecap = async () => {
    if (!draft) return;
    await copyText(draft.recap);
    setToast("Recap copied.");
  };

  const downloadDraft = () => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "relay"}-draft.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("Draft exported.");
  };

  const updateTask = (taskId: string, changes: Partial<RelayTask>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...changes } : task)),
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
  };

  const addTask = () => {
    setDraft((current) => {
      const task: RelayTask = {
        id: `task-manual-${Date.now().toString(36)}`,
        title: "New follow-up task",
        status: "todo",
        dueDateText: "",
        source: "Manual task",
      };
      return current
        ? {
            ...current,
            tasks: [...current.tasks, task],
            updatedAt: new Date().toISOString(),
          }
        : {
            ...createRelayDraft(input),
            tasks: [task],
          };
    });
    setToast("Task added.");
  };

  const removeTask = (taskId: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.filter((task) => task.id !== taskId),
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
    setToast("Task removed.");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Relay home">
          <img src="/relay-icon.svg" alt="" />
          <span>Relay</span>
        </a>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={loadSample}>
            <Sparkles aria-hidden="true" />
            Use sample
          </button>
          <button className="ghost-button" type="button" onClick={reset}>
            <RefreshCw aria-hidden="true" />
            Reset
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Relay meeting workspace">
        <section className="input-column" aria-label="Meeting minutes input">
          <div className="section-heading">
            <span className="eyebrow">Personal meeting</span>
            <h1>Paste minutes. Leave with your next moves.</h1>
            <p>Relay keeps the workflow individual: one pasted meeting record becomes a recap, links, open questions, and your own task list.</p>
          </div>

          <div className="form-grid">
            <label>
              <span>Meeting title</span>
              <input
                value={input.title}
                onChange={(event) => updateInput("title", event.target.value)}
                placeholder="Weekly planning sync"
              />
            </label>
            <label>
              <span>Date</span>
              <input type="date" value={input.date} onChange={(event) => updateInput("date", event.target.value)} />
            </label>
          </div>

          <label>
            <span>Context</span>
            <textarea
              value={input.context}
              onChange={(event) => updateInput("context", event.target.value)}
              placeholder="Why this meeting happened, what mattered, and what you need to remember."
              rows={3}
            />
          </label>

          <div className="form-grid">
            <label>
              <span>Resources</span>
              <textarea
                value={input.resources}
                onChange={(event) => updateInput("resources", event.target.value)}
                placeholder="Paste links, docs, decks, or references."
                rows={5}
              />
            </label>
            <label>
              <span>Questions</span>
              <textarea
                value={input.questions}
                onChange={(event) => updateInput("questions", event.target.value)}
                placeholder="Open questions you still need to answer."
                rows={5}
              />
            </label>
          </div>

          <label>
            <span>Due dates</span>
            <textarea
              value={input.dueDates}
              onChange={(event) => updateInput("dueDates", event.target.value)}
              placeholder="One per line, like: Finish demo script by Friday."
              rows={3}
            />
          </label>

          <label>
            <span>Meeting minutes</span>
            <textarea
              className="minutes-box"
              value={input.minutes}
              onChange={(event) => updateInput("minutes", event.target.value)}
              placeholder="Paste the meeting minutes here."
              rows={10}
            />
          </label>

          <div className="generate-row">
            <button className="primary-button" type="button" onClick={generateDraft}>
              <Sparkles aria-hidden="true" />
              Generate draft
            </button>
          </div>

          <section className="template-panel" aria-label="Personal meeting template">
            <div>
              <span className="eyebrow">Copy template</span>
              <h2>Personal meeting template</h2>
            </div>
            <pre>{relayTemplate}</pre>
            <button className="ghost-button" type="button" onClick={copyTemplate}>
              <ClipboardCopy aria-hidden="true" />
              Copy template
            </button>
          </section>
        </section>

        <section className="output-column" aria-label="Generated Relay draft">
          {draft ? (
            <>
              <section className="summary-panel">
                <div className="summary-title-row">
                  <div>
                    <span className="eyebrow">Draft recap</span>
                    <h2>{draft.title}</h2>
                    <p>{draft.date}</p>
                  </div>
                  <div className="summary-actions">
                    <button className="icon-button" type="button" onClick={copyRecap} aria-label="Copy recap">
                      <ClipboardCopy aria-hidden="true" />
                    </button>
                    <button className="icon-button" type="button" onClick={downloadDraft} aria-label="Download draft JSON">
                      <Download aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <p className="recap-text">{draft.recap}</p>
              </section>

              <section className="metric-strip" aria-label="Draft summary">
                <div>
                  <strong>{draft.tasks.length}</strong>
                  <span>Tasks</span>
                </div>
                <div>
                  <strong>{draft.resources.length}</strong>
                  <span>Links</span>
                </div>
                <div>
                  <strong>{draft.questions.length}</strong>
                  <span>Questions</span>
                </div>
                <div>
                  <strong>{completion}%</strong>
                  <span>Complete</span>
                </div>
              </section>

              <section className="task-panel">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">Your follow-up</span>
                    <h2>Tasks</h2>
                  </div>
                  <button className="ghost-button" type="button" onClick={addTask}>
                    <Plus aria-hidden="true" />
                    Add task
                  </button>
                </div>

                <div className="task-list">
                  {draft.tasks.map((task) => (
                    <article className="task-row" key={task.id}>
                      <label className="task-title">
                        <span>Task</span>
                        <input value={task.title} onChange={(event) => updateTask(task.id, { title: event.target.value })} />
                      </label>
                      <label>
                        <span>Status</span>
                        <select
                          aria-label={`Status for ${task.title}`}
                          value={task.status}
                          onChange={(event) => updateTask(task.id, { status: event.target.value as TaskStatus })}
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Due date</span>
                        <input
                          aria-label={`Due date for ${task.title}`}
                          value={task.dueDateText}
                          onChange={(event) => updateTask(task.id, { dueDateText: event.target.value })}
                          placeholder="Friday, 5 PM"
                        />
                      </label>
                      <button className="icon-button danger" type="button" onClick={() => removeTask(task.id)} aria-label={`Remove ${task.title}`}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="support-grid">
                <InfoPanel icon={<Link2 aria-hidden="true" />} title="Resources" items={draft.resources.map((resource) => resource.url)} empty="No links found yet." />
                <InfoPanel icon={<FileText aria-hidden="true" />} title="Questions" items={draft.questions} empty="No open questions found yet." />
              </section>
            </>
          ) : (
            <section className="empty-state">
              <ListChecks aria-hidden="true" />
              <h2>Your Relay draft will appear here.</h2>
              <p>Load the sample or paste your own meeting minutes, then generate a draft to review the personal follow-up list.</p>
            </section>
          )}
        </section>
      </section>

      {toast ? (
        <div className="toast" role="status">
          <CheckCircle2 aria-hidden="true" />
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function InfoPanel({ icon, title, items, empty }: { icon: React.ReactNode; title: string; items: string[]; empty: string }) {
  return (
    <section className="info-panel">
      <div className="panel-header compact">
        {icon}
        <h2>{title}</h2>
      </div>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

export default App;
