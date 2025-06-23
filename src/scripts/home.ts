import { FORM_CSS_CLASSES, getFormFieldValue } from '@finsweet/ts-utils';
import gsap from 'gsap';
import { ScrollTrigger, SplitText } from 'gsap/all';

import { BASE_URL, safeExecute } from '@utils/helpers';
import type { JoinWaitlistBody } from '@utils/types';

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

        if (response.status === 409) {
          window.location.href = `${window.location.origin}/invite?email=${email}`;
          return;
        }

        if (!response.ok) {
          throw new Error(`API call failed: ${response.status}`);
        }

        const successMessage = form.parentElement?.querySelector(`.${FORM_CSS_CLASSES.successMessage}`) as HTMLElement;
        if (!successMessage) return;

        form.style.display = 'none';
        successMessage.style.display = 'block';
      } catch (error) {
        console.error('Error joining waitlist:', error);
        submitButton.value = 'Error while joining';
        submitButton.disabled = false;
      }
    });
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(initGsap);
  safeExecute(animateHeroContent, '.hero_content');
  safeExecute(animateRevealParagraph, '.intro_content p');
  safeExecute(joinWaitlist, '.form_form.is-waitlist');
});
