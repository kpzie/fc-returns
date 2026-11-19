"use client";

import { useState } from "react";
import type { Issue } from "@/lib/returns/types";

const RULE_LABEL: Record<string, string> = {
  "missing-sheet": "Missing sheet",
  "missing-column": "Missing column",
  "unexpected-column": "Extra column",
  "unexpected-sheet": "Extra sheet",
  "not-a-number": "Not a number",
  "bad-date": "Bad date",
  "duplicate-code": "Duplicate code",
  arithmetic: "Total doesn't add up",
  reconciliation: "Schedule doesn't reconcile",
  "header-mismatch": "Header mismatch",
  "sheet-header-label": "Header layout",
  "sheet-name-mismatch": "Sheet name",
  "no-column-header": "No column header",
};

export default function IssuesTable({ issues }: { issues: Issue[] }) {
  const [filter, setFilter] = useState<"all" | "error" | "warning">(issues.some((i) => i.severity === "error") ? "error" : "all");
  const shown = issues.filter((i) => filter === "all" || i.severity === filter);
  const count = (s: Issue["severity"]) => issues.filter((i) => i.severity === s).length;

  return (
    <section className="card">
      <h2>Validation</h2>
      {issues.length === 0 ? (
        <p className="alert info" style={{ margin: 0 }}>
          All checks passed: every sheet and column is present, values are well-formed, totals add up and schedules reconcile.
        </p>
      ) : (
        <>
          <div className="filters" role="group" aria-label="Filter issues">
            {(["all", "error", "warning"] as const).map((f) => (
              <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? `All (${issues.length})` : f === "error" ? `Errors (${count("error")})` : `Warnings (${count("warning")})`}
              </button>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Check</th>
                <th>Sheet</th>
                <th>Where</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i, n) => (
                <tr key={n}>
                  <td>
                    <span className={`badge ${i.severity}`}>{i.severity === "error" ? "Error" : "Warning"}</span>
                  </td>
                  <td className="small">{RULE_LABEL[i.rule] ?? i.rule}</td>
                  <td className="mono small">{i.sheet ?? "—"}</td>
                  <td className="mono small">{[i.column, i.row && `row ${i.row}`].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="small">{i.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
