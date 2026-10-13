import { SITE } from './config';

// Header for the React pages of the website (the static pages have the same markup in HTML).
export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="brand" href="/" aria-label="TrichFree home"><img src="/icons/48.png" alt="" width="32" height="32" /><span>TrichFree</span></a>
          <nav className="site-nav static-nav" aria-label="Main">
            <ul>
              <li><a href="/#how">How it works</a></li>
              <li><a href="/privacy/">Privacy</a></li>
              {right ?? (SITE.accounts ? <li><a className="btn" href="/app/">Sign in</a></li> : null)}
            </ul>
          </nav>
        </div>
      </header>
    </>
  );
}
