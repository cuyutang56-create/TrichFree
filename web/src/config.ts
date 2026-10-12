// Website configuration, all public and set at build time (see .env.example). Anything unset is hidden on the
// page rather than replaced with a placeholder: no dead links, no fake forms.
const env = import.meta.env as Record<string, string | undefined>;
const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const SITE = {
  url: env.VITE_SITE_URL?.replace(/\/+$/, ''),
  contactEmail: env.VITE_CONTACT_EMAIL || undefined,
  githubUrl: env.VITE_GITHUB_URL || 'https://github.com/cuyutang56-create/TrichFree',
  storeUrl: env.VITE_EXTENSION_STORE_URL || undefined,
  downloadUrl: env.VITE_EXTENSION_DOWNLOAD_URL || undefined,
  /** Extension ids allowed to answer the website (Chrome Web Store id and/or a pinned pilot build id). */
  extensionIds: list(env.VITE_EXTENSION_IDS),
};
