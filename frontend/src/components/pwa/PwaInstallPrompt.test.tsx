/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstallPrompt } from './PwaInstallPrompt';

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
}

const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';

describe('landing-page PWA install card', () => {
  beforeEach(() => {
    localStorage.clear();
    setUserAgent(safari);
  });

  it('keeps the iPhone entry point after closing steps, a remount, and an old dismissal', () => {
    localStorage.setItem('elofix.pwa.installDismissed', '1');
    const { unmount } = render(<PwaInstallPrompt />);
    const open = screen.getByRole('button', { name: 'How to add EloFix' });
    expect(open).toBeVisible();
    fireEvent.click(open);
    expect(screen.getByRole('region', { name: 'Install EloFix' })).toHaveTextContent('Add to Home Screen');
    fireEvent.click(screen.getByRole('button', { name: 'Close install instructions' }));
    expect(screen.queryByRole('region', { name: 'Install EloFix' })).not.toBeInTheDocument();
    expect(open).toBeVisible();
    unmount();
    render(<PwaInstallPrompt />);
    expect(screen.getByRole('button', { name: 'How to add EloFix' })).toBeVisible();
  });

  it('explains Chrome on iPhone without claiming to trigger an iOS install', () => {
    setUserAgent(safari.replace('Version/17.5', 'CriOS/125.0'));
    render(<PwaInstallPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'How to add EloFix' }));
    expect(screen.getByRole('region', { name: 'Install EloFix' })).toHaveTextContent('In Chrome');
  });

  it('offers the native browser prompt when available, then marks an installed app', async () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    render(<PwaInstallPrompt />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    await act(async () => window.dispatchEvent(event));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install EloFix' })));
    expect(prompt).toHaveBeenCalledOnce();
    await act(async () => window.dispatchEvent(new Event('appinstalled')));
    expect(screen.getByRole('button', { name: 'Installed on this device' })).toBeDisabled();
  });
});
