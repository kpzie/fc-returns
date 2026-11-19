import Link from "next/link";
import UploadForm from "@/components/UploadForm";
import { getStore } from "@/lib/store";
import { STATUS_LABEL, formatDateTime, formatPeriod } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const returns = await getStore().list();

  return (
    <>
      <div>
        <h1>Monthly returns</h1>
        <p className="muted" style={{ margin: 0 }}>
          Upload the Excel return, fix anything flagged, review the KPIs, then export the XML.
        </p>
      </div>

      <UploadForm />

      <section className="card">
        <h2>Uploaded returns</h2>
        {returns.length === 0 ? (
          <p className="muted">Nothing uploaded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Finance company</th>
                <th className="num">Version</th>
                <th>Status</th>
                <th className="num">Errors</th>
                <th className="num">Warnings</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/returns/${r.id}`}>{formatPeriod(r.asAt)}</Link>
                    <div className="muted small mono">{r.asAt}</div>
                  </td>
                  <td>
                    {r.fcName}
                    <div className="muted small mono">{r.fcCode}</div>
                  </td>
                  <td className="num">v{r.version}</td>
                  <td>
                    <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="num">{r.counts.errors}</td>
                  <td className="num">{r.counts.warnings}</td>
                  <td className="small">
                    {formatDateTime(r.uploadedAt)}
                    <div className="muted small">{r.fileName}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
