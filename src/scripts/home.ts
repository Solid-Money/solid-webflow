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
  const section = document.querySelector(`.section_${selector}`) as HTMLElement;
  const details = document.querySelectorAll(`.section_${selector} .${selector}`);
  const images = document.querySelectorAll(
    `.section_${selector} .${selector}_image`
  ) as NodeListOf<HTMLElement>;

  if (!details.length || !section) return;

  let currentImageIndex = 0;
  let isManualClick = false;
  let autoAdvanceTween: gsap.core.Tween | null = null;
  const hasImages = images.length === details.length;
  const animationConfig = { duration: 0.3, ease: 'power2.inOut' as const };
  const originalGaps = new Map<HTMLElement, string>();
  const excludedClasses = [
    `${selector}_title`,
    'divider',
    'divider-background',
    'divider-foreground',
  ];

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const activeDetail = details[currentImageIndex] as HTMLElement;
          if (activeDetail) {
            animateDivider(activeDetail, currentImageIndex, details.length);
          }
          observer.unobserve(section);
        }
      });
    },
    { threshold: 0.1 }
  );
  observer.observe(section);

  details.forEach((detail) => {
    const computedGap = window.getComputedStyle(detail as HTMLElement).gap || '1rem';
    originalGaps.set(detail as HTMLElement, computedGap);
  });

  images.forEach((image, i) => {
    gsap.set(image, {
      visibility: i === 0 ? 'visible' : 'hidden',
      opacity: i === 0 ? 1 : 0,
      y: 0,
    });
  });

  const transitionImage = (fromIndex: number, toIndex: number) => {
    if (!hasImages || fromIndex === toIndex) return;

    const isMovingDown = fromIndex < toIndex;
    const exitingY = isMovingDown ? -50 : 50;
    const enteringY = isMovingDown ? 50 : -50;

    if (images[fromIndex]) {
      gsap.to(images[fromIndex], {
        y: exitingY,
        opacity: 0,
        ...animationConfig,
        onComplete: () => {
          gsap.set(images[fromIndex], { visibility: 'hidden' });
        },
      });
    }

    if (images[toIndex]) {
      gsap.set(images[toIndex], { visibility: 'visible', y: enteringY, opacity: 0 });
      gsap.to(images[toIndex], { y: 0, opacity: 1, ...animationConfig });
    }
  };

  const toggleDetailContent = (detail: HTMLElement, isActive: boolean, selector: string) => {
    const children = Array.from(detail.children) as HTMLElement[];
    const originalGap = originalGaps.get(detail) || '1rem';

    gsap.to(detail, {
      gap: isActive ? originalGap : '0',
      ...animationConfig,
    });

    children.forEach((child) => {
      const shouldExclude = excludedClasses.some((className) =>
        child.classList.contains(className)
      );

      if (isActive || !shouldExclude) {
        gsap.to(child, {
          height: shouldExclude ? undefined : isActive ? 'auto' : 0,
          opacity: shouldExclude ? undefined : isActive ? 1 : 0,
          ...animationConfig,
        });
      }
    });
  };

  const animateDivider = (detail: HTMLElement, index: number, total: number) => {
    const dividerForeground = detail.querySelector('.divider-foreground') as HTMLElement;
    if (!dividerForeground) return;

    if (autoAdvanceTween) {
      autoAdvanceTween.kill();
      autoAdvanceTween = null;
    }

    gsap.set(dividerForeground, { width: '0%' });

    if (index < total - 1 && !isManualClick) {
      autoAdvanceTween = gsap.to(dividerForeground, {
        width: '100%',
        duration: 3,
        ease: 'none',
        onComplete: () => {
          if (!isManualClick) {
            handleDetailToggle(index + 1, false, true);
          }
        },
      });
    }
  };

  const handleDetailToggle = (
    index: number,
    isClick: boolean = false,
    startAnimation: boolean = true
  ) => {
    if (isClick) {
      isManualClick = true;
      if (autoAdvanceTween) {
        autoAdvanceTween.kill();
        autoAdvanceTween = null;
      }
    }

    const exitingIndex = currentImageIndex;
    transitionImage(exitingIndex, index);
    currentImageIndex = index;

    details.forEach((detail, i) => {
      const isActive = i === index;
      toggleDetailContent(detail as HTMLElement, isActive, selector);

      const dividerForeground = detail.querySelector('.divider-foreground') as HTMLElement;
      if (dividerForeground) {
        gsap.set(dividerForeground, { width: isActive ? undefined : '0%' });
      }

      if (isActive && startAnimation) {
        animateDivider(detail as HTMLElement, index, details.length);
      }
    });

    if (isClick) {
      isManualClick = false;
    }
  };

  details.forEach((detail, index) => {
    if (index !== 0) {
      gsap.set(detail, { gap: '0' });
      Array.from(detail.children).forEach((child) => {
        const shouldExclude = excludedClasses.some((className) =>
          (child as HTMLElement).classList.contains(className)
        );
        if (!shouldExclude) {
          gsap.set(child as HTMLElement, { height: 0, opacity: 0, overflow: 'hidden' });
        }
      });
    }

    const dividerForeground = detail.querySelector('.divider-foreground') as HTMLElement;
    if (dividerForeground) {
      gsap.set(dividerForeground, { width: '0%' });
    }

    detail.addEventListener('click', () => handleDetailToggle(index, true));
  });

  handleDetailToggle(0, false, false);
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
