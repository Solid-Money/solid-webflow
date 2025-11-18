import { safeExecute } from '@utils/helpers';

function attachReferralParam(selector: string) {
  const referSignup = document.querySelector<HTMLAnchorElement>(selector);
  if (!referSignup) return;

  referSignup.addEventListener('click', (e) => {
    e.preventDefault();

    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (ref && referSignup.href) {
      const targetUrl = new URL(referSignup.href);
      targetUrl.searchParams.set('ref', ref);
      window.location.href = targetUrl.toString();
    } else {
      window.location.href = referSignup.href;
    }
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(attachReferralParam, '#refer-signup');
});
