/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALL_DISMISS_KEY } from '@/pwa/installPrompt';
import { PwaInstallPrompt } from './PwaInstallPrompt';

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

describe('PwaInstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    );
  });

  it('shows iPhone instructions and does not show them again after dismiss', () => {
    const { unmount } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PwaInstallPrompt />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: 'Install EloFix' })).toHaveTextContent(
      'On iPhone, tap Share, then Add to Home Screen.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Install EloFix' })).not.toBeInTheDocument();
    expect(localStorage.getItem(INSTALL_DISMISS_KEY)).toBe('1');
    unmount();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PwaInstallPrompt />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('region', { name: 'Install EloFix' })).not.toBeInTheDocument();
  });

  it('hides guidance on the payment return route', () => {
    render(
      <MemoryRouter
        initialEntries={['/payments/return?intentId=pi-1']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <PwaInstallPrompt />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('region', { name: 'Install EloFix' })).not.toBeInTheDocument();
  });

  it('shows an Android install action when the browser offers one', async () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PwaInstallPrompt />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('region', { name: 'Install EloFix' })).not.toBeInTheDocument();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    await act(async () => {
      window.dispatchEvent(event);
    });

    expect(await screen.findByRole('button', { name: 'Install' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    });
    expect(prompt).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Install EloFix' })).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(INSTALL_DISMISS_KEY)).toBe('1');
  });
});
