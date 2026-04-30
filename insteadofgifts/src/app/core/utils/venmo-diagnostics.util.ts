export interface VenmoDiagnostics {
  browserLabel: string;
  hostname: string;
  isAndroid: boolean;
  isChrome: boolean;
  isFacebookInApp: boolean;
  isIOS: boolean;
  isInstagramInApp: boolean;
  isSafari: boolean;
  isTikTokInApp: boolean;
  isWebView: boolean;
  language: string;
  paypalVenmoEligible: boolean;
  reasonHint: string;
  userAgent: string;
}

export function collectVenmoDiagnostics(paypalVenmoEligible: boolean): VenmoDiagnostics | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null;
  }

  const userAgent = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(userAgent);
  const isChrome = /(Chrome|CriOS)/i.test(userAgent) && !/(EdgA|EdgiOS|OPR|SamsungBrowser)/i.test(userAgent);
  const isFacebookInApp = /(FBAN|FBAV|FB_IAB|FBSN|Messenger)/i.test(userAgent);
  const isInstagramInApp = /Instagram/i.test(userAgent);
  const isTikTokInApp = /TikTok/i.test(userAgent);
  const isAndroidWebView = /\bwv\b/i.test(userAgent);
  const isIOSWebView = isIOS && /AppleWebKit/i.test(userAgent) && !/Safari/i.test(userAgent);
  const isWebView = isAndroidWebView || isIOSWebView || isFacebookInApp || isInstagramInApp || isTikTokInApp;

  let browserLabel = 'Desktop or unknown browser';
  if (isIOS && isSafari) browserLabel = 'iPhone Safari';
  else if (isIOS && isChrome) browserLabel = 'iPhone Chrome';
  else if (isAndroid && isChrome) browserLabel = 'Android Chrome';
  else if (isAndroid) browserLabel = 'Android non-Chrome browser';
  else if (isIOS) browserLabel = 'iPhone non-Safari browser';

  let reasonHint = 'PayPal marked this session as ineligible for Venmo.';
  if (isWebView) {
    reasonHint = 'This page appears to be inside an in-app browser or webview.';
  } else if (isIOS && !isSafari) {
    reasonHint = 'Venmo on iPhone requires Safari.';
  } else if (isAndroid && !isChrome) {
    reasonHint = 'Venmo on Android requires Chrome.';
  } else if (!paypalVenmoEligible) {
    reasonHint = 'Browser support looks plausible, so the remaining checks are usually US buyer eligibility or Venmo app/account availability.';
  }

  return {
    browserLabel,
    hostname: window.location.hostname,
    isAndroid,
    isChrome,
    isFacebookInApp,
    isIOS,
    isInstagramInApp,
    isSafari,
    isTikTokInApp,
    isWebView,
    language: navigator.language,
    paypalVenmoEligible,
    reasonHint,
    userAgent,
  };
}

export function getVenmoSupportMessage(diagnostics: VenmoDiagnostics | null): string {
  if (!diagnostics) {
    return 'Venmo is only available for eligible US buyers and supported devices or browsers.';
  }

  if (diagnostics.isWebView) {
    return 'Venmo is not available inside in-app browsers. Open this page in Safari on iPhone or Chrome on Android.';
  }

  if (diagnostics.isIOS && !diagnostics.isSafari) {
    return 'Venmo on iPhone requires Safari. Open this page in Safari and try again.';
  }

  if (diagnostics.isAndroid && !diagnostics.isChrome) {
    return 'Venmo on Android requires Chrome. Open this page in Chrome and try again.';
  }

  return 'Venmo is only available for eligible US buyers with the Venmo app installed.';
}
