// An unknown address with direct links back to the dashboard.

import { useEffect } from 'react';
import { setPageName } from '../lib/appearance.ts';
import { Link, useLocation } from 'react-router-dom';

export function NotFound() {
  const { pathname } = useLocation();
  useEffect(() => {
    setPageName('Not found');
    return () => setPageName('');
  }, []);
  return (
    <div className="page not-found">
      <h1 className="page-title">Nothing here.</h1>
      <p>
        Patchboard has no page at <code>{pathname}</code>. A link may be old, or the address has a typo.
      </p>
      <p className="not-found-links">
        <Link to="/">Home</Link>
        <Link to="/stacks">Stacks</Link>
        <Link to="/apps">Apps</Link>
        <Link to="/settings">Settings</Link>
      </p>
    </div>
  );
}
