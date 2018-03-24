import DashboardPage from "views/Dashboard/Dashboard.jsx";
import UserProfile from "views/UserProfile/UserProfile.jsx";
import Rules from "views/Rules/Rules.jsx";
import NotificationsPage from "views/Notifications/Notifications.jsx";
import {ContentPaste, Dashboard, Notifications, Person} from "material-ui-icons";

const appRoutes = [
  {
    path: "/dashboard",
    sidebarName: "Dashboard",
    navbarName: "Material Dashboard",
    icon: Dashboard,
    component: DashboardPage
  },
  {
    path: "/user",
    sidebarName: "User Profile",
    navbarName: "Profile",
    icon: Person,
    component: UserProfile
  },
  {
    path: "/rules",
    sidebarName: "Rules",
    navbarName: "All Rules",
    icon: ContentPaste,
    component: Rules
  },
  {
    path: "/notifications",
    sidebarName: "Notifications",
    navbarName: "Notifications",
    icon: Notifications,
    component: NotificationsPage
  },
  {redirect: true, path: "/", to: "/rules", navbarName: "Redirect"}
];

export default appRoutes;
