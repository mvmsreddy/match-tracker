import { Outlet } from 'react-router-dom';
import AppNav from './AppNav';

export default function AppShell() {
  return (
    <AppNav>
      <Outlet />
    </AppNav>
  );
}
