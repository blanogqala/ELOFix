import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  isIosInstallSurface,
  readInstallDismissed,
  shouldOfferInstall,
  writeInstallDismissed,
  type InstallOffer,
} from '@/pwa/installPrompt';
import { isStandaloneDisplay } from '@/pwa/standaloneLaunch';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallPrompt() {
  const location = useLocation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => readInstallDismissed(window.localStorage));
  const [standalone, setStandalone] = useState(() => isStandaloneDisplay());

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      writeInstallDismissed(window.localStorage);
      setDismissed(true);
      setStandalone(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const offer: InstallOffer | null = shouldOfferInstall({
    dismissed,
    standalone,
    ios: isIosInstallSurface(navigator.userAgent, navigator.platform, navigator.maxTouchPoints || 0),
    hasInstallPrompt: Boolean(deferred),
    pathname: location.pathname,
  });

  if (!offer) return null;

  const dismiss = () => {
    writeInstallDismissed(window.localStorage);
    setDismissed(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') {
      writeInstallDismissed(window.localStorage);
      setDismissed(true);
    }
  };

  return (
    <div
      className="print:hidden border-b border-border bg-card px-3 py-2 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] text-foreground"
      role="region"
      aria-label="Install EloFix"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 sm:gap-3">
        <img src="/pwa/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-lg" />
        <p className="min-w-[12rem] flex-1 text-xs leading-snug sm:text-sm">
          {offer === 'android'
            ? 'Install EloFix on your Android home screen so it opens in its own window.'
            : 'On iPhone, tap Share, then Add to Home Screen.'}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {offer === 'android' ? (
            <Button type="button" size="sm" onClick={() => void install()}>
              Install
            </Button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
