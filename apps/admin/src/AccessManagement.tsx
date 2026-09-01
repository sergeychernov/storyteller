import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel,
  ListItemText, MenuItem, Select, Stack, TextField as MuiTextField, Typography,
} from "@mui/material";
import type {
  AdminAccessCatalogEntry, AdminAccessManagement, AdminAccessOperation, AdminAccessPreview, AdminAccessRole,
} from "@storyteller/schemas";
import { useMemo, useState } from "react";
import {
  useGetList, useGetOne, useListContext, useLocaleState, useNotify, usePermissions, useRecordContext, useRefresh, useTranslate,
  useUnselectAll,
} from "react-admin";
import { ApiError } from "@storyteller/api-client";
import { getAccessReference, type AccessReferenceKind } from "./access-reference.js";
import { applyAccessPreview, previewAccessChange } from "./providers.js";
import { accessManagementHeaderSx } from "./responsive-layout.js";

type OperationType = AdminAccessOperation["type"];

interface OperationForm {
  readonly type: OperationType;
  readonly code: string;
  readonly effect: "allow" | "deny";
  readonly limitOperation: "add" | "replace";
  readonly value: string;
  readonly startsAt: string;
  readonly expiresAt: string;
}

const initialForm: OperationForm = {
  type: "set_role", code: "", effect: "allow", limitOperation: "add", value: "0", startsAt: "", expiresAt: "",
};

export function AccessManagementPanel() {
  const user = useRecordContext();
  const translate = useTranslate();
  const permissions = usePermissions<readonly string[]>();
  const management = useGetOne<AdminAccessManagement>(
    "accessManagement", { id: String(user?.id ?? "") }, { enabled: Boolean(user?.id) },
  );
  const [open, setOpen] = useState(false);
  if (management.isPending) return <p aria-busy>…</p>;
  if (!management.data) return <Alert severity="error">{translate("admin.accessLoadFailed")}</Alert>;
  const allowed = canMutateAccess(permissions.data);
  return <section className="access-management">
    <Stack sx={accessManagementHeaderSx}>
      <div><h3>{translate("admin.manualAccess")}</h3><small>Revision {management.data.revision}</small></div>
      {allowed && <Button variant="contained" onClick={() => setOpen(true)}>{translate("admin.changeAccess")}</Button>}
    </Stack>
    <AccessGroup title={translate("admin.roles")} values={management.data.roles.map((item) => describeGrant(item.roleCode, item))} />
    <AccessGroup title={translate("admin.cohorts")} values={management.data.memberships.map((item) => describeGrant(item.cohortCode, item))} />
    <AccessGroup title={translate("admin.capabilityOverrides")} values={management.data.capabilityOverrides.map((item) => describeGrant(`${item.capabilityCode}: ${item.effect}`, item))} />
    <AccessGroup title={translate("admin.limitOverrides")} values={management.data.limitOverrides.map((item) => describeGrant(`${item.limitCode}: ${item.operation} ${item.value}`, item))} />
    {user?.id && <AccessChangeDialog open={open} profileIds={[String(user.id)]} onClose={() => setOpen(false)} />}
  </section>;
}

export function BulkAccessActions() {
  const { selectedIds } = useListContext();
  const permissions = usePermissions<readonly string[]>();
  const unselectAll = useUnselectAll("users");
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  if (!selectedIds.length || !canMutateAccess(permissions.data)) return null;
  return <>
    <Button color="primary" onClick={() => setOpen(true)}>{translate("admin.bulkAccess")}</Button>
    <AccessChangeDialog open={open} profileIds={selectedIds.map(String)} onClose={() => setOpen(false)} onApplied={unselectAll} />
  </>;
}

