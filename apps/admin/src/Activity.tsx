import { Datagrid, DateField, List, SelectInput, SimpleList, TextField } from "react-admin";

const activityCodes = [
  "auth.registered", "auth.logged_in", "story.created", "material.uploaded", "scene.render_requested", "scene.render_ready",
  "story.export_requested", "story.export_ready", "publication.requested", "publication.succeeded", "publication.failed",
];

export function ActivityList() {
  return <List actions={false} exporter={false} perPage={25} sort={{ field: "occurredAt", order: "DESC" }}
    filters={[<SelectInput key="code" source="code" choices={activityCodes.map((id) => ({ id, name: id }))} alwaysOn />]}>
    <div className="desktop-records"><Datagrid bulkActionButtons={false}>
      <TextField source="profileId" /><TextField source="code" /><DateField source="occurredAt" showTime />
    </Datagrid></div>
    <div className="mobile-records"><SimpleList linkType={false}
      primaryText={(record) => String(record.code)} secondaryText={(record) => String(record.profileId)}
      tertiaryText={(record) => new Date(String(record.occurredAt)).toLocaleString()} /></div>
  </List>;
}
