// Landing page behaviour: mobile navigation, the pilot interest form, configured links and extension detection.
// The Supabase client is only loaded when someone actually submits the form.
import './site.css';
import { SITE } from './config';
import { detectExtension } from './bridge';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
const $$ = <T extends HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel));

function setupNav() {
  const toggle = $<HTMLButtonElement>('.nav-toggle');
  const nav = $<HTMLElement>('#site-nav');
  if (!toggle || !nav) return;
  const close = () => { toggle.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  });
  nav.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function setupLinks() {
  for (const el of $$<HTMLElement>('[data-year]')) el.textContent = String(new Date().getFullYear());
  for (const a of $$<HTMLAnchorElement>('[data-github-link]')) a.href = SITE.githubUrl;
  if (SITE.contactEmail) {
    for (const a of $$<HTMLAnchorElement>('[data-contact-link]')) { a.href = `mailto:${SITE.contactEmail}`; a.textContent = a.textContent === 'Contact' ? 'Contact' : SITE.contactEmail; }
    for (const el of $$<HTMLElement>('[data-contact-item]')) el.hidden = false;
  } else {
    for (const el of $$<HTMLElement>('[data-contact-line]')) el.remove();
  }
  const store = $<HTMLAnchorElement>('#ext-store');
  if (store && SITE.storeUrl) { store.href = SITE.storeUrl; store.hidden = false; }
  const dl = $<HTMLAnchorElement>('#ext-download');
  if (dl && SITE.downloadUrl) {
    dl.href = SITE.downloadUrl;
    dl.hidden = false;
    if (!SITE.storeUrl) dl.classList.add('primary');
    const steps = $<HTMLElement>('#ext-install');
    if (steps) steps.hidden = false;
  }
}

async function setupExtension() {
  const ext = await detectExtension();
  if (ext) { const el = $<HTMLElement>('#ext-detected'); if (el) el.hidden = false; }
}

const ROLES = ['self', 'parent', 'clinician', 'researcher', 'other'] as const;

function setupPilotForm() {
  const form = $<HTMLFormElement>('#pilot-form');
  const done = $<HTMLElement>('#pilot-done');
  const unavailable = $<HTMLElement>('#pilot-unavailable');
  const error = $<HTMLElement>('#pilot-error');
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  if (!form || !done || !error) return;
  if (!url || !key) { if (unavailable) unavailable.hidden = false; return; }
  form.hidden = false;

  const showError = (msg: string, field?: HTMLElement | null) => {
    error.textContent = msg;
    error.hidden = false;
    (field ?? error).focus?.();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const role = String(data.get('role') ?? '');
    const note = String(data.get('note') ?? '').trim();
    const emailInput = form.querySelector<HTMLInputElement>('#pilot-email');
    emailInput?.setAttribute('aria-invalid', 'false');
    if (String(data.get('website') ?? '')) { done.hidden = false; form.hidden = true; return; } // honeypot: bots fill every field
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      emailInput?.setAttribute('aria-invalid', 'true');
      return showError('Please enter a valid email address.', emailInput);
    }
    if (!(ROLES as readonly string[]).includes(role)) return showError('Please choose who you are.', form.querySelector<HTMLInputElement>('input[name="role"]'));
    if (!data.get('age')) return showError('Please confirm your age (or that you are a parent or guardian).', form.querySelector<HTMLInputElement>('input[name="age"]'));
    if (!data.get('consent')) return showError('Please agree that we may email you about the pilot.', form.querySelector<HTMLInputElement>('input[name="consent"]'));
    if (note.length > 500) return showError('Please keep the note under 500 characters.', form.querySelector<HTMLTextAreaElement>('#pilot-note'));

    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const [{ createClient }, { submitPilotInterest }] = await Promise.all([import('@supabase/supabase-js'), import('../../src/sync/remote')]);
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      await submitPilotInterest(client, { email, role: role as (typeof ROLES)[number], ageConfirmed: true, contactConsent: true, note: note || undefined });
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      showError(/offline/i.test(msg) ? 'You appear to be offline. Please try again when connected.'
        : /too many/i.test(msg) ? 'A lot of people are signing up right now. Please try again in a few minutes.'
        : 'Sorry, that did not go through. Please try again.');
    } finally {
      button.disabled = false;
      button.textContent = 'Register interest';
    }
  });
}

/** A build without a backend (for example a demo copy) leaves out sign-in and the pilot form instead of showing dead ends. */
function removeAccountFeatures() {
  if (!SITE.accounts) for (const el of $$<HTMLElement>('[data-needs-accounts]')) el.remove();
}

removeAccountFeatures();
setupNav();
setupLinks();
setupPilotForm();
void setupExtension();
