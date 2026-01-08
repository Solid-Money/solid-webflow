import { safeExecute } from '@utils/helpers';

function forwardUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.toString()) return;

  // Find all app links and forward URL params to them
  const appLinks = document.querySelectorAll<HTMLAnchorElement>('a[href*="app.solid.xyz"]');

  appLinks.forEach((link) => {
    const currentHref = link.getAttribute('href') || 'https://app.solid.xyz';
    const url = new URL(currentHref);

    urlParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    link.setAttribute('href', url.toString());
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(forwardUrlParams);
});
