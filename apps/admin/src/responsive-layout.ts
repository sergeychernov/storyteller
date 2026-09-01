export const userShowTabsProps = {
  allowScrollButtonsMobile: false,
  className: "user-show-tabs",
  scrollButtons: "auto",
  variant: "scrollable",
} as const;

export const accessManagementHeaderSx = {
  alignItems: { xs: "stretch", sm: "center" },
  flexDirection: { xs: "column", sm: "row" },
  gap: 2,
  justifyContent: "space-between",
  minWidth: 0,
} as const;
