import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import { Admin, Resource } from "react-admin";
import { ActivityList } from "./Activity.js";
import { AdminLayout } from "./AdminLayout.js";
import { AdminLogin } from "./AdminLogin.js";
import { AuditList } from "./Audit.js";
import { Dashboard } from "./Dashboard.js";
import { i18nProvider } from "./i18n.js";
import { authProvider, dataProvider } from "./providers.js";
import { UserList, UserShow } from "./Users.js";

export function App() {
  return <Admin title="Storyteller Admin" dashboard={Dashboard} authProvider={authProvider} dataProvider={dataProvider}
    i18nProvider={i18nProvider} loginPage={AdminLogin} layout={AdminLayout} requireAuth disableTelemetry>
    <Resource name="users" list={UserList} show={UserShow} icon={PeopleAltOutlinedIcon} />
    <Resource name="activity" list={ActivityList} icon={TimelineOutlinedIcon} />
    <Resource name="audit" list={AuditList} icon={FactCheckOutlinedIcon} />
  </Admin>;
}
