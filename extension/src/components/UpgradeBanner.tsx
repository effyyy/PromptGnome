/**
 * UpgradeBanner — static, logic-free "Pro coming soon" banner.
 *
 * Architecture note: this is the ONLY component in the public free-tier
 * extension that mentions Pro. It must contain zero network calls, zero
 * license/feature-flag checks, and zero references to PRO_BUILD. It is
 * a dismissible banner with a link to the public waitlist. Dismissal is
 * persisted in chrome.storage.local under the key "upgradeBannerDismissed".
 */
import { useEffect, useState } from 'react';

const WAITLIST_URL = 'https://promptgnome.com/waitlist';
const STORAGE_KEY = 'upgradeBannerDismissed';

/**
 * Renders a compact "Pro features in development" banner with a waitlist CTA.
 *
 * The banner is dismissible; dismissal is persisted in chrome.storage.local
 * so it survives extension reloads. Contains zero network calls and zero
 * license or feature-flag checks.
 *
 * @returns React element for the banner, or null when dismissed or before hydration.
 */
export function UpgradeBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    chrome.storage.local
      .get(STORAGE_KEY)
      .then((result) => {
        if (cancelled) return;
        setDismissed(Boolean(result[STORAGE_KEY]));
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hydrated || dismissed) {
    return null;
  }

  const handleDismiss = (): void => {
    setDismissed(true);
    chrome.storage.local.set({ [STORAGE_KEY]: true }).catch(() => {
      // Best-effort persistence; UI state already updated.
    });
  };

  return (
    <div
      role="region"
      aria-label="Pro coming soon"
      className="flex items-center justify-between gap-3 rounded-md border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-100"
    >
      <span>
        <strong>Pro features in development.</strong>{' '}
        <a
          href={WAITLIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-cyan-300"
        >
          Join the waitlist
        </a>
        .
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="rounded px-2 py-0.5 text-cyan-300 hover:bg-cyan-500/20"
      >
        ×
      </button>
    </div>
  );
}
