import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface InstallStep {
  title: string;
  body: string;
}

export function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const isIpad = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (/iPhone|iPod/i.test(ua) || isIpad) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const androidReferrer = document.referrer.startsWith('android-app://');
  return !!mq || iosStandalone || androidReferrer;
}

export function installSteps(platform: InstallPlatform): InstallStep[] {
  if (platform === 'ios') {
    return [
      { title: 'Open in Safari', body: 'On iPhone or iPad, installation only works in Safari. If you are in another browser, copy this page link and open it in Safari.' },
      { title: 'Tap the Share button', body: 'Tap the Share icon (square with an arrow) in the Safari toolbar.' },
      { title: 'Choose Add to Home Screen', body: 'Scroll the share sheet and tap “Add to Home Screen”, then tap Add. CropManager will appear on your home screen like a normal app.' },
    ];
  }
  if (platform === 'android') {
    return [
      { title: 'Open the browser menu', body: 'In Chrome, tap the three-dot menu in the top-right corner.' },
      { title: 'Tap Install app or Add to Home screen', body: 'Chrome usually shows “Install app”. If you only see “Add to Home screen”, that also works in most versions.' },
      { title: 'Confirm', body: 'Tap Install/Add. CropManager will open full-screen from your home screen.' },
    ];
  }
  return [
    { title: 'Look for the install icon', body: 'In Chrome or Edge, click the install icon in the address bar (a small screen with a down arrow), or open the browser menu.' },
    { title: 'Choose Install CropManager', body: 'Select “Install CropManager…” from the menu.' },
    { title: 'Confirm', body: 'Click Install. CropManager opens in its own window and appears in your apps.' },
  ];
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandalone());
  const [platform] = useState<InstallPlatform>(() => detectPlatform());

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      console.log('PWA was installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Re-check in case the app was opened from the home screen after mount.
    setIsInstalled(isStandalone());

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * Native prompt when the browser offers one. Returns 'unavailable' on iOS
   * and on browsers that suppress beforeinstallprompt, so the caller can show
   * manual instructions instead of a dead button.
   */
  const handleInstallClick = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!installPrompt) return 'unavailable';
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setInstallPrompt(null);
    return outcome;
  };

  return {
    isInstallable: !!installPrompt,
    isInstalled,
    handleInstallClick,
    platform,
    steps: installSteps(platform),
  };
}
