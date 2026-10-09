"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type Result = {
  kind: "records" | "stats" | "clarify" | "unsupported";
  message: string;
  count?: number;
  from?: string;
  to?: string;
  breakdown?: Array<{ label: string; arrivals: number; open: number }>;
  rows?: Array<{ id: string; visitorName: string; host: string; purpose: string; checkedInAt: string; checkedOutAt: string | null }>;
};

export function AiAssistant({ enabled, timeZone }: { enabled: boolean; timeZone: string }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || pending) return;
    setPending(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "The assistant could not complete this request.");
      } else {
        setResult(data as Result);
        setQuestion("");
      }
    } catch {
      setError("The assistant could not connect. Retry this request.");
    } finally {
      setPending(false);
    }
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
  }

  return (
    <section className="panel ai-assistant-panel">
      <div className="panel-heading"><div><p className="eyebrow">VISITOR SYSTEM DATA</p><h2>Ask a question</h2></div><span className="settings-card-icon green">✦</span></div>
      <div className="ai-assistant-body">
        <p className="settings-help">Examples: “How many visitors arrived today?”, “Show visits that have not checked out”, “How many visitors arrived last week?”</p>
        <form className="ai-question-form" onSubmit={submit}>
          <label htmlFor="ai-question">Your question</label>
          <textarea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={3} placeholder="Ask about dates, status, host, or visit purpose…" required disabled={!enabled || pending} />
          <div className="ai-form-footer"><small>{question.length}/500 characters · Queries are not saved as conversation history.</small><button className="primary-button compact-button" type="submit" disabled={!enabled || pending || !question.trim()}>{pending ? "Checking…" : "Ask assistant"} <span>→</span></button></div>
        </form>
        {error && <p className="settings-message is-error" role="alert">{error}</p>}
        {result && <div className="ai-result" aria-live="polite">
          <p className="ai-result-summary">{result.message}</p>
          {result.kind === "stats" && result.breakdown && result.breakdown.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>LOCAL DATE</th><th>ARRIVALS</th><th>NO CHECKOUT TIME</th></tr></thead><tbody>{result.breakdown.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.arrivals}</td><td>{row.open}</td></tr>)}</tbody></table></div>}
          {result.kind === "records" && result.rows && result.rows.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>VISITOR</th><th>HOST</th><th>PURPOSE</th><th>CHECKED IN</th><th>STATUS</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}><td><Link className="record-name-link" href={`/back-office/visits/${row.id}`}><strong>{row.visitorName}</strong></Link></td><td>{row.host}</td><td>{row.purpose}</td><td>{formatDate(row.checkedInAt)}</td><td>{row.checkedOutAt ? "Checked out" : "Not checked out"}</td></tr>)}</tbody></table></div>}
          {result.kind === "records" && result.rows?.length === 0 && <p className="list-empty">No matching visitor records.</p>}
        </div>}
      </div>
    </section>
  );
}