function AccessChangeDialog(props: {
  readonly open: boolean;
  readonly profileIds: readonly string[];
  readonly onClose: () => void;
  readonly onApplied?: () => void;
}) {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const notify = useNotify();
  const refresh = useRefresh();
  const roles = useGetList<AdminAccessRole>("accessRoles", catalogQuery());
  const cohorts = useGetList<AdminAccessCatalogEntry>("accessCohorts", catalogQuery());
  const capabilities = useGetList<AdminAccessCatalogEntry>("accessCapabilities", catalogQuery());
  const limits = useGetList<AdminAccessCatalogEntry>("accessLimits", catalogQuery());
  const [form, setForm] = useState<OperationForm>(initialForm);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<AdminAccessPreview>();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useMemo(
    () => operationOptions(form.type, roles.data, cohorts.data, capabilities.data, limits.data),
    [form.type, roles.data, cohorts.data, capabilities.data, limits.data],
  );
  const referenceKind = operationReferenceKind(form.type);
  const selectedRole = referenceKind === "role" ? roles.data?.find(({ code }) => code === form.code) : undefined;
  const requiredConfirmation = props.profileIds.length > 1 ? `APPLY ${props.profileIds.length}` : "";

  const close = () => {
    if (busy) return;
    setPreview(undefined); setConfirmation(""); setReason(""); setForm(initialForm); props.onClose();
  };
  const runPreview = async () => {
    try {
      setBusy(true);
      const operation = buildAccessOperation(form);
      setPreview(await previewAccessChange(props.profileIds, operation, reason.trim()));
      setConfirmation("");
    } catch (error) { notifyError(notify, error); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview) return;
    try {
      setBusy(true);
      await applyAccessPreview(preview.id, requiredConfirmation ? confirmation : undefined);
      notify(translate("admin.accessApplied"), { type: "success" });
      refresh(); props.onApplied?.(); close();
    } catch (error) { notifyError(notify, error); }
    finally { setBusy(false); }
  };

  return <Dialog open={props.open} onClose={close} fullWidth maxWidth="md">
    <DialogTitle>{props.profileIds.length > 1 ? translate("admin.bulkAccess") : translate("admin.changeAccess")}</DialogTitle>
    <DialogContent><Stack sx={{ pt: 1, gap: 2 }}>
      <Typography>{translate("admin.selectedUsers", { count: props.profileIds.length })}</Typography>
      <FormControl fullWidth><InputLabel>{translate("admin.operation")}</InputLabel>
        <Select label={translate("admin.operation")} value={form.type} onChange={(event) => { setForm({ ...initialForm, type: event.target.value as OperationType }); setPreview(undefined); }}>
          {operationTypes.map((type) => <MenuItem key={type} value={type}>{translate(`admin.operations.${type}`)}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl fullWidth><InputLabel>{translate("admin.accessCode")}</InputLabel>
        <Select label={translate("admin.accessCode")} value={form.code} renderValue={(value) => String(value)}
          onChange={(event) => { setForm({ ...form, code: String(event.target.value) }); setPreview(undefined); }}>
          {options.map((item) => {
            const reference = getAccessReference(referenceKind, item.code, locale);
            return <MenuItem key={item.code} value={item.code} className="access-option">
              <ListItemText primary={item.code} secondary={`${reference.name} — ${reference.description}`} />
            </MenuItem>;
          })}
        </Select>
      </FormControl>
      {form.code && <SelectedAccessReference kind={referenceKind} code={form.code} locale={locale}
        {...(selectedRole ? { roleCapabilities: selectedRole.capabilities } : {})}
        includedLabel={translate("admin.includedCapabilities")} />}
      {form.type === "set_capability_override" && <FormControl fullWidth><InputLabel>Effect</InputLabel>
        <Select label="Effect" value={form.effect} onChange={(event) => setForm({ ...form, effect: event.target.value as "allow" | "deny" })}>
          <MenuItem value="allow">allow</MenuItem><MenuItem value="deny">deny</MenuItem>
        </Select>
      </FormControl>}
      {form.type === "set_limit_override" && <>
        <FormControl fullWidth><InputLabel>Operation</InputLabel><Select label="Operation" value={form.limitOperation}
          onChange={(event) => setForm({ ...form, limitOperation: event.target.value as "add" | "replace" })}>
          <MenuItem value="add">add</MenuItem><MenuItem value="replace">replace</MenuItem>
        </Select></FormControl>
        <MuiTextField label={translate("admin.limitValue")} value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })}
          helperText={translate("admin.unlimitedHint")} />
      </>}
      {form.type.startsWith("set_") && <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
        <MuiTextField fullWidth type="datetime-local" label={translate("admin.startsAt")} slotProps={{ inputLabel: { shrink: true } }}
          value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
        <MuiTextField fullWidth type="datetime-local" label={translate("admin.expiresAt")} slotProps={{ inputLabel: { shrink: true } }}
          value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
      </Stack>}
      <MuiTextField required multiline minRows={2} label={translate("admin.reason")} value={reason}
        onChange={(event) => { setReason(event.target.value); setPreview(undefined); }} slotProps={{ htmlInput: { maxLength: 500 } }} />
      {preview && <PreviewPanel preview={preview} />}
      {preview && requiredConfirmation && <MuiTextField label={translate("admin.confirmation", { value: requiredConfirmation })}
        value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={close} disabled={busy}>{translate("ra.action.cancel")}</Button>
      {!preview && <Button variant="contained" onClick={runPreview} disabled={busy || !form.code || !reason.trim()}>{translate("admin.preview")}</Button>}
      {preview && <Button onClick={() => setPreview(undefined)} disabled={busy}>{translate("admin.edit")}</Button>}
      {preview && <Button color="warning" variant="contained" onClick={apply}
        disabled={busy || !preview.applicable || Boolean(requiredConfirmation && confirmation !== requiredConfirmation)}>{translate("admin.apply")}</Button>}
    </DialogActions>
  </Dialog>;
}

