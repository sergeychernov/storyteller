import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import { Layout, Menu, type LayoutProps } from "react-admin";

function AdminMenu() {
  return <Menu>
    <Menu.DashboardItem primaryText="admin.dashboard" leftIcon={<DashboardOutlinedIcon />} />
    <Menu.ResourceItems />
  </Menu>;
}

export function AdminLayout(props: LayoutProps) {
  return <Layout {...props} menu={AdminMenu} />;
}
