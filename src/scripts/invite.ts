import { BASE_URL, safeExecute } from '@utils/helpers';
import type { WaitlistUser } from '@utils/types';

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


async function getWaitlistUser(email: string): Promise<WaitlistUser | null> {
  try {
    const response = await fetch(`${BASE_URL.waitlist}/waitlist/v1/waitlist/user?email=${email}`);

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching waitlist user:', error);
    return null;
  }
}

async function updateWaitlistInfo() {
  const urlParams = new URLSearchParams(window.location.search);
  const email = urlParams.get('email');
  if (!email) return;

  const user = await getWaitlistUser(email);
  if (!user) return;

  const positionElement = document.getElementById('waitlist-position');
  if (positionElement) {
    positionElement.textContent = `#${user.position}`;
  }

  const inviteLinkElement = document.getElementById('invite-link');
  if (inviteLinkElement) {
    const inviteUrl = `${window.location.origin}?w=${user.referralCode}`;
    inviteLinkElement.textContent = inviteUrl;
  }
}


window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(copyToClipboard, '.invite_waitlist-link');
  safeExecute(updateWaitlistInfo);
});
