"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Result =
  | { kind: "ok"; id: string; errors: number; warnings: number; version: number }
  | { kind: "duplicate"; message: string; existingId: string }
  | { kind: "error"; message: string };

export default function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setResult(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/returns", { method: "POST", body });
      const json = await res.json();
      if (res.status === 201) {
        setResult({ kind: "ok", id: json.id, errors: json.counts.errors, warnings: json.counts.warnings, version: json.version });
        router.refresh();
      } else if (res.status === 409) {
        setResult({ kind: "duplicate", message: json.error, existingId: json.existingId });
      } else {
        setResult({ kind: "error", message: json.error ?? "Upload failed." });
      }
    } catch {
      setResult({ kind: "error", message: "Could not reach the server." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="card">
      <h2>Upload a monthly return</h2>
      <div
        className={`dropzone${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
      >
        <p style={{ margin: "0 0 12px" }}>Drop the .xlsx return exported from the reporting system, or</p>
        <label className="btn primary" aria-disabled={busy}>
          {busy ? "Checking…" : "Choose file"}
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          The whole workbook is checked: all sheets, columns, totals and schedule reconciliations.
        </p>
      </div>

      {result?.kind === "ok" && (
        <p className={`alert ${result.errors ? "error" : "info"}`} role="status">
          Stored as version {result.version}.{" "}
          {result.errors
            ? `${result.errors} error(s) must be fixed in the source system before export.`
            : `No errors${result.warnings ? `, ${result.warnings} warning(s)` : ""}.`}{" "}
          <Link href={`/returns/${result.id}`}>Open the return →</Link>
        </p>
      )}
      {result?.kind === "duplicate" && (
        <p className="alert warning" role="status">
          {result.message} <Link href={`/returns/${result.existingId}`}>Open it →</Link>
        </p>
      )}
      {result?.kind === "error" && (
        <p className="alert error" role="alert">
          {result.message}
        </p>
      )}
    </section>
  );
}
