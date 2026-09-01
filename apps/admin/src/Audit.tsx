import { Datagrid, DateField, FunctionField, List, SearchInput, SimpleList, TextField } from "react-admin";

export function AuditList() {
  return <List actions={false} exporter={false} perPage={25} sort={{ field: "occurredAt", order: "DESC" }}
    filters={[<SearchInput key="action" source="action" alwaysOn />]}>
    <div className="desktop-records"><Datagrid bulkActionButtons={false}>
      <DateField source="occurredAt" showTime /><TextField source="actorProfileId" emptyText="—" /><TextField source="action" />
      <TextField source="targetType" /><TextField source="targetProfileId" emptyText="—" /><TextField source="targetEntityId" emptyText="—" />
      <TextField source="reason" emptyText="—" /><TextField source="batchId" emptyText="—" /><TextField source="source" />
      <FunctionField source="change" render={(record) => summarizeAuditChange(record.change)} />
    </Datagrid></div>
    <div className="mobile-records"><SimpleList linkType={false}
      primaryText={(record) => String(record.action)}
      secondaryText={(record) => [record.targetType, record.targetProfileId].filter(Boolean).join(" · ") || "—"}
      tertiaryText={(record) => new Date(String(record.occurredAt)).toLocaleString()} /></div>
  </List>;
}

export function summarizeAuditChange(change: unknown): string {
  if (!change || typeof change !== "object") return "—";
  const value = change as { before?: unknown; after?: unknown };
  const before = safeFields(value.before);
  const after = safeFields(value.after);
  if (!Object.keys(before).length && !Object.keys(after).length) return "—";
  return `${JSON.stringify(before)} → ${JSON.stringify(after)}`;
}

function safeFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(safeAuditKeys.flatMap((key) => key in input ? [[key, input[key]]] : []));
}

const safeAuditKeys = [
  "role_code", "cohort_code", "capability_code", "limit_code", "effect", "operation",
  "value", "unlimited", "starts_at", "expires_at", "status",
] as const;
