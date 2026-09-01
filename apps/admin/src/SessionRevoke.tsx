import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField as MuiTextField } from "@mui/material";
import { ApiError } from "@storyteller/api-client";
import type { AdminSessionMetadata } from "@storyteller/schemas";
import { useState } from "react";
import { useNotify, usePermissions, useRecordContext, useRefresh, useTranslate } from "react-admin";
import { revokeAdminSession } from "./providers.js";

export function RevokeSessionButton({ profileId }: { readonly profileId: string }) {
  const session = useRecordContext<AdminSessionMetadata>();
  const permissions = usePermissions<readonly string[]>();
  const notify = useNotify();
  const refresh = useRefresh();
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!session || session.status !== "active" || session.isCurrent
    || !permissions.data?.includes("admin.sessions.revoke")) return null;
  const revoke = async () => {
    try {
      setBusy(true);
      await revokeAdminSession(profileId, session.id, reason.trim());
      notify(translate("admin.sessionRevoked"), { type: "success" });
      setOpen(false); setReason(""); refresh();
    } catch (error) {
      notify(error instanceof ApiError ? `${error.code ?? error.status}: ${error.message}` : error instanceof Error ? error.message : "Unexpected error", { type: "error" });
    } finally { setBusy(false); }
  };
  return <>
    <Button color="warning" size="small" onClick={() => setOpen(true)}>{translate("admin.revoke")}</Button>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>{translate("admin.revokeSession")}</DialogTitle>
      <DialogContent><MuiTextField autoFocus fullWidth required multiline minRows={2} sx={{ mt: 1 }}
        label={translate("admin.reason")} value={reason} onChange={(event) => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} /></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>{translate("ra.action.cancel")}</Button>
        <Button disabled={busy || !reason.trim()} color="warning" variant="contained" onClick={revoke}>{translate("admin.revoke")}</Button></DialogActions>
    </Dialog>
  </>;
}
