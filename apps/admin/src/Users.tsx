import {
  Datagrid, DateField, List, Pagination, ReferenceManyField, SearchInput, Show, SimpleList, TabbedShowLayout,
  TextField, useGetOne, useRecordContext, useTranslate,
} from "react-admin";

const userFilters = [<SearchInput key="q" source="q" alwaysOn />];

export function UserList() {
  return <List filters={userFilters} actions={false} exporter={false} perPage={25} sort={{ field: "createdAt", order: "DESC" }} disableSyncWithLocation>
    <div className="desktop-records"><Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="name" />
      <TextField source="email" />
      <TextField source="language" />
      <DateField source="createdAt" showTime />
      <DateField source="lastSeenAt" showTime emptyText="—" />
      <TextField source="storyCount" />
      <TextField source="activeSessionCount" />
    </Datagrid></div>
    <div className="mobile-records"><SimpleList linkType="show"
      primaryText={(record) => String(record.name)} secondaryText={(record) => String(record.email)}
      tertiaryText={(record) => new Date(String(record.createdAt)).toLocaleDateString()} /></div>
  </List>;
}

export function UserShow() {
  const translate = useTranslate();
  return <Show actions={false}>
    <TabbedShowLayout>
      <TabbedShowLayout.Tab label={translate("admin.overview")}>
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="email" />
        <TextField source="language" />
        <DateField source="createdAt" showTime />
        <DateField source="updatedAt" showTime />
        <DateField source="lastSeenAt" showTime emptyText="—" />
        <TextField source="storyCount" />
        <TextField source="activeSessionCount" />
      </TabbedShowLayout.Tab>
      <TabbedShowLayout.Tab label={translate("admin.activity")} path="activity">
        <ReferenceManyField reference="activity" target="profileId" pagination={<Pagination rowsPerPageOptions={[10, 25, 50]} />}>
          <Datagrid bulkActionButtons={false}><TextField source="code" /><DateField source="occurredAt" showTime /></Datagrid>
        </ReferenceManyField>
      </TabbedShowLayout.Tab>
      <TabbedShowLayout.Tab label={translate("admin.sessions")} path="sessions">
        <ReferenceManyField reference="sessions" target="profileId" pagination={<Pagination rowsPerPageOptions={[10, 25, 50]} />}>
          <Datagrid bulkActionButtons={false}><TextField source="id" /><TextField source="status" /><DateField source="createdAt" showTime />
            <DateField source="lastSeenAt" showTime /><DateField source="expiresAt" showTime /><DateField source="revokedAt" showTime emptyText="—" /></Datagrid>
        </ReferenceManyField>
      </TabbedShowLayout.Tab>
      <TabbedShowLayout.Tab label={translate("admin.access")} path="access"><EffectiveAccessPanel /></TabbedShowLayout.Tab>
    </TabbedShowLayout>
  </Show>;
}

interface EffectiveAccessRecord {
  readonly id: string; readonly planVersionCode: string | null; readonly roles: readonly string[];
  readonly capabilities: readonly { readonly code: string; readonly allowed: boolean }[];
  readonly limits: readonly { readonly code: string; readonly value: number | "unlimited" | null }[];
  readonly evaluatedAt: string;
}

function EffectiveAccessPanel() {
  const user = useRecordContext();
  const access = useGetOne<EffectiveAccessRecord>("access", { id: String(user?.id ?? "") }, { enabled: Boolean(user?.id) });
  if (!access.data) return <p aria-busy={access.isPending}>{access.isError ? "Unable to load access." : "…"}</p>;
  return <div className="access-panel">
    <p><strong>Plan:</strong> {access.data.planVersionCode ?? "—"}</p>
    <p><strong>Roles:</strong> {access.data.roles.join(", ") || "—"}</p>
    <h3>Capabilities</h3>
    <ul>{access.data.capabilities.map(({ code, allowed }) => <li key={code}>{allowed ? "✓" : "×"} {code}</li>)}</ul>
    <h3>Limits</h3>
    <ul>{access.data.limits.map(({ code, value }) => <li key={code}>{code}: {value ?? "—"}</li>)}</ul>
    <p><small>{new Date(access.data.evaluatedAt).toLocaleString()}</small></p>
  </div>;
}
