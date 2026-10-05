"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { submitVisitorCheckOut, type CheckOutResult } from "@/features/visitor-check-out/actions";

const RESULT_COPY: Record<Exclude<CheckOutResult, "failed" | "invalid">, { title: string; text: string }> = {
  "checked-out": { title: "Check-out complete", text: "Your departure has been recorded. Thank you for visiting." },
  "already-checked-out": { title: "Already checked out", text: "Your most recent visit is already marked as checked out." },
  "not-found": { title: "No recent visit found", text: "We could not find a visit for that email address. Please ask reception for assistance." },
};

export function CheckOutForm() {
  const [result, setResult] = useState<CheckOutResult | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setSubmitting(true);
    try {
      const next = await submitVisitorCheckOut(new FormData(event.currentTarget));
      setResult(next);
      if (next === "checked-out" || next === "already-checked-out") setEmail("");
    } catch {
      setResult("failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (result && result !== "invalid" && result !== "failed") {
    const copy = RESULT_COPY[result];
    return <section className="visitor-success" role="status"><span className="visitor-success-icon" aria-hidden="true">{result === "checked-out" ? "✓" : "↗"}</span><p className="visitor-eyebrow">VISIT STATUS</p><h1>{copy.title}</h1><p>{copy.text}</p><div className="visitor-success-actions"><button className="visitor-primary" type="button" onClick={() => setResult(null)}>Check out another visitor <span>→</span></button><Link href="/" className="visitor-secondary">Return to welcome</Link></div></section>;
  }

  return <section className="visitor-card visitor-checkout-card">
    <div className="visitor-card-heading"><div><p className="visitor-eyebrow">VISITOR DEPARTURE</p><h2>Record your check-out</h2><p>Enter the same email address you used when checking in.</p></div><span className="visitor-heading-icon">↗</span></div>
    {result === "invalid" && <p className="visitor-alert" role="alert">Enter a valid email address.</p>}
    {result === "failed" && <p className="visitor-alert" role="alert">We could not complete your check-out. Please try again or ask reception for help.</p>}
    <form className="visitor-fields visitor-fields-one" onSubmit={handleSubmit}>
      <label className="visitor-field visitor-field-wide">Email address<input name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <div className="visitor-actions"><Link href="/" className="visitor-secondary">Cancel</Link><button className="visitor-primary" type="submit" disabled={submitting}>{submitting ? "Recording…" : "Check out"}<span>→</span></button></div>
    </form>
    <p className="visitor-privacy-note">Checking out records your departure. An older visit without a check-out time will remain unchanged.</p>
  </section>;
}
