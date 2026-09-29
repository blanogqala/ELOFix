import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isIosInstallSurface } from '@/pwa/installPrompt';
import { isStandaloneDisplay } from '@/pwa/standaloneLaunch';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Permanent landing-page entry point; closing the instructions never removes the card. */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());
  const ios = isIosInstallSurface(navigator.userAgent, navigator.platform, navigator.maxTouchPoints || 0);
  const chromeIos = ios && /CriOS/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setShowSteps(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (installed) return;
    if (!deferred) {
      setShowSteps(true);
      return;
    }
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') setShowSteps(false);
      else setShowSteps(true);
    } catch {
      setDeferred(null);
      setShowSteps(true);
    }
  };

  return (
    <section className="bg-accent px-4 py-8 md:py-6" aria-label="EloFix phone app">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between md:p-8">
        <div className="flex min-w-0 items-start gap-4">
          <img src="/pwa/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-xl border border-border" />
          <div>
            <h2 className="text-lg font-semibold text-foreground md:text-xl">EloFix on your phone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add EloFix to your Home Screen for quick access to requests, jobs and orders.
            </p>
            {ios && !installed && (
              <p className="mt-2 text-xs text-muted-foreground">Free to add. No App Store download needed.</p>
            )}
          </div>
        </div>
        <Button
          type="button"
          onClick={() => void install()}
          disabled={installed}
          className="shrink-0 gap-2 self-start sm:self-center"
          aria-expanded={showSteps}
          aria-controls="elofix-install-steps"
        >
          {installed ? <Smartphone className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {installed ? 'Installed on this device' : ios ? 'How to add EloFix' : 'Install EloFix'}
        </Button>
      </div>
      {showSteps && !installed && (
        <div id="elofix-install-steps" role="region" aria-label="Install EloFix" className="relative mx-auto mt-3 max-w-5xl rounded-xl border border-border bg-card p-5 text-sm text-foreground shadow-sm">
          <button type="button" onClick={() => setShowSteps(false)} className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Close install instructions">
            <X className="h-4 w-4" />
          </button>
          <h3 className="pr-8 font-semibold">Add EloFix to your Home Screen</h3>
          {ios ? (
            <ol className="mt-3 list-inside list-decimal space-y-2 text-muted-foreground">
              <li>In {chromeIos ? 'Chrome' : 'Safari'}, open the browser menu and tap Share.</li>
              <li>Choose Add to Home Screen, then tap Add.</li>
              <li>Open EloFix from its new Home Screen icon.</li>
            </ol>
          ) : (
            <p className="mt-3 text-muted-foreground">If your browser did not show an install window, open its menu and choose Install app or Add to Home Screen.</p>
          )}
          {ios && <p className="mt-3 text-xs text-muted-foreground">Your iPhone does not allow websites to start the Home Screen installation automatically.</p>}
        </div>
      )}
    </section>
  );
}
