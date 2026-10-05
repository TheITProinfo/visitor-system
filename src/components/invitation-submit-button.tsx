"use client";

import { useFormStatus } from "react-dom";

export function InvitationSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="filter-button" type="submit" disabled={pending} aria-live="polite">
      {pending ? "Creating invitation…" : "Create invitation"} <span aria-hidden="true">{pending ? "…" : "→"}</span>
    </button>
  );
}
