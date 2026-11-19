"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SubmitButton({ id, disabled }: { id: string; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!confirm("Record this version as submitted to CBN? It will be locked and can't be changed.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/returns/${id}/submit`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json()).error ?? "Failed.");
  }

  return (
    <>
      <button className="btn" onClick={submit} disabled={disabled || busy}>
        {busy ? "Saving…" : "Mark as submitted"}
      </button>
      {error && <span className="badge error">{error}</span>}
    </>
  );
}
