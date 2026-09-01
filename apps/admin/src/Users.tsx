import {
  BooleanField, Datagrid, DateField, List, Pagination, ReferenceManyField, SearchInput, Show, SimpleList, TabbedShowLayout,
  TabbedShowLayoutTabs, TextField, useGetOne, useRecordContext, useTranslate,
} from "react-admin";
import { AccessManagementPanel, BulkAccessActions } from "./AccessManagement.js";
import { RevokeSessionButton } from "./SessionRevoke.js";
import { userShowTabsProps } from "./responsive-layout.js";

const userFilters = [<SearchInput key="q" source="q" alwaysOn />];

export function UserList() {
  return <List filters={userFilters} actions={false} exporter={false} perPage={25} sort={{ field: "createdAt", order: "DESC" }} disableSyncWithLocation>
    <div className="desktop-records"><Datagrid rowClick="show" bulkActionButtons={<BulkAccessActions />}>
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
    <TabbedShowLayout tabs={<TabbedShowLayoutTabs {...userShowTabsProps} />}>
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
        <SessionsPanel />
      </TabbedShowLayout.Tab>
      <TabbedShowLayout.Tab label={translate("admin.access")} path="access">
        <AccessManagementPanel />
        <EffectiveAccessPanel />
      </TabbedShowLayout.Tab>
    </TabbedShowLayout>
  </Show>;
}

interface EffectiveAccessRecord {
  readonly id: string; readonly planVersionCode: string | null; readonly roles: readonly string[];
  readonly capabilities: readonly { readonly code: string; readonly allowed: boolean; readonly expiresAt?: string; readonly sources: readonly AccessSource[] }[];
  readonly limits: readonly { readonly code: string; readonly value: number | "unlimited" | null; readonly expiresAt?: string; readonly sources: readonly AccessSource[] }[];
  readonly evaluatedAt: string;
}
interface AccessSource { readonly kind: string; readonly key: string; readonly effect: string; readonly via?: string; readonly decisive: boolean }

function SessionsPanel() {
  const user = useRecordContext();
  if (!user?.id) return null;
  const profileId = String(user.id);
  return <ReferenceManyField reference="sessions" target="profileId" pagination={<Pagination rowsPerPageOptions={[10, 25, 50]} />}>
    <Datagrid bulkActionButtons={false}><TextField source="id" /><TextField source="status" /><BooleanField source="isCurrent" />
      <DateField source="createdAt" showTime /><DateField source="lastSeenAt" showTime /><DateField source="expiresAt" showTime />
      <DateField source="revokedAt" showTime emptyText="—" /><RevokeSessionButton profileId={profileId} /></Datagrid>
  </ReferenceManyField>;
}

function EffectiveAccessPanel() {
  const user = useRecordContext();
  const access = useGetOne<EffectiveAccessRecord>("access", { id: String(user?.id ?? "") }, { enabled: Boolean(user?.id) });
  if (!access.data) return <p aria-busy={access.isPending}>{access.isError ? "Unable to load access." : "…"}</p>;
  return <div className="access-panel">
    <p><strong>Plan:</strong> {access.data.planVersionCode ?? "—"}</p>
    <p><strong>Roles:</strong> {access.data.roles.join(", ") || "—"}</p>
    <h3>Capabilities</h3>
    <ul>{access.data.capabilities.map(({ code, allowed, expiresAt, sources }) => <li key={code}>
      <details><summary>{allowed ? "✓" : "×"} {code}{expiresAt ? ` · ${new Date(expiresAt).toLocaleString()}` : ""}</summary>
        <SourceList sources={sources} />
      </details>
    </li>)}</ul>
    <h3>Limits</h3>
    <ul>{access.data.limits.map(({ code, value, expiresAt, sources }) => <li key={code}>
      <details><summary>{code}: {value ?? "—"}{expiresAt ? ` · ${new Date(expiresAt).toLocaleString()}` : ""}</summary>
        <SourceList sources={sources} />
      </details>
    </li>)}</ul>
    <p><small>{new Date(access.data.evaluatedAt).toLocaleString()}</small></p>
  </div>;
}

function SourceList({ sources }: { readonly sources: readonly AccessSource[] }) {
  return sources.length ? <ul className="access-sources">{sources.map((source, index) => <li key={`${source.kind}:${source.key}:${index}`}>
    {source.decisive ? "●" : "○"} {source.kind}:{source.key} · {source.effect}{source.via ? ` · ${source.via}` : ""}
  </li>)}</ul> : <p>deny by default</p>;
}
