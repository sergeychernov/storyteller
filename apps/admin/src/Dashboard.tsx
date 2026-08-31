import { DateField, Loading, useGetOne, useTranslate } from "react-admin";

interface OverviewRecord {
  readonly id: string;
  readonly registrations: { readonly today: number; readonly last7Days: number; readonly last30Days: number; readonly total: number };
  readonly sessions: { readonly active: number; readonly observedLast90Days: number };
  readonly stories: Record<string, number>;
  readonly activity: readonly { readonly code: string; readonly count: number }[];
  readonly eventCoverageStartedAt: string | null;
}

export function Dashboard() {
  const translate = useTranslate();
  const overview = useGetOne<OverviewRecord>("overview", { id: "overview" });
  if (overview.isPending) return <Loading />;
  if (overview.isError || !overview.data) return <p role="alert">Unable to load the dashboard.</p>;
  const data = overview.data;
  return <main className="admin-dashboard">
    <h1>{translate("admin.dashboard")}</h1>
    <section className="metric-section">
      <h2>{translate("admin.registrations")}</h2>
      <div className="metric-grid">
        <Metric label={translate("admin.today")} value={data.registrations.today} />
        <Metric label={translate("admin.sevenDays")} value={data.registrations.last7Days} />
        <Metric label={translate("admin.thirtyDays")} value={data.registrations.last30Days} />
        <Metric label={translate("admin.total")} value={data.registrations.total} />
      </div>
    </section>
    <section className="metric-grid">
      <Metric label={translate("admin.activeSessions")} value={data.sessions.active} />
      <Metric label={translate("admin.observedSessions")} value={data.sessions.observedLast90Days} />
    </section>
    <section className="metric-section">
      <h2>{translate("admin.stories")}</h2>
      <div className="metric-grid">{Object.entries(data.stories).map(([status, count]) => <Metric key={status} label={status} value={count} />)}</div>
    </section>
    <section className="metric-section">
      <h2>{translate("admin.activity")}</h2>
      {data.activity.length ? <div className="metric-grid">{data.activity.map(({ code, count }) => <Metric key={code} label={code} value={count} />)}</div>
        : <p>{translate("admin.noEvents")}</p>}
      <p>{translate("admin.eventCoverage")}: {data.eventCoverageStartedAt
        ? <DateField record={{ id: "coverage", value: data.eventCoverageStartedAt }} source="value" showTime /> : "—"}</p>
    </section>
  </main>;
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return <article className="metric-card"><span>{label}</span><strong>{value.toLocaleString()}</strong></article>;
}
