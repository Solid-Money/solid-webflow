import { expect, type Page, test } from '@playwright/test';

/**
 * refer.ts against a stand-in for the Webflow /refer page. Every request is
 * intercepted — the page, the bundle (served by the `pnpm dev` web server),
 * the invite endpoint and the stores — so the suite needs no network.
 */

const PAGE_URL = 'https://www.solid.xyz/refer';
const BUNDLE_URL = 'http://localhost:3000/scripts/refer.js';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const PAGE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Refer</title>
    <script>window.Webflow = { push: (callback) => callback() };</script>
  </head>
  <body>
    <section class="section_refer_hero">
      <div class="container-large is-refer-hero">
        <div class="refer_hero-title">You are invited to join solid</div>
        <h1 class="refer_h1">Earn, Spend, Save Smarter</h1>
        <p class="refer_hero-description">Sign up with Solid.</p>
        <div class="refer_hero-buttons">
          <a id="signup" href="https://app.solid.xyz?utm_source=website">Sign up now</a>
        </div>
      </div>
    </section>
    <a id="app-store" href="https://apps.apple.com/il/app/solid-superapp-llc/id6758618401">App Store</a>
    <a id="play-store" href="https://play.google.com/store/apps/details?id=xyz.solid.android&hl=en">Google Play</a>
    <script src="/refer.js"></script>
  </body>
