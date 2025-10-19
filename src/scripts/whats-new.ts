import { safeExecute } from '@utils/helpers';
import gsap from 'gsap';

function toggleChangelog() {
  const changelogHeaders = document.querySelectorAll('.changelog_header');
  const changelogContents = document.querySelectorAll('.changelog_content');

  if (!changelogHeaders.length || !changelogContents.length) return;

  gsap.set(changelogContents, {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  });

  const firstContent = changelogContents[0];
  if (firstContent) {
    gsap.set(firstContent, {
      height: 'auto',
      opacity: 1,
    });
  }

  changelogHeaders.forEach((header, index) => {
    const content = changelogContents[index];
    if (!content) return;

    header.addEventListener('click', () => {
      changelogContents.forEach((otherContent, otherIndex) => {
        if (otherIndex === index) {
          gsap.to(otherContent, {
            height: 'auto',
            opacity: 1,
            duration: 0.3,
            ease: 'power2.inOut',
          });
        } else {
          gsap.to(otherContent, {
            height: 0,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.inOut',
          });
        }
      });
    });
  });
}

window.Webflow ||= [];
window.Webflow.push(() => {
  safeExecute(toggleChangelog);
});
