import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  Alert, Chip, CircularProgress, InputAdornment, Paper, Stack, TextField as MuiTextField, Typography,
} from "@mui/material";
import type { AdminAccessCatalogEntry, AdminAccessRole } from "@storyteller/schemas";
import { useMemo, useState } from "react";
import { Title, useGetList, useLocaleState, useTranslate } from "react-admin";
import {
  getAccessReference, getAccessRules, type AccessReferenceKind,
} from "./access-reference.js";

export function AccessReferencePage() {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const [search, setSearch] = useState("");
  const roles = useGetList<AdminAccessRole>("accessRoles", catalogQuery());
  const cohorts = useGetList<AdminAccessCatalogEntry>("accessCohorts", catalogQuery());
  const capabilities = useGetList<AdminAccessCatalogEntry>("accessCapabilities", catalogQuery());
  const limits = useGetList<AdminAccessCatalogEntry>("accessLimits", catalogQuery());
  const pending = roles.isPending || cohorts.isPending || capabilities.isPending || limits.isPending;
  const failed = roles.isError || cohorts.isError || capabilities.isError || limits.isError;

  const sections = useMemo(() => [
    { kind: "role" as const, title: translate("admin.roles"), entries: roles.data ?? [] },
    { kind: "capability" as const, title: translate("admin.capabilities"), entries: capabilities.data ?? [] },
    { kind: "cohort" as const, title: translate("admin.cohorts"), entries: cohorts.data ?? [] },
    { kind: "limit" as const, title: translate("admin.limits"), entries: limits.data ?? [] },
  ], [roles.data, capabilities.data, cohorts.data, limits.data, translate]);

  return <main className="access-reference-page">
    <Title title={translate("resources.accessReference.name")} />
    <Typography component="h1" variant="h4">{translate("admin.accessReferenceTitle")}</Typography>
    <Typography className="access-reference-intro">{translate("admin.accessReferenceIntro")}</Typography>
    <Alert severity="info">
      <Typography component="h2" variant="subtitle1">{translate("admin.accessRules")}</Typography>
      <ol>{getAccessRules(locale).map((rule) => <li key={rule}>{rule}</li>)}</ol>
    </Alert>
    <MuiTextField fullWidth value={search} onChange={(event) => setSearch(event.target.value)}
      label={translate("admin.accessReferenceSearch")} className="access-reference-search"
      slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlinedIcon /></InputAdornment> } }} />
    {pending && <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}><CircularProgress size={20} />{translate("ra.message.loading")}</Stack>}
    {failed && <Alert severity="error">{translate("admin.accessReferenceLoadFailed")}</Alert>}
    {!pending && !failed && sections.map((section) => <ReferenceSection key={section.kind}
      kind={section.kind} title={section.title} entries={filterEntries(section.kind, section.entries, search, locale)} locale={locale}
      emptyText={translate("admin.accessReferenceNoMatches")} includedLabel={translate("admin.includedCapabilities")}
      archivedLabel={translate("admin.archived")} />)}
  </main>;
}

function ReferenceSection(props: {
  readonly kind: AccessReferenceKind;
  readonly title: string;
  readonly entries: readonly (AdminAccessCatalogEntry | AdminAccessRole)[];
  readonly locale: string;
  readonly emptyText: string;
  readonly includedLabel: string;
  readonly archivedLabel: string;
}) {
  return <section className="access-reference-section">
    <Typography component="h2" variant="h5">{props.title}</Typography>
    {props.entries.length === 0 ? <Typography color="text.secondary">{props.emptyText}</Typography> :
      <div className="access-reference-grid">{props.entries.map((entry) => {
        const reference = getAccessReference(props.kind, entry.code, props.locale);
        const roleCapabilities = "capabilities" in entry ? entry.capabilities : undefined;
        return <Paper component="article" variant="outlined" className="access-reference-card" key={entry.code}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
            <div><Typography component="h3" variant="subtitle1">{reference.name}</Typography><code>{entry.code}</code></div>
            <Stack direction="row" sx={{ gap: 0.5 }}>
              {!reference.documented && <Chip size="small" color="warning" label="?" />}
              {entry.archived && <Chip size="small" label={props.archivedLabel} />}
            </Stack>
          </Stack>
          <Typography>{reference.description}</Typography>
          {roleCapabilities && <div>
            <Typography component="h4" variant="caption">{props.includedLabel}</Typography>
            <ul>{roleCapabilities.map((code) => <li key={code}><code>{code}</code> — {getAccessReference("capability", code, props.locale).name}</li>)}</ul>
          </div>}
        </Paper>;
      })}</div>}
  </section>;
}

export function filterEntries<T extends AdminAccessCatalogEntry>(
  kind: AccessReferenceKind,
  entries: readonly T[],
  search: string,
  locale: string,
): readonly T[] {
  const query = search.trim().toLocaleLowerCase(locale);
  if (!query) return entries;
  return entries.filter((entry) => {
    const reference = getAccessReference(kind, entry.code, locale);
    return `${entry.code} ${reference.name} ${reference.description}`.toLocaleLowerCase(locale).includes(query);
  });
}

function catalogQuery() {
  return { pagination: { page: 1, perPage: 100 }, sort: { field: "code", order: "ASC" as const }, filter: {} };
}
