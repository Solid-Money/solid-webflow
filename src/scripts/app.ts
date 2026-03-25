import { isAndroid, isIos } from '@braintree/browser-detection';
import { safeExecute } from '@utils/helpers';

const APP_STORE_URL = 'https://apps.apple.com/il/app/solid-superapp-llc/id6758618401';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=xyz.solid.android';

function redirectToAppStore() {
  if (isIos()) {
    window.location.href = APP_STORE_URL;
  } else if (isAndroid()) {
    window.location.href = PLAY_STORE_URL;
  }
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(redirectToAppStore);
});
