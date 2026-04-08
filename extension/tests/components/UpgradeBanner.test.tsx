import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpgradeBanner } from '../../src/components/UpgradeBanner';

beforeEach(() => {
  // jsdom does not implement chrome.* — provide a minimal stub
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
  };
});

describe('UpgradeBanner', () => {
  it('renders the static "Pro features in development" copy', async () => {
    render(<UpgradeBanner />);
    expect(
      await screen.findByText(/Pro features in development/i),
    ).toBeDefined();
  });

  it('shows a waitlist link with an external href', async () => {
    render(<UpgradeBanner />);
    const link = await screen.findByRole('link', { name: /waitlist/i });
    expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('hides itself after the dismiss button is clicked and persists dismissal', async () => {
    render(<UpgradeBanner />);
    const dismiss = await screen.findByRole('button', { name: /dismiss/i });
    fireEvent.click(dismiss);
    expect(screen.queryByText(/Pro features in development/i)).toBeNull();
    expect((globalThis as any).chrome.storage.local.set).toHaveBeenCalledWith({
      upgradeBannerDismissed: true,
    });
  });

  it('does not call fetch, XMLHttpRequest, or any network API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never);
    render(<UpgradeBanner />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
