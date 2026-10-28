import { isAndroid, isIos } from '@braintree/browser-detection';
import { initAppModal } from '@utils/app-modal';
import { BASE_URL, safeExecute } from '@utils/helpers';
import type { ReferralInvite, ReferralInviteOffer } from '@utils/types';
import qrcode from 'qrcode-generator';

/**
 * Refer page — `www.solid.xyz/refer?ref=CODE`, the referral link the app has
 * always shared. "Get the app" beside "Sign up now" opens the same download
 * modal as Home — a QR code and the store buttons (see `initAppModal`). When
 * the visitor arrives with a code, this hands the invite on to the app:
 *
 * - The code is looked up on the public invite endpoint and, when it is valid,
 *   a banner names who invited them and what they get.
 * - The modal carries the invite. On desktop its QR code is swapped for one of
 *   the app share link, `app.solid.xyz/invite/CODE`, so the invite can be
 *   carried over to a phone. On a phone, where there is nothing to scan, the
 *   QR code gives way to an "Open in the Solid app" link to that same share
 *   link — a universal / app link, so it opens the app when installed and the
 *   web invite page otherwise. Either way the code is shown under it.
 * - Store links carry the code into a fresh install, the modal's included:
 *   Google Play links get it in the install referrer, and tapping an App Store
 *   link on mobile first copies `solid-invite:CODE` to the clipboard for the
 *   app to read on first launch. Links into the web app get `ref=CODE`,
 *   whichever of the accepted query params the code arrived in.
 *
 * Visitors without a code get the page exactly as authored, the modal as on
 * Home: nothing is injected or rewritten. A code the endpoint reports as
 * unknown keeps the page generic too; when the endpoint cannot be reached the
 * code is trusted, since it came from a share link, and only the banner is
 * left out.
 *
 * Optional Designer hook — an empty Div Block with `data-refer-slot="invite"`
 * chooses where the "<username> invited you" banner goes (default: straight
 * after the page's first `h1`). It stays collapsed until it is filled (see
 * refer.css), so it costs no space on a page without a code.
 */

/** Query params a referral code may arrive in, in order of preference. */
const INVITE_CODE_PARAMS = ['ref', 'refCode', 'referralCode', 'r'];
const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{4,12}$/;

const INVITE_LOOKUP_TIMEOUT_MS = 4000;

/** How long an App Store tap waits for the clipboard before navigating anyway. */
const CLIPBOARD_TIMEOUT_MS = 400;
const CLIPBOARD_PREFIX = 'solid-invite:';

const PLAY_REFERRER_SOURCE = 'refer_page';

const APP_ORIGIN = new URL(BASE_URL.app).origin;
const APP_HOSTS = ['app.solid.xyz', 'app-qa.solid.xyz'];

/** Marks the page once handled, so embedding the script twice does nothing twice. */
const INIT_ATTRIBUTE = 'data-refer-invite';
/** Marks the download modal once it carries the invite. */
const MODAL_ATTRIBUTE = 'data-refer-invite-modal';

/** Light modules around the code; four is the minimum scanners expect. */
const QR_QUIET_ZONE = 4;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type InviteLookup =
  | { status: 'valid'; invite: ReferralInvite }
  | { status: 'invalid' }
  | { status: 'unknown' };

function readInviteCode(search: string): string | null {
  const params = new URLSearchParams(search);

  for (const name of INVITE_CODE_PARAMS) {
    const value = params.get(name)?.trim();
    if (value && INVITE_CODE_PATTERN.test(value)) return value.toUpperCase();
  }

  return null;
}

function parseUrl(href: string | null): URL | null {
  if (!href) return null;
  try {
    return new URL(href, window.location.href);
  } catch {
    return null;
  }
}

/**
 * Resolves `unknown` rather than rejecting on any failure — including the
 * endpoint not being deployed yet — so callers only have the one branch.
 */
