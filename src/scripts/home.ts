import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/light.css';
import 'tippy.js/animations/scale.css';

import { getFormFieldValue } from '@finsweet/ts-utils';
import { BASE_URL, safeExecute } from '@utils/helpers';
import type { APYs, JoinWaitlistBody } from '@utils/types';
import gsap from 'gsap';
import { ScrollTrigger, SplitText } from 'gsap/all';
import tippy from 'tippy.js';

function initGsap() {
  gsap.registerPlugin(SplitText, ScrollTrigger);

  ScrollTrigger.defaults({
    scrub: 1,
    toggleActions: 'play none none reverse',
  });
}

function animateHeroContent(className: string) {
  const content = document.querySelector(className);
  if (!content) return;

  gsap.to(content, {
    scrollTrigger: {
      trigger: content,
      start: 'top 10%',
    },
    opacity: 0,
    scale: 0,
    ease: 'none',
    onComplete: () => {
      ScrollTrigger.refresh();
    },
  });
}

function animateRevealParagraph(className: string) {
  const paragraphs = document.querySelectorAll(className);
  if (!paragraphs?.length) return;

  paragraphs.forEach((paragraph) => {
    const splitText = new SplitText(paragraph, { type: 'words' });
    const { words } = splitText;

    gsap.set(words, { opacity: 0.1 });
    gsap.set(paragraph, { opacity: 1 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: paragraph,
        start: 'top 80%',
        end: 'bottom 20%',
      },
    });

    words.forEach((word) => {
      tl.to(word, { opacity: 1, duration: 0.5 }, '<0.1');
    });
  });
}

function trackWaitlistJoin(email: string) {
  twq('event', 'tw-q5qho-q5qhp', {
    email_address: email,
  });
}

function joinWaitlist(className: string) {
  const webflowForms = document.querySelectorAll(className) as NodeListOf<HTMLFormElement>;
  if (!webflowForms) return;

  webflowForms.forEach((webflowForm) => {
    const form = webflowForm.cloneNode(true) as HTMLFormElement;
    webflowForm.parentNode?.replaceChild(form, webflowForm);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const submitButton = form.querySelector('input[type="submit"]') as HTMLInputElement;
      if (!submitButton) return;

      try {
        submitButton.value = 'Joining';
        submitButton.disabled = true;

        const emailField = form.querySelector('input[type="email"]') as HTMLInputElement;
        if (!emailField) {
          throw new Error('Email field not found');
        }

        const email = getFormFieldValue(emailField);
        if (!email) {
          throw new Error('Email is required');
        }

        const urlParams = new URLSearchParams(window.location.search);
        const referralCode = urlParams.get('w');

        const body: JoinWaitlistBody = { email };
        if (referralCode) {
          body.referralCode = referralCode;
        }

        const response = await fetch(`${BASE_URL.waitlist}/waitlist/v1/waitlist/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const data = await response.json();

        if (!response.ok && response.status !== 409) {
          throw new Error(`API call failed: ${response.status}`);
        }

        safeExecute(trackWaitlistJoin, email);
        window.location.href = `${window.location.origin}/invite?id=${data.data._id}`;
      } catch (error) {
        console.error('Error joining waitlist:', error);
        submitButton.value = 'Error while joining';
        submitButton.disabled = false;
      }
    });
  });
}

async function fetchTotalApy(selector: string) {
  const apyElements = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
  if (!apyElements.length) return;

  const response = await fetch(`${BASE_URL.analytics}/analytics/v1/bigquery-metrics/apys`);
  const data = (await response.json()) as APYs;

  apyElements.forEach((element) => {
    const apyKey = element.dataset.apy;
    if (apyKey && apyKey in data) {
      element.innerHTML = `${data[apyKey as keyof APYs].toFixed(2)}%`;
    }
  });
}

function initTippy() {
  tippy('[data-tippy-content]', {
    theme: 'light',
    animation: 'scale',
  });
}

function toggleDetail(selector: string) {
  const details = document.querySelectorAll(`.${selector}`);
  const images = document.querySelectorAll(`.${selector}_image`) as NodeListOf<HTMLElement>;

  if (!details.length) return;

  let currentImageIndex = 0;
  images.forEach((image, imgIndex) => {
    if (imgIndex === 0) {
      gsap.set(image, { visibility: 'visible', opacity: 1, y: 0 });
    } else {
      gsap.set(image, { visibility: 'hidden', opacity: 0, y: 0 });
    }
  });

  details.forEach((detail, index) => {
    const allChildren = Array.from(detail.children) as HTMLElement[];
    const originalGap = window.getComputedStyle(detail).gap || '1rem';

    if (index !== 0) {
      gsap.set(detail, { gap: '0' });
      allChildren.forEach((child) => {
        if (!child.classList.contains(`${selector}_title`)) {
          gsap.set(child, {
            height: 0,
            opacity: 0,
            overflow: 'hidden',
          });
        }
      });
    }

    detail.addEventListener('click', () => {
      const exitingImageIndex = currentImageIndex;
      const isMovingDown = exitingImageIndex < index;
      const exitingY = isMovingDown ? -50 : 50;
      const enteringY = isMovingDown ? 50 : -50;

      if (images[exitingImageIndex] && exitingImageIndex !== index) {
        gsap.to(images[exitingImageIndex], {
          y: exitingY,
          opacity: 0,
          duration: 0.3,
          ease: 'power2.inOut',
          onComplete: () => {
            gsap.set(images[exitingImageIndex], { visibility: 'hidden' });
          },
        });
      }

      if (images[index] && exitingImageIndex !== index) {
        gsap.set(images[index], { visibility: 'visible', y: enteringY, opacity: 0 });
        gsap.to(images[index], {
          y: 0,
          opacity: 1,
          duration: 0.3,
          ease: 'power2.inOut',
        });
      }

      currentImageIndex = index;

      details.forEach((otherDetail, otherIndex) => {
        const otherChildren = Array.from(otherDetail.children) as HTMLElement[];

        if (otherIndex === index) {
          gsap.to(otherDetail, {
            gap: originalGap,
            duration: 0.3,
            ease: 'power2.inOut',
          });
          otherChildren.forEach((child) => {
            gsap.to(child, {
              height: 'auto',
              opacity: 1,
              duration: 0.3,
              ease: 'power2.inOut',
            });
          });
        } else {
          gsap.to(otherDetail, {
            gap: '0',
            duration: 0.3,
            ease: 'power2.inOut',
          });
          otherChildren.forEach((child) => {
            if (!child.classList.contains(`${selector}_title`)) {
              gsap.to(child, {
                height: 0,
                opacity: 0,
                duration: 0.3,
                ease: 'power2.inOut',
              });
            }
          });
        }
      });
    });
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(initGsap);
  safeExecute(animateHeroContent, '.hero_content');
  safeExecute(animateRevealParagraph, '.intro_content p');
  safeExecute(joinWaitlist, '.form_form.is-waitlist');
  safeExecute(fetchTotalApy, '[data-apy]');
  safeExecute(initTippy);
  safeExecute(toggleDetail, 'earn');
  safeExecute(toggleDetail, 'wallet');
});
