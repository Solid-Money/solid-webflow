import { BASE_URL, isProduction, safeExecute } from '@utils/helpers';

/**
 * Point app links at the current environment and carry campaign params across.
 *
 * Webflow authors these links against the production host, so on the staging
 * site every "open the app" button would otherwise hand visitors straight to
 * production. Rewriting the origin here keeps staging self-contained without
 * needing a second set of links maintained in the designer.
 */
function normalizeAppLinks() {
  const urlParams = new URLSearchParams(window.location.search);

  // Matches the production host only, which is what the designer authors. A
  // link already pointing at `app-qa.solid.xyz` does not contain this substring
  // and is left alone.
  const appLinks = document.querySelectorAll<HTMLAnchorElement>('a[href*="app.solid.xyz"]');

  appLinks.forEach((link) => {
    const currentHref = link.getAttribute('href') || `${BASE_URL.app}/`;
    const url = new URL(currentHref);

    if (!isProduction) {
      const { protocol, host } = new URL(BASE_URL.app);
      url.protocol = protocol;
      url.host = host;
    }

    urlParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    link.setAttribute('href', url.toString());
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(normalizeAppLinks);
});
