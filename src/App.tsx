import { lazy, Suspense, type ReactNode } from 'react';
import { SessionProvider, useSession } from './lib/session';
import { ToastProvider, ConfirmProvider, Spinner } from './components/ui';
import { match, useLocation, useSwNavigation } from './lib/router';
import { Login } from './pages/Login';
import { Home } from './pages/Home';

const Chat = lazy(() => import('./pages/Chat'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const NoteEditor = lazy(() => import('./pages/NoteEditor'));
const DocumentView = lazy(() => import('./pages/DocumentView'));
const Research = lazy(() => import('./pages/Research'));
const Memory = lazy(() => import('./pages/Memory'));
const Actions = lazy(() => import('./pages/Actions'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));
const Routines = lazy(() => import('./pages/Routines'));
const Ramble = lazy(() => import('./pages/Ramble'));

function Router() {
  const { pathname } = useLocation();
  const { me, loading } = useSession();
  useSwNavigation();
  if (loading) return <Centered><Spinner lg /></Centered>;
  if (!me) return <Login />;

  const routes: [string, (p: Record<string, string>) => ReactNode][] = [
    ['/', () => <Home />],
    ['/chat', () => <Chat />],
    ['/chat/:id', (p) => <Chat id={p.id} />],
    ['/tasks', () => <Tasks />],
    ['/projects', () => <Projects />],
    ['/projects/:id', (p) => <ProjectDetail id={p.id} />],
    ['/knowledge', () => <Knowledge />],
    ['/knowledge/notes/:id', (p) => <NoteEditor id={p.id} />],
    ['/knowledge/documents/:id', (p) => <DocumentView id={p.id} />],
    ['/research', () => <Research />],
    ['/memory', () => <Memory />],
    ['/actions', () => <Actions />],
    ['/notifications', () => <Notifications />],
    ['/settings', () => <Settings />],
    ['/routines', () => <Routines />],
    ['/ramble', () => <Ramble />],
  ];
  for (const [pattern, render] of routes) {
    const params = match(pattern, pathname);
    if (params) return <Suspense fallback={<Centered><Spinner lg /></Centered>}>{render(params)}</Suspense>;
  }
  return <Home />;
}

const Centered = ({ children }: { children: ReactNode }) => <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>{children}</div>;

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <SessionProvider>
          <Router />
        </SessionProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