function SelectedAccessReference(props: {
  readonly kind: AccessReferenceKind;
  readonly code: string;
  readonly locale: string;
  readonly roleCapabilities?: readonly string[];
  readonly includedLabel: string;
}) {
  const reference = getAccessReference(props.kind, props.code, props.locale);
  return <Alert severity={reference.documented ? "info" : "warning"} className="access-option-help">
    <Typography component="h3" variant="subtitle2">{reference.name}</Typography>
    <Typography variant="body2">{reference.description}</Typography>
    {props.roleCapabilities && <Typography variant="caption">
      {props.includedLabel}: {props.roleCapabilities.join(", ") || "—"}
    </Typography>}
  </Alert>;
}

function PreviewPanel({ preview }: { readonly preview: AdminAccessPreview }) {
  return <section className="access-preview">
    <Alert severity={preview.applicable ? "warning" : "error"}>
      Changed: {preview.changedCount}; no-op: {preview.noOpCount}; blocked: {preview.blockedCount}
    </Alert>
    {preview.targets.map((target) => <details key={target.profileId} open={preview.targetCount === 1}>
      <summary>{target.profileId}: {target.blockers.length ? target.blockers.join(", ") : target.changed ? "changed" : "no-op"}</summary>
      {target.before && target.after && <EffectiveDelta before={target.before} after={target.after} />}
    </details>)}
  </section>;
}

function EffectiveDelta(props: { readonly before: AdminAccessPreview["targets"][number]["before"]; readonly after: AdminAccessPreview["targets"][number]["after"] }) {
  if (!props.before || !props.after) return null;
  const capabilities = props.after.capabilities.flatMap((after) => {
    const before = props.before?.capabilities.find(({ code }) => code === after.code);
    return before?.allowed === after.allowed && before.expiresAt === after.expiresAt ? [] : [`${after.code}: ${String(before?.allowed)} → ${String(after.allowed)}`];
  });
  const limits = props.after.limits.flatMap((after) => {
    const before = props.before?.limits.find(({ code }) => code === after.code);
    return before?.value === after.value && before.expiresAt === after.expiresAt ? [] : [`${after.code}: ${String(before?.value)} → ${String(after.value)}`];
  });
  return <ul>{[...capabilities, ...limits].map((line) => <li key={line}>{line}</li>)}</ul>;
}

