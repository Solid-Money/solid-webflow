import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/light.css';
import 'tippy.js/animations/scale.css';
import 'swiper/css';

import { getFormFieldValue } from '@finsweet/ts-utils';
import { BASE_URL, safeExecute } from '@utils/helpers';
import type { ApyAsset, APYs, JoinWaitlistBody, LandingApyOverride } from '@utils/types';
import gsap from 'gsap';
import { ScrollTrigger, SplitText } from 'gsap/all';
import Swiper from 'swiper';
import { Navigation, Pagination } from 'swiper/modules';
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

async function fetchApyOverride(): Promise<LandingApyOverride | null> {
  try {
    const response = await fetch(`${BASE_URL.accounts}/accounts/v1/app-config/landing-page-apy`);
    if (!response.ok) return null;
    return (await response.json()) as LandingApyOverride;
  } catch (error) {
    console.error('Error fetching APY override:', error);
    return null;
  }
}

/**
 * Both APY consumers on this page hit the same two endpoints, so the responses
 * are shared rather than fetched once per consumer.
 */
let apyOverrideRequest: Promise<LandingApyOverride | null> | undefined;
let apysRequest: Promise<APYs> | undefined;

function getApyOverride() {
  apyOverrideRequest ??= fetchApyOverride();
  return apyOverrideRequest;
}

function getApys() {
  apysRequest ??= fetch(`${BASE_URL.analytics}/analytics/v1/bigquery-metrics/apys`).then(
    (response) => response.json() as Promise<APYs>
  );
  return apysRequest;
}

async function fetchTotalApy(selector: string) {
  const apyElements = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
  if (!apyElements.length) return;

  // An admin-managed override (set via the management portal) takes precedence
  // over the auto-computed APY when enabled.
  const override = await getApyOverride();
  if (override?.overrideEnabled) {
    if (override.mode === 'simple') {
      // Broadcast the single managed value to every APY element, shown exactly
      // as the admin entered it (no forced decimals, no % suffix).
      apyElements.forEach((element) => {
        element.innerHTML = `${override.apy}`;
      });
    } else {
      // Advanced: each element resolves to apys[asset][window]. The asset
      // defaults to USDC (data-apy-asset opts into others); the window comes
      // from data-apy (defaulting to all-time).
      apyElements.forEach((element) => {
        const asset = (element.dataset.apyAsset as ApyAsset) || 'usdc';
        const window = (element.dataset.apy as keyof APYs) || 'allTime';
        const value = override.apys?.[asset]?.[window];
        if (typeof value === 'number') {
          element.innerHTML = `${value}`;
        }
      });
    }
    return;
  }

  const data = await getApys();

  apyElements.forEach((element) => {
    const apyKey = element.dataset.apy;
    if (apyKey && apyKey in data) {
      element.innerHTML = `${data[apyKey as keyof APYs].toFixed(2)}%`;
    }
  });
}

/**
 * Home v4 — the Earn token chips. Each carries `data-token-apy` naming its
 * asset, and resolves against the same admin override the rest of the page
 * uses: a simple override goes on every chip, an advanced one is read per
 * asset, and anything the override does not carry (today that includes USDT,
 * which the override payload has no key for) falls back to the live all-time
 * figure. Unlike `[data-apy]` these always render their own `%`, so the chip
 * reads the same whichever branch supplied the number. On failure the chips
 * keep whatever was authored in the Designer.
 */
