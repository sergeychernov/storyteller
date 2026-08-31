import { Datagrid, DateField, List, SearchInput, SimpleList, TextField } from "react-admin";

export function AuditList() {
  return <List actions={false} exporter={false} perPage={25} sort={{ field: "occurredAt", order: "DESC" }}
    filters={[<SearchInput key="action" source="action" alwaysOn />]}>
    <div className="desktop-records"><Datagrid bulkActionButtons={false}>
      <DateField source="occurredAt" showTime /><TextField source="actorProfileId" emptyText="—" /><TextField source="action" />
      <TextField source="targetType" /><TextField source="targetProfileId" emptyText="—" /><TextField source="source" />
    </Datagrid></div>
    <div className="mobile-records"><SimpleList linkType={false}
      primaryText={(record) => String(record.action)}
      secondaryText={(record) => [record.targetType, record.targetProfileId].filter(Boolean).join(" · ") || "—"}
      tertiaryText={(record) => new Date(String(record.occurredAt)).toLocaleString()} /></div>
  </List>;
}