async function lookupInvite(code: string): Promise<InviteLookup> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), INVITE_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${BASE_URL.accounts}/accounts/v1/referral/invite/${encodeURIComponent(code)}`,
      { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return { status: 'unknown' };

    const data = (await response.json()) as Partial<ReferralInvite> | null;
    if (data?.valid === true) return { status: 'valid', invite: data as ReferralInvite };
    if (data?.valid === false) return { status: 'invalid' };
    return { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
  } finally {
    window.clearTimeout(timeout);
  }
}

/** `$10`, `$1,000`, `$7.50`; `null` for anything that is not a positive amount. */
function formatUsd(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;

  const digits = Number.isInteger(value) ? 0 : 2;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function describeSpendCondition({
  spendTargetUsd,
  windowDays,
}: Pick<ReferralInviteOffer, 'spendTargetUsd' | 'windowDays'>): string {
  const target = formatUsd(spendTargetUsd);
  if (!target) return '';

  const days =
    Number.isInteger(windowDays) && windowDays > 0
      ? ` in ${windowDays} ${windowDays === 1 ? 'day' : 'days'}`
      : '';
  return ` when you spend ${target}${days}`;
}

function describeOffer({ program, offer, legacyOffer }: ReferralInvite): string | null {
  if (program !== 'legacy' && offer) {
    const credit = formatUsd(offer.friendCreditUsd);
    return credit ? `Get ${credit} to spend with your card${describeSpendCondition(offer)}` : null;
  }

  if (legacyOffer) {
    const reward = formatUsd(legacyOffer.friendRewardUsd);
    return reward ? `Get ${reward}${describeSpendCondition(legacyOffer)}` : null;
  }

  return null;
}

function readUsername(invite: ReferralInvite): string | null {
  const username = invite.referrer?.username;
  if (typeof username !== 'string') return null;

  const characters = Array.from(username.trim().replace(/\s+/g, ' '));
  if (!characters.length) return null;
  return characters.length > 32 ? `${characters.slice(0, 31).join('')}…` : characters.join('');
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Everything from the API goes in through `textContent`, never as markup. */
function createInviteBanner(invite: ReferralInvite): HTMLElement | null {
  const username = readUsername(invite);
  const offer = describeOffer(invite);
  if (!username && !offer) return null;

  const banner = createElement('div', 'refer-invite');

  if (username) {
    const avatar = createElement(
      'span',
      'refer-invite_avatar',
      Array.from(username)[0].toUpperCase()
    );
    avatar.setAttribute('aria-hidden', 'true');
    banner.append(avatar);
  } else {
    banner.classList.add('is-plain');
  }

  const text = createElement('div', 'refer-invite_text');
  text.append(
    createElement(
      'p',
      'refer-invite_title',
      username ? `${username} invited you` : 'You’re invited'
    )
  );
  if (offer) text.append(createElement('p', 'refer-invite_offer', offer));
  banner.append(text);

  return banner;
}

/**
 * Draws the code as one SVG path — each run of dark modules in a row is a
 * single rectangle — on a white field that includes the quiet zone, so it
 * scans whatever surface it sits on.
 */
function createQrSvg(text: string): SVGSVGElement {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const size = count + QR_QUIET_ZONE * 2;

  let path = '';
  for (let row = 0; row < count; row += 1) {
    let col = 0;
    while (col < count) {
      if (!qr.isDark(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < count && qr.isDark(row, col)) col += 1;
      const run = col - start;
      path += `M${start + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h${run}v1h-${run}z`;
    }
  }

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code that opens your Solid invite');

  const background = document.createElementNS(SVG_NAMESPACE, 'rect');
  background.setAttribute('width', `${size}`);
  background.setAttribute('height', `${size}`);
  background.setAttribute('fill', '#fff');

  const modules = document.createElementNS(SVG_NAMESPACE, 'path');
  modules.setAttribute('d', path);
  modules.setAttribute('fill', '#000');

  svg.append(background, modules);
  return svg;
}

function createInviteQr(shareUrl: string): HTMLElement {
  const frame = createElement('div', 'refer-invite_modal-qr');
  frame.append(createQrSvg(shareUrl));
  return frame;
}

function createOpenAppLink(shareUrl: string): HTMLAnchorElement {
  const link = createElement('a', 'refer-invite_open', 'Open in the Solid app');
  link.href = shareUrl;
  return link;
}

function createCodeCaption(code: string): HTMLElement {
  const caption = createElement('p', 'refer-invite_qr-caption');
  caption.append(
    createElement('span', 'refer-invite_qr-label', 'Invite code'),
    createElement('span', 'refer-invite_code', code)
  );
  return caption;
}

/**
 * Puts the invite into the download modal: its QR code (`.app_qr`) becomes
 * the app share link on desktop, or an "Open in the Solid app" link on a
 * phone, with the code shown after the caption. Its store buttons need nothing
 * here — the click handler covers them wherever they are.
 */
function personaliseAppModal(modal: HTMLElement, code: string, isMobile: boolean) {
  if (modal.hasAttribute(MODAL_ATTRIBUTE)) return;

  const qr = modal.querySelector('.app_qr');
  if (!qr) return;
  modal.setAttribute(MODAL_ATTRIBUTE, code);

  const shareUrl = `${APP_ORIGIN}/invite/${code}`;
  qr.replaceWith(isMobile ? createOpenAppLink(shareUrl) : createInviteQr(shareUrl));

  // "Scan to download the app" — still true on desktop, of a different code;
  // on a phone there is nothing left to scan.
  const caption = modal.querySelector('.modal_body .description-lg');
  if (caption) {
    if (isMobile) caption.remove();
    else caption.textContent = 'Scan with your phone to get the app';
  }

  modal.querySelector('.modal_body')?.append(createCodeCaption(code));
}

/**
 * Puts `node` in the Designer's `data-refer-slot` when there is one, else
 * straight after the first fallback anchor that exists.
 */
function place(node: HTMLElement, slot: string, fallbacks: Array<Element | null>): boolean {
  const slotElement = document.querySelector(`[data-refer-slot="${slot}"]`);
  if (slotElement) {
    slotElement.append(node);
    return true;
  }

  const anchor = fallbacks.find((element): element is Element => !!element?.isConnected);
  if (!anchor) return false;

  anchor.insertAdjacentElement('afterend', node);
  return true;
}

function renderInvite(
  lookup: InviteLookup,
  code: string,
  isMobile: boolean,
  modal: HTMLElement | null
) {
  // A code the backend does not know would only lead to an "invalid invite"
  // screen, so the page stays generic.
  if (lookup.status === 'invalid') return;

  const banner = lookup.status === 'valid' ? createInviteBanner(lookup.invite) : null;
  if (banner) place(banner, 'invite', [document.querySelector('h1')]);

  if (modal) personaliseAppModal(modal, code, isMobile);
}

/** Play hands `referrer` to the app on first launch (Install Referrer API). */
function addPlayReferrer(link: HTMLAnchorElement, code: string) {
  const url = parseUrl(link.getAttribute('href'));
  if (url?.hostname !== 'play.google.com') return;

  const referrer = new URLSearchParams(url.searchParams.get('referrer') ?? '');
  referrer.set('ref', code);
  referrer.set('utm_source', PLAY_REFERRER_SOURCE);
  url.searchParams.set('referrer', referrer.toString());

  link.setAttribute('href', url.toString());
}

/**
 * main.ts already copies the page's query onto these links, but only under the
 * param name the code arrived in; the web app reads `ref`. If main.ts runs
 * after this it may set `ref` back to the code as typed — the backend matches
 * codes case-insensitively, so either spelling works.
 */
function addAppRef(link: HTMLAnchorElement, code: string) {
  const url = parseUrl(link.getAttribute('href'));
  if (!url || !APP_HOSTS.includes(url.hostname)) return;

  url.searchParams.set('ref', code);
  link.setAttribute('href', url.toString());
}

/** Never rejects: a refused or unsupported clipboard just means no copy. */
function copyInviteCode(code: string): Promise<void> {
  try {
    const write = navigator.clipboard?.writeText(`${CLIPBOARD_PREFIX}${code}`);
    return write ? write.catch(() => undefined) : Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

function opensInThisTab(event: MouseEvent, link: HTMLAnchorElement): boolean {
  const target = link.target.toLowerCase();
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (target === '' || target === '_self') &&
    !link.hasAttribute('download')
  );
}

/**
 * Delegated, so store links added after load (a modal, say) are covered too.
 *
 * iOS only lets a page write to the clipboard during the tap itself, so the
 * write starts synchronously. A same-tab navigation would tear the page down
 * mid-write, so that case waits for the write — briefly, and navigates whether
 * or not it lands. A link opening elsewhere leaves this page alive, so it is
 * not held up at all.
 */
function handleStoreLinkClick(event: MouseEvent, code: string, isMobile: boolean) {
  if (!(event.target instanceof Element)) return;

  const playLink = event.target.closest<HTMLAnchorElement>('a[href*="play.google.com"]');
  if (playLink) {
    addPlayReferrer(playLink, code);
    return;
  }

  if (!isMobile) return;

  const appStoreLink = event.target.closest<HTMLAnchorElement>('a[href*="apps.apple.com"]');
  if (!appStoreLink || parseUrl(appStoreLink.getAttribute('href'))?.hostname !== 'apps.apple.com') {
    return;
  }

  const copied = copyInviteCode(code);
  if (event.defaultPrevented || !opensInThisTab(event, appStoreLink)) return;

  event.preventDefault();

  const { href } = appStoreLink;
  let navigated = false;
  const navigate = () => {
    if (navigated) return;
    navigated = true;
    window.location.assign(href);
  };

  window.setTimeout(navigate, CLIPBOARD_TIMEOUT_MS);
  copied.then(navigate, navigate);
}

function initReferInvite(modal: HTMLElement | null) {
  const code = readInviteCode(window.location.search);
  if (!code) return;

  const root = document.documentElement;
  if (root.hasAttribute(INIT_ATTRIBUTE)) return;
  root.setAttribute(INIT_ATTRIBUTE, code);

  const isMobile = isIos() || isAndroid();

  // Links are handled straight away, so a tap that beats the lookup still
  // carries the code.
  document
    .querySelectorAll<HTMLAnchorElement>('a[href*="play.google.com"]')
    .forEach((link) => safeExecute(addPlayReferrer, link, code));
  document
    .querySelectorAll<HTMLAnchorElement>('a[href*="app.solid.xyz"], a[href*="app-qa.solid.xyz"]')
    .forEach((link) => safeExecute(addAppRef, link, code));
  document.addEventListener('click', (event) =>
    safeExecute(handleStoreLinkClick, event, code, isMobile)
  );

  lookupInvite(code).then((lookup) => safeExecute(renderInvite, lookup, code, isMobile, modal));
}

window.Webflow ||= [];
window.Webflow.push(() => {
  // "Get the app" opens the download modal whether or not there is a code.
  const modal = safeExecute(initAppModal) ?? null;
  safeExecute(initReferInvite, modal);
});
