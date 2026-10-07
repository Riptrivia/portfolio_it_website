(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) {
    root.classList.add('liquid-motion-reduced');
    return;
  }

  root.classList.add('liquid-motion-ready');

  const field = document.createElement('div');
  field.className = 'liquid-motion-field';
  field.setAttribute('aria-hidden', 'true');
  field.innerHTML = '<i></i><i></i><i></i>';
  document.body.append(field);

  const state = {
    x: window.innerWidth * 0.72,
    y: window.innerHeight * 0.3,
    targetX: window.innerWidth * 0.72,
    targetY: window.innerHeight * 0.3,
    scrollY: window.scrollY,
    mobile: window.matchMedia('(pointer: coarse)').matches
  };

  const reactiveSelector = [
    '.role', '.project-card', '.cert-card', '.credential-item', '.lab-card',
    '.guide-card', '.step-card', '.feature-panel', '.recognition-card',
    '.capacity-card', '.resume-focus article', '.panel', '.card',
    '.component-card', '.metric-grid article', '.work-grid article',
    '.distribution-grid article', '.service-bars article'
  ].join(',');

  const prepareReactiveElements = () => {
    document.querySelectorAll(reactiveSelector).forEach((element) => {
      element.classList.add('liquid-reactive');
      element.addEventListener('pointermove', (event) => {
        if (state.mobile) return;
        const rect = element.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
        element.style.setProperty('--local-x', `${x}%`);
        element.style.setProperty('--local-y', `${y}%`);
      }, { passive: true });
      element.addEventListener('pointerleave', () => {
        element.style.removeProperty('--local-x');
        element.style.removeProperty('--local-y');
      }, { passive: true });
    });
  };

  prepareReactiveElements();

  const revealTargets = document.querySelectorAll('main > section, .ops-section, .panel, .project-card, .guide-card');
  revealTargets.forEach((element) => element.classList.add('liquid-reveal'));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  revealTargets.forEach((element) => observer.observe(element));

  window.addEventListener('pointermove', (event) => {
    if (state.mobile) return;
    state.targetX = event.clientX;
    state.targetY = event.clientY;
  }, { passive: true });

  window.addEventListener('scroll', () => {
    state.scrollY = window.scrollY;
    if (state.mobile) {
      const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = state.scrollY / range;
      state.targetX = window.innerWidth * (0.2 + progress * 0.65);
      state.targetY = window.innerHeight * (0.24 + Math.sin(progress * Math.PI * 4) * 0.16);
      root.style.setProperty('--liquid-scroll', progress.toFixed(4));
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    state.mobile = window.matchMedia('(pointer: coarse)').matches;
  }, { passive: true });

  const render = () => {
    state.x += (state.targetX - state.x) * 0.075;
    state.y += (state.targetY - state.y) * 0.075;
    root.style.setProperty('--liquid-x', `${state.x.toFixed(1)}px`);
    root.style.setProperty('--liquid-y', `${state.y.toFixed(1)}px`);
    root.style.setProperty('--liquid-page-x', `${((state.x / Math.max(1, window.innerWidth)) - 0.5) * 28}px`);
    root.style.setProperty('--liquid-page-y', `${((state.y / Math.max(1, window.innerHeight)) - 0.5) * 22}px`);
    window.requestAnimationFrame(render);
  };

  window.requestAnimationFrame(render);
})();