async function renderTokenApys(selector: string) {
  const elements = document.querySelectorAll<HTMLElement>(selector);
  if (!elements.length) return;

  const override = await getApyOverride();

  if (override?.overrideEnabled && override.mode === 'simple') {
    elements.forEach((element) => {
      element.innerHTML = `${override.apy}%`;
    });
    return;
  }

  // `apys` is keyed by the assets the override knows about; a chip may name one
  // it does not, hence the widened lookup rather than an ApyAsset index.
  const managed = override?.overrideEnabled
    ? (override.apys as Partial<Record<string, APYs>> | undefined)
    : undefined;

  const assets = [...elements].map((element) => element.dataset.tokenApy ?? '');
  const total = assets.every((asset) => typeof managed?.[asset]?.allTime === 'number')
    ? undefined
    : (await getApys()).allTime;

  elements.forEach((element, index) => {
    const value = managed?.[assets[index]]?.allTime;
    if (typeof value === 'number') element.innerHTML = `${value}%`;
    else if (typeof total === 'number') element.innerHTML = `${total.toFixed(2)}%`;
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

  const DURATION = 3;
  let currentImageIndex = 0;
  let isManualClick = false;
  let autoAdvanceTween: gsap.core.Tween | null = null;
  let autoAdvanceDelay: ReturnType<typeof gsap.delayedCall> | null = null;
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

  const toggleDetailContent = (detail: HTMLElement, isActive: boolean) => {
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

  const scheduleNext = (nextIndex: number) => {
    autoAdvanceDelay = gsap.delayedCall(DURATION, () => {
      autoAdvanceTween = null;
      autoAdvanceDelay = null;
      handleDetailToggle(nextIndex, false, true);
    });
  };

  const animateDivider = (detail: HTMLElement, index: number, total: number) => {
    const dividerForeground = detail.querySelector('.divider-foreground') as HTMLElement;
    const nextIndex = index < total - 1 ? index + 1 : 0;

    if (autoAdvanceTween) {
      autoAdvanceTween.kill();
      autoAdvanceTween = null;
    }
    if (autoAdvanceDelay) {
      autoAdvanceDelay.kill();
      autoAdvanceDelay = null;
    }

    if (!isManualClick) {
      if (dividerForeground) {
        gsap.set(dividerForeground, { width: '0%' });
        autoAdvanceTween = gsap.to(dividerForeground, {
          width: '100%',
          duration: DURATION,
          ease: 'none',
        });
      }
      scheduleNext(nextIndex);
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
      if (autoAdvanceDelay) {
        autoAdvanceDelay.kill();
        autoAdvanceDelay = null;
      }
    }

    const exitingIndex = currentImageIndex;
    transitionImage(exitingIndex, index);
    currentImageIndex = index;

    details.forEach((detail, i) => {
      const isActive = i === index;
      toggleDetailContent(detail as HTMLElement, isActive);

      const dividerForeground = detail.querySelector('.divider-foreground') as HTMLElement;
      if (dividerForeground) {
        gsap.set(dividerForeground, { width: '0%' });
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

/**
 * Home v4 — hero background video. The `<mux-background-video>` element lives in
 * a Webflow embed and holds its Mux stream in `data-src`, so nothing is fetched
 * until we decide it should be: visitors who ask for reduced motion or who are
 * on a metered connection keep the Mux thumbnail poster instead.
 *
 * The element renders its `<video>` on top of the slotted poster, and that video
 * paints opaque as soon as it has a source — so it is held at `opacity: 0` and
 * faded in on the first decoded frame. Any failure to play therefore leaves the
 * poster on screen rather than a black hero. The rendition is capped to the
 * viewport and playback pauses once the hero scrolls out of view.
 */
type MuxBackgroundVideoElement = HTMLElement & { video?: HTMLVideoElement | null };

const HERO_VIDEO_MOBILE_BREAKPOINT = 768;

function initHeroBackgroundVideo(selector: string) {
  const element = document.querySelector<MuxBackgroundVideoElement>(selector);
  const source = element?.dataset.src;
  if (!element || !source) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const savesData = Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  );
  if (prefersReducedMotion || savesData) return;

  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => {
          const { video } = element;
          if (!video) return;

          if (entry.isIntersecting) video.play().catch(() => undefined);
          else video.pause();
        })
      : undefined;

  customElements.whenDefined('mux-background-video').then(() => {
    const { video } = element;

    if (video) {
      video.style.opacity = '0';
      video.style.transition = 'opacity 0.6s ease';

      const revealVideo = () => {
        video.style.opacity = '1';
      };

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) revealVideo();
      else video.addEventListener('loadeddata', revealVideo, { once: true });
    }

    element.setAttribute(
      'max-resolution',
      window.innerWidth < HERO_VIDEO_MOBILE_BREAKPOINT ? '720p' : '1080p'
    );
    element.setAttribute('src', source);

    observer?.observe(element);
  });
}

/**
 * Home v4 — the feature phone enters from under the hero. It starts scaled up
 * and pushed up behind the hero background video with only the bottom sliver of
 * it showing, then travels down into the feature row and settles at its natural
 * size as the section scrolls in.
 *
 * The tuck is done by the section's own `overflow: hidden`: the feature section
 * sits flush under the hero, so anything the phone pushes above the section's
 * top edge is clipped rather than drawn over the video — no stacking context
 * juggling with the hero required.
 */
const PHONE_START_SCALE = 3;
/** Fraction of the scaled phone left showing below the hero at rest. */
const PHONE_VISIBLE_AT_START = 0.2;
/** Below this the row wraps, so the phone is no longer the centre column. */
const PHONE_ANIMATION_MIN_WIDTH = 992;
/** Where the section's top sits, as a fraction of the viewport, when the travel begins. */
const PHONE_TRAVEL_START = 0.7;

function initFeaturePhoneScroll(sectionSelector: string) {
  const section = document.querySelector<HTMLElement>(sectionSelector);
  const phone = section?.querySelector<HTMLImageElement>('.feature_v4-phone-img');
  const row = section?.querySelector<HTMLElement>('.feature_v4-row');
  if (!section || !phone || !row) return;

  gsap.matchMedia().add(
    {
      canAnimate: `(min-width: ${PHONE_ANIMATION_MIN_WIDTH}px) and (prefers-reduced-motion: no-preference)`,
    },
    (context) => {
      if (!context.conditions?.canAnimate) return;

      // Layout offsets rather than bounding rects: these must describe where the
      // phone sits *before* any transform, and offsetTop/offsetHeight ignore it.
      const layoutTopWithinSection = () => {
        let top = 0;
        let node: HTMLElement | null = phone;

        while (node && node !== section) {
          top += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }

        return top;
      };

      // Never zoom past the container, or the widest part of the travel gets its
      // sides cut off by the section instead of just its top.
      const startScale = () => Math.min(PHONE_START_SCALE, row.clientWidth / phone.offsetWidth);

      const startY = () =>
        -phone.offsetHeight * startScale() * (1 - PHONE_VISIBLE_AT_START) -
        layoutTopWithinSection();

      // The phone renders several times its layout width, so ask for a srcset
      // candidate that matches rather than the one sized for 22rem.
      phone.sizes = `${Math.round(phone.offsetWidth * startScale())}px`;

      gsap.set(phone, { transformOrigin: 'center top' });
      gsap.fromTo(
        phone,
        { y: startY, scale: startScale },
        {
          y: 0,
          scale: 1,
          // Linear: an eased-out travel spent almost all of itself in the first
          // half of the scroll, so the phone had already landed by the time the
          // section was properly in view. The smoothing on `scrub` is what
          // softens the motion now.
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            // Hold the tucked pose while the hero still fills the screen, then
            // travel. The end is the scroll offset at which the phone's resting
            // position is vertically centred, so it settles fully in frame
            // rather than already clipped by the top of the viewport:
            //   endScroll  = sectionTop + naturalTop - (viewport - height) / 2
            //   startScroll = sectionTop - PHONE_TRAVEL_START * viewport
            // which subtract to the distance below.
            start: `top ${PHONE_TRAVEL_START * 100}%`,
            end: () =>
              `+=${
                layoutTopWithinSection() +
                (PHONE_TRAVEL_START - 0.5) * window.innerHeight +
                phone.offsetHeight / 2
              }`,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        }
      );

      // Until the phone has loaded its height is 0, which would put the start
      // offset at the top of the section instead of behind the hero.
      if (!phone.complete) {
        phone.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
      }
    }
  );
}

/**
 * Home v4 — Earn. Spend. Move.
 * A single phone illustration is sticky-pinned in the centre column while the
 * left/right columns scroll. As each sub-section scrolls through the viewport
 * centre, the corresponding phone screen is cross-faded in (via the `is-active`
 * class, animated by the CSS opacity transition). The phone therefore appears
 * to "fly" across the three sub-sections, switching screens as it goes.
 */
function initStickyPhone(sectionSelector: string) {
  const section = document.querySelector(sectionSelector);
  if (!section) return;

  const screens = gsap.utils.toArray<HTMLElement>('.esm_v4-screen', section);
  const panels = gsap.utils.toArray<HTMLElement>('.esm_v4-panel', section);
  if (!screens.length || panels.length !== screens.length) return;

  // Below the desktop breakpoint the three screens are laid out one per
  // sub-section and all visible at once, so there is nothing to cross-fade.
  gsap.matchMedia().add(`(min-width: ${PHONE_ANIMATION_MIN_WIDTH}px)`, () => {
    const setActiveScreen = (index: number) => {
      screens.forEach((screen, i) => {
        screen.classList.toggle('is-active', i === index);
      });
    };

    panels.forEach((panel, index) => {
      ScrollTrigger.create({
        trigger: panel,
        start: 'top center',
        end: 'bottom center',
        scrub: false,
        onEnter: () => setActiveScreen(index),
        onEnterBack: () => setActiveScreen(index),
      });
    });

    setActiveScreen(0);
  });
}

/**
 * Home v4 — neobank feature carousel. Initialises Swiper on the Webflow-authored
 * slider (3.5 slides in view) and wires it to the Webflow-authored navigation
 * arrows (`.neobank_v4-navbtn.is-prev` / `.is-next`) and pagination container
 * (`.neobank_v4-dots`). No DOM is created here — the markup lives in Webflow.
 * Swiper toggles `swiper-button-disabled` on an arrow when there is no slide in
 * that direction and renders the pagination bullets into the dots container
 * (both runtime hooks are styled in home.css).
 */
function initNeobankSwiper(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element || element.dataset.swiperReady) return;
  element.dataset.swiperReady = 'true';

  const scope = element.closest<HTMLElement>('.section_neobank-v4') ?? document;
  const prevEl = scope.querySelector<HTMLElement>('.neobank_v4-navbtn.is-prev');
  const nextEl = scope.querySelector<HTMLElement>('.neobank_v4-navbtn.is-next');
  const dotsEl = scope.querySelector<HTMLElement>('.neobank_v4-dots');

  new Swiper(element, {
    modules: [Navigation, Pagination],
    slidesPerView: 1.15,
    spaceBetween: 16,
    grabCursor: true,
    watchOverflow: true,
    navigation: prevEl && nextEl ? { prevEl, nextEl } : undefined,
    pagination: dotsEl ? { el: dotsEl, clickable: true } : undefined,
    breakpoints: {
      480: { slidesPerView: 2.2, spaceBetween: 20 },
      768: { slidesPerView: 2.5, spaceBetween: 24 },
      992: { slidesPerView: 3, spaceBetween: 24 },
    },
  });
}

/**
 * Home v4 — "Get the app" / "Join now" / "Get started" buttons open the existing
 * modal. Openers are marked with `data-app-modal="open"`; the modal is revealed
 * by setting its display and closed via the backdrop, close buttons, or the
 * Escape key.
 */
function initAppModal(openSelector: string) {
  const modal = document.querySelector<HTMLElement>('.modal');
  const openers = document.querySelectorAll<HTMLElement>(openSelector);
  if (!modal || !openers.length) return;

  const openModal = () => {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
  const closeModal = () => {
    modal.style.display = '';
    document.body.style.overflow = '';
  };

  openers.forEach((opener) => {
    opener.addEventListener('click', (event) => {
      event.preventDefault();
      openModal();
    });
  });

  const background = modal.querySelector('.modal_background');
  background?.addEventListener('click', closeModal);

  modal
    .querySelectorAll('[data-app-modal="close"], .modal_close, .modal-close')
    .forEach((closer) => closer.addEventListener('click', closeModal));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
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
  // Home v4
  safeExecute(initHeroBackgroundVideo, '.hero_v4-bg-video-el');
  safeExecute(initFeaturePhoneScroll, '.section_feature-v4');
  safeExecute(renderTokenApys, '[data-token-apy]');
  safeExecute(initStickyPhone, '.section_esm-v4');
  safeExecute(initNeobankSwiper, '.neobank_v4-swiper');
  safeExecute(initAppModal, '[data-app-modal="open"]');
});
