import { Outlet } from "react-router-dom";

export function AuthenticatedLayout() {
  return (
    <main>
      <Outlet />
    </main>
  );
}
