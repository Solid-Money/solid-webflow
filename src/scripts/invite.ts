import { confetti } from '@tsparticles/confetti';
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

async function getWaitlistUser(id: string): Promise<WaitlistUser | null> {
  try {
    const response = await fetch(`${BASE_URL.waitlist}/waitlist/v1/waitlist/user?id=${id}`);

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
  const id = urlParams.get('id');
  if (!id) return;

  const user = await getWaitlistUser(id);
  if (!user) return;

  const positionElement = document.getElementById('waitlist-position');
  if (positionElement) {
    positionElement.textContent = `#${user.position}`;
  }

  const nextPositionElement = document.getElementById('waitlist-next-position');
  if (nextPositionElement) {
    nextPositionElement.textContent = `#${user.nextPosition}`;
  }

  const inviteLinkElement = document.getElementById('invite-link');
  if (inviteLinkElement) {
    const inviteUrl = `${window.location.origin}?w=${user.referralCode}`;
    inviteLinkElement.textContent = inviteUrl;
  }
}

function animateConfetti() {
  const duration = 1 * 1000;
  const animationEnd = Date.now() + duration;

  (function frame() {
    const timeLeft = animationEnd - Date.now();

    confetti({
      count: 1,
      ticks: 0,
      origin: {
        x: Math.random(),
        y: 0,
      },
      colors: ['#94F27F'],
      shapes: ['circle', 'square', 'polygon', 'heart', 'hearts', 'spades', 'clubs', 'diamonds'],
      gravity: 8,
      scalar: 3,
    });

    if (timeLeft > 0) {
      requestAnimationFrame(frame);
    }
  })();
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(copyToClipboard, '.invite_waitlist-link');
  safeExecute(updateWaitlistInfo);
  safeExecute(animateConfetti);
});