</html>`;

const V4_INVITE = {
  valid: true,
  code: 'AB12C',
  referrer: { username: 'dana' },
  program: 'v4',
  offer: { friendCreditUsd: 10, spendTargetUsd: 150, merchantTarget: 3, windowDays: 30 },
  legacyOffer: null,
};

const LEGACY_INVITE = {
  valid: true,
  code: 'XY9Z8',
  referrer: { username: 'sam' },
  program: 'legacy',
  offer: null,
  legacyOffer: {
    friendRewardUsd: 25,
    spendTargetUsd: 150,
    merchantTarget: 3,
    windowDays: 30,
    payoutToken: 'soFUSE',
  },
};

type InviteResponse = { status: number; body?: unknown };
type ClipboardMode = 'resolve' | 'hang';

/** Loads the stand-in page; returns the invite codes looked up and the clipboard writes. */
async function openReferPage(
  page: Page,
  search: string,
  invite: InviteResponse = { status: 200, body: V4_INVITE },
  clipboardMode: ClipboardMode = 'resolve'
) {
  const lookups: string[] = [];
  const clipboard: string[] = [];

  await page.exposeFunction('recordClipboardWrite', (text: string) => {
    clipboard.push(text);
  });
  await page.addInitScript((mode: ClipboardMode) => {
    const record = (window as unknown as { recordClipboardWrite: (text: string) => Promise<void> })
      .recordClipboardWrite;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) =>
          mode === 'hang' ? (record(text), new Promise<void>(() => undefined)) : record(text),
      },
    });
  }, clipboardMode);

  // Later routes take precedence, so this catch-all only sees what nothing else claims.
  await page.route('**/*', (route) => route.abort());
  await page.route(
    (url) => url.hostname === 'www.solid.xyz' && url.pathname === '/refer',
    (route) => route.fulfill({ contentType: 'text/html', body: PAGE_HTML })
  );
  await page.route(
    (url) => url.hostname === 'www.solid.xyz' && url.pathname === '/refer.js',
    async (route) => route.fulfill({ response: await page.request.get(BUNDLE_URL) })
  );
  await page.route(
    (url) => url.hostname === 'accounts.solid.xyz',
    (route) => {
      lookups.push(new URL(route.request().url()).pathname);
      return route.fulfill({
        status: invite.status,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify(invite.body ?? {}),
      });
    }
  );
  await page.route(
    (url) => url.hostname === 'apps.apple.com' || url.hostname === 'play.google.com',
    (route) => route.fulfill({ contentType: 'text/html', body: '<title>Store</title>' })
  );

  await page.goto(`${PAGE_URL}${search}`);
  return { lookups, clipboard };
}

async function searchParamsOf(page: Page, selector: string) {
  return new URL((await page.locator(selector).getAttribute('href')) ?? '').searchParams;
}

test.describe('refer page on desktop', () => {
  test('personalises the hero and shows a QR card for a valid v4 code', async ({ page }) => {
    const { lookups } = await openReferPage(page, '?ref=ab12c');

    const banner = page.locator('h1 + .refer-invite');
    await expect(banner.locator('.refer-invite_title')).toHaveText('dana invited you');
    await expect(banner.locator('.refer-invite_offer')).toHaveText(
      'Get $10 to spend with your card when you spend $150 in 30 days'
    );
    await expect(banner.locator('.refer-invite_avatar')).toHaveText('D');
    expect(lookups).toEqual(['/accounts/v1/referral/invite/AB12C']);

    const card = page.locator('.refer_hero-buttons + .refer-invite_qr');
    await expect(card).toBeVisible();
    await expect(card.locator('svg[role="img"] path')).toHaveCount(1);
    await expect(card.locator('.refer-invite_code')).toHaveText('AB12C');
    await expect(page.locator('.refer-invite_open')).toHaveCount(0);

    const play = await searchParamsOf(page, '#play-store');
    expect(play.get('referrer')).toBe('ref=AB12C&utm_source=refer_page');
    expect(play.get('id')).toBe('xyz.solid.android');
    expect(play.get('hl')).toBe('en');

    const signup = await searchParamsOf(page, '#signup');
    expect(signup.get('ref')).toBe('AB12C');
    expect(signup.get('utm_source')).toBe('website');
  });

  test('reads the code from an alias param and describes a legacy offer', async ({ page }) => {
    const { lookups } = await openReferPage(page, '?r=xy9z8', { status: 200, body: LEGACY_INVITE });

    await expect(page.locator('.refer-invite_title')).toHaveText('sam invited you');
    await expect(page.locator('.refer-invite_offer')).toHaveText(
      'Get $25 when you spend $150 in 30 days'
    );
    expect(lookups).toEqual(['/accounts/v1/referral/invite/XY9Z8']);
    expect((await searchParamsOf(page, '#signup')).get('ref')).toBe('XY9Z8');
  });

  for (const search of ['', '?ref=ab', '?ref=ab-12c', '?ref=abcdefghijklm', '?utm_source=x']) {
    test(`leaves the page untouched for "${search}"`, async ({ page }) => {
      const { lookups } = await openReferPage(page, search);
      await page.waitForLoadState('load');

      await expect(page.locator('[class^="refer-invite"]')).toHaveCount(0);
      await expect(page.locator('html')).not.toHaveAttribute('data-refer-invite');
      await expect(page.locator('#play-store')).toHaveAttribute(
        'href',
        'https://play.google.com/store/apps/details?id=xyz.solid.android&hl=en'
      );
      await expect(page.locator('#signup')).toHaveAttribute(
        'href',
        'https://app.solid.xyz?utm_source=website'
      );
      expect(lookups).toEqual([]);
    });
  }

  test('keeps the page generic for a code the backend does not know', async ({ page }) => {
    const { lookups } = await openReferPage(page, '?ref=ab12c', {
      status: 200,
      body: { valid: false, code: 'AB12C' },
    });

    await expect.poll(() => lookups.length).toBe(1);
    await page.waitForTimeout(100);
    await expect(page.locator('[class^="refer-invite"]')).toHaveCount(0);
  });

  test('still shows the QR card when the lookup fails', async ({ page }) => {
    await openReferPage(page, '?ref=ab12c', { status: 500 });

    await expect(page.locator('.refer-invite_qr')).toBeVisible();
    await expect(page.locator('.refer-invite')).toHaveCount(0);
  });

  test('does not touch the clipboard on desktop', async ({ page }) => {
    const { clipboard } = await openReferPage(page, '?ref=ab12c');
    await expect(page.locator('.refer-invite_qr')).toBeVisible();

    await page.click('#app-store');
    await page.waitForURL('https://apps.apple.com/**');
    expect(clipboard).toEqual([]);
  });
});

test.describe('refer page on iPhone', () => {
  test.use({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 } });

  test('offers to open the app instead of a QR card', async ({ page }) => {
    await openReferPage(page, '?ref=ab12c');

    const open = page.locator('.refer_hero-buttons + .refer-invite_open');
    await expect(open).toHaveText('Open in the Solid app');
    await expect(open).toHaveAttribute('href', 'https://app.solid.xyz/invite/AB12C');
    await expect(page.locator('.refer-invite_qr')).toHaveCount(0);
  });

  test('copies the invite code before opening the App Store', async ({ page }) => {
    const { clipboard } = await openReferPage(page, '?ref=ab12c');

    await page.click('#app-store');
    await page.waitForURL('https://apps.apple.com/il/app/solid-superapp-llc/id6758618401');
    expect(clipboard).toEqual(['solid-invite:AB12C']);
  });

  test('opens the App Store even when the clipboard never answers', async ({ page }) => {
    const { clipboard } = await openReferPage(page, '?ref=ab12c', undefined, 'hang');

    await page.click('#app-store');
    await page.waitForURL('https://apps.apple.com/**', { timeout: 3000 });
    expect(clipboard).toEqual(['solid-invite:AB12C']);
  });
});

test.describe('refer page on Android', () => {
  test.use({ userAgent: ANDROID_UA, viewport: { width: 412, height: 915 } });

  test('passes the code to Google Play and offers to open the app', async ({ page }) => {
    await openReferPage(page, '?refCode=ab12c');

    await expect(page.locator('.refer-invite_open')).toHaveAttribute(
      'href',
      'https://app.solid.xyz/invite/AB12C'
    );
    const play = await searchParamsOf(page, '#play-store');
    expect(play.get('referrer')).toBe('ref=AB12C&utm_source=refer_page');
  });
});
