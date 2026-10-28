/**
 * The "Download the app" modal — the QR code and store buttons behind "Get the
 * app" on Home and Refer. Openers are marked with `data-app-modal="open"`; the
 * modal is the page's `.modal`, revealed by setting its display and closed via
 * the backdrop, close buttons, or the Escape key.
 *
 * Returns the modal, or `null` when the page has no modal or no opener.
 */
export function initAppModal(openSelector = '[data-app-modal="open"]'): HTMLElement | null {
  const modal = document.querySelector<HTMLElement>('.modal');
  const openers = document.querySelectorAll<HTMLElement>(openSelector);
  if (!modal || !openers.length) return null;

  // Both scripts may run on a page that loads both; wire it once.
  if (modal.dataset.appModalReady) return modal;
  modal.dataset.appModalReady = 'true';

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

  return modal;
}
