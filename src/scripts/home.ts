import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/light.css';
import 'tippy.js/animations/scale.css';
import 'swiper/css';
import 'swiper/css/autoplay';

import { getFormFieldValue } from '@finsweet/ts-utils';
import { BASE_URL, safeExecute } from '@utils/helpers';
import type { JoinWaitlistBody } from '@utils/types';
import gsap from 'gsap';
import { ScrollTrigger, SplitText } from 'gsap/all';
import Swiper from 'swiper';
import { Autoplay } from 'swiper/modules';
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

async function fetchTotalApy(className: string) {
  const totalApyElement = document.querySelector(className) as HTMLElement;
  if (!totalApyElement) return;

  const response = await fetch(`${BASE_URL.analytics}/analytics/v1/yields/total-apy`);
  const data = await response.json();

  totalApyElement.innerHTML = `${data.toFixed(2)}%`;
}

function initTippy() {
  tippy('[data-tippy-content]', {
    theme: 'light',
    animation: 'scale',
  });
}

function initSwiperInfiniteLogos(className: string) {
  const swiperElement = document.querySelector(`.swiper${className}`);
  if (!swiperElement) return;

  const wrapper = swiperElement.querySelector(`.swiper-wrapper${className}`);
  if (!wrapper) return;

  // Duplicate children to get more slides
  const children = Array.from(wrapper.children);
  children.forEach((child) => {
    const clone = child.cloneNode(true);
    wrapper.appendChild(clone);
  });

  new Swiper(`.swiper${className}`, {
    spaceBetween: 40,
    speed: 6000,
    loop: true,
    slidesPerView: 'auto',
    allowTouchMove: false,
    autoplay: {
      delay: 0,
      disableOnInteraction: false,
    },
    modules: [Autoplay],
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(initGsap);
  safeExecute(animateHeroContent, '.hero_content');
  safeExecute(animateRevealParagraph, '.intro_content p');
  safeExecute(joinWaitlist, '.form_form.is-waitlist');
  safeExecute(fetchTotalApy, '#total-apy');
  safeExecute(initTippy);
  safeExecute(initSwiperInfiniteLogos, '.is-partner');
});
