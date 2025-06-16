import { safeExecute } from '@utils/helpers';

function copyToClipboard(className: string) {
  const container = document.querySelector(className);
  if (!container) return;

  const copyIcon = container.querySelector('#copy-icon');
  const checkIcon = container.querySelector('#check-icon');
  if (!copyIcon || !checkIcon) return;

  copyIcon.addEventListener('click', () => {
    const text = container.textContent || '';
    navigator.clipboard.writeText(text);

    copyIcon.setAttribute('style', 'display: none');
    checkIcon.setAttribute('style', 'display: block');

    setTimeout(() => {
      copyIcon.setAttribute('style', 'display: block');
      checkIcon.setAttribute('style', 'display: none');
    }, 1000);
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(copyToClipboard, '.invite_waitlist-link');
});