export function buildAccessOperation(form: OperationForm): AdminAccessOperation {
  if (!form.code) throw new Error("access code is required");
  const window = {
    ...(form.startsAt ? { startsAt: new Date(form.startsAt).toISOString() } : {}),
    ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
  };
  switch (form.type) {
    case "set_role": return { type: form.type, roleCode: form.code, ...window };
    case "remove_role": return { type: form.type, roleCode: form.code };
    case "set_cohort_membership": return { type: form.type, cohortCode: form.code, ...window };
    case "remove_cohort_membership": return { type: form.type, cohortCode: form.code };
    case "set_capability_override": return { type: form.type, capabilityCode: form.code, effect: form.effect, ...window };
    case "remove_capability_override": return { type: form.type, capabilityCode: form.code };
    case "set_limit_override": {
      const value = form.value.trim().toLowerCase() === "unlimited" ? "unlimited" : Number(form.value);
      if (value !== "unlimited" && (!Number.isSafeInteger(value) || value < 0)) throw new Error("limit value must be a non-negative integer or unlimited");
      return { type: form.type, limitCode: form.code, operation: form.limitOperation, value, ...window };
    }
    case "remove_limit_override": return { type: form.type, limitCode: form.code };
  }
}

function operationOptions(
  type: OperationType,
  roles: readonly AdminAccessRole[] | undefined,
  cohorts: readonly AdminAccessCatalogEntry[] | undefined,
  capabilities: readonly AdminAccessCatalogEntry[] | undefined,
  limits: readonly AdminAccessCatalogEntry[] | undefined,
) {
  if (type.endsWith("role")) return (roles ?? []).filter(({ archived }) => !archived);
  if (type.endsWith("cohort_membership")) return (cohorts ?? []).filter(({ archived }) => !archived);
  if (type.includes("capability")) return (capabilities ?? []).filter(({ archived }) => !archived);
  return (limits ?? []).filter(({ archived }) => !archived);
}

function operationReferenceKind(type: OperationType): AccessReferenceKind {
  if (type.endsWith("role")) return "role";
  if (type.endsWith("cohort_membership")) return "cohort";
  if (type.includes("capability")) return "capability";
  return "limit";
}

function AccessGroup({ title, values }: { readonly title: string; readonly values: readonly string[] }) {
  return <section><h4>{title}</h4>{values.length ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>—</p>}</section>;
}

function describeGrant(code: string, value: { readonly startsAt: string | null; readonly expiresAt: string | null; readonly reason: string }) {
  return `${code} · ${value.startsAt ? new Date(value.startsAt).toLocaleString() : "—"} → ${value.expiresAt ? new Date(value.expiresAt).toLocaleString() : "∞"} · ${value.reason}`;
}

function catalogQuery() {
  return { pagination: { page: 1, perPage: 100 }, sort: { field: "code", order: "ASC" as const }, filter: {} };
}

function canMutateAccess(permissions: readonly string[] | undefined): boolean {
  return permissions?.some((value) => ["admin.access.assign_role", "admin.access.assign_cohort", "admin.access.override"].includes(value)) ?? false;
}

function notifyError(notify: ReturnType<typeof useNotify>, error: unknown) {
  const message = error instanceof ApiError ? `${error.code ?? error.status}: ${error.message}` : error instanceof Error ? error.message : "Unexpected error";
  notify(message, { type: "error" });
}

const operationTypes: readonly OperationType[] = [
  "set_role", "remove_role", "set_cohort_membership", "remove_cohort_membership",
  "set_capability_override", "remove_capability_override", "set_limit_override", "remove_limit_override",
];
