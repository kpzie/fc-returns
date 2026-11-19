import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStore } from "@/lib/store";
import { getActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import NoAccess from "@/components/NoAccess";
import { loadTrend } from "@/lib/returns/trend";
import KpiDashboard from "@/components/KpiDashboard";
import IssuesTable from "@/components/IssuesTable";
import SubmitButton from "@/components/SubmitButton";
import { STATUS_LABEL, formatDateTime, formatPeriod } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "view")) return <NoAccess />;
  const store = await getStore();
  const rec = await store.get(id);
  if (!rec) notFound();
  const trend = await loadTrend(store, rec.fcCode);
  const hasErrors = rec.status === "needs-fixes";

  return (
    <>
      <div>
        <Link href="/" className="small">
          ← All returns
        </Link>
        <div className="row spread" style={{ marginTop: 8 }}>
          <div>
            <h1>
              {rec.fcName} · {formatPeriod(rec.asAt)}
            </h1>
            <div className="row muted small">
              <span className="mono">FC {rec.fcCode}</span>
              <span>As at {rec.asAt}</span>
              <span>Version {rec.version}</span>
              <span>
                {rec.fileName} · uploaded {formatDateTime(rec.uploadedAt)}
                {rec.uploadedBy && ` by ${rec.uploadedBy.email}`}
              </span>
              <span className={`badge ${rec.status}`}>{STATUS_LABEL[rec.status]}</span>
              {rec.submittedAt && (
                <span>
                  Submitted {formatDateTime(rec.submittedAt)}
                  {rec.submittedBy && ` by ${rec.submittedBy.email}`}
                </span>
              )}
            </div>
          </div>
          <div className="row">
            <a className="btn" href={`/api/returns/${rec.id}/original`}>
              Original .xlsx
            </a>
            {hasErrors ? (
              <span className="btn" aria-disabled="true" title="Fix validation errors first">
                Download XML
              </span>
            ) : (
              <a className="btn primary" href={`/api/returns/${rec.id}/xml`}>
                Download XML (.zip)
              </a>
            )}
            {rec.status !== "submitted" && can(actor, "submit") && <SubmitButton id={rec.id} disabled={hasErrors} />}
          </div>
        </div>
      </div>

      {!hasErrors && (
        <p className="alert info" style={{ margin: 0 }}>
          The XML download is a zip with one file per call report, in the format of the CBN-accepted samples. The 7 SFCR call
          reports are in a separate <span className="mono">SFCR-format-not-verified</span> folder: no accepted sample covers them yet,
          so confirm whether and how they are filed before including them.
        </p>
      )}
      {hasErrors && (
        <p className="alert error" style={{ margin: 0 }}>
          This version has {rec.counts.errors} validation error(s). Correct them in the reporting system, export the workbook again
          and upload it — it will be stored as version {rec.version + 1}.
        </p>
      )}

      <KpiDashboard kpis={rec.kpis} trend={trend} currentAsAt={rec.asAt} />
      <IssuesTable issues={rec.issues} />
    </>
  );
}
