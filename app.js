(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const chapters = [...document.querySelectorAll('.chapter')];
  const videos = [...document.querySelectorAll('video')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = $('story-stage');
  const audio = $('ambience');
  const dive = $('dive-video');
  const diveLoop = $('dive-loop');
  const dialogs = [...document.querySelectorAll('dialog')];
  const progress = [];
  let current = 0, reason = 0, started = false, soundWanted = false;
  let experienceOpened = false;
  let holding = false, entryInvitationReady = false, diveComplete = false;
  let pointer = null, holdTimer = null, lastNavigation = 0, audioAttempt = 0;
  let selectedPlan = null, confirmedPlan = null, favoriteReason = null;
  const chosenWishes = new Set();
  audio.volume = .38;

  chapters.forEach((chapter, index) => {
    chapter.tabIndex = -1;
    chapter.hidden = true;
    chapter.inert = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', chapter.dataset.label);
    const track = document.createElement('span');
    track.className = 'progress-track';
    const fill = document.createElement('span');
    fill.className = 'progress-fill';
    track.appendChild(fill);
    button.appendChild(track);
    button.addEventListener('click', () => { ensureStarted(); goTo(index); });
    document.querySelector('.story-progress').appendChild(button);
    progress.push({ button, fill });
  });

  const reasons = [
    ['☀', 'Tu forma de iluminarlo todo.', 'Tu risa tiene algo que no sé explicar. Me basta escucharla para que el día cambie de color y todo se sienta un poquito más ligero.'],
    ['✧', 'Lo valiente que eres.', 'Me encanta esa fuerza tuya para ir por lo que quieres. Como Arenita con su casco, llevas contigo todo un mundo de ideas y ganas de descubrir.'],
    ['♡', 'El cariño en tus detalles.', 'En cómo escuchas, en cómo preguntas, en esos pequeños gestos que dicen mucho. Hay una forma de cuidar que se siente como llegar a casa. La tuya.'],
    ['✿', 'Esa manera tan tuya de ser.', 'Tus ocurrencias, tus ideas y ese poquito de locura que me encanta. No cambiaría nada de lo que te hace auténtica; ahí vive gran parte de tu magia.'],
    ['∞', 'Lo bonito de estar contigo.', 'No siempre necesitamos un gran plan. A veces basta con estar cerca, hablar de cualquier cosa y sentir que no hay otro lugar en el que quiera estar.']
  ];
  const reasonButtons = [...document.querySelectorAll('[data-reason]')];
  function showReason(index) {
    const next = Math.max(0, Math.min(reasons.length - 1, index));
    const content = $('reason-content');
    content.dataset.dir = next < reason ? 'prev' : 'next';
    reason = next;
    const [icon, title, text] = reasons[reason];
    $('reason-icon').textContent = icon;
    $('reason-title').textContent = title;
    $('reason-text').textContent = text;
    $('reason-label').textContent = ['Tu risa', 'Tu valentía', 'Tus cuidados', 'Tu autenticidad', 'Tu compañía'][reason];
    reflectFavoriteReason();
    reasonButtons.forEach((button, n) => button.setAttribute('aria-pressed', String(n === reason)));
    content.classList.remove('changed');
    void content.offsetWidth;
    content.classList.add('changed');
    updateProgress();
  }
  reasonButtons.forEach(button => button.addEventListener('click', () => showReason(Number(button.dataset.reason))));
  $('next-reason').addEventListener('click', () => reason < reasons.length - 1 ? showReason(reason + 1) : navigate(1));

  function updateProgress() {
    progress.forEach(({ button, fill }, index) => {
      if (index === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      let value = index < current ? 100 : 0;
      if (index === current) {
        const active = chapters[current];
        const video = active.querySelector('video');
        value = active.id === 'razones' ? (reason + 1) / reasons.length * 100
          : video && Number.isFinite(video.duration) && video.duration > 0 ? Math.max(5, video.currentTime / video.duration * 100) : 100;
      }
      fill.style.width = `${Math.min(100, value)}%`;
    });
  }

  function reflectSound() {
    const on = soundWanted && !audio.paused;
    $('sound').setAttribute('aria-pressed', String(soundWanted));
    $('sound').setAttribute('aria-label', soundWanted ? 'Silenciar música' : 'Activar música');
    $('sound-label').textContent = on ? 'Música: sí' : 'Música: no';
    $('sound').classList.toggle('is-playing', on);
    $('sound').style.opacity = soundWanted ? '1' : '.65';
  }
  function playMusic() {
    if (!soundWanted || holding || document.hidden) return;
    const attempt = ++audioAttempt;
    audio.play().then(() => {
      if (!soundWanted || holding || document.hidden) audio.pause();
      reflectSound();
    }).catch(() => {
      if (attempt !== audioAttempt || holding || document.hidden) return;
      soundWanted = false;
      reflectSound();
      $('navigation-hint').textContent = 'TOCA EL ICONO DE MÚSICA PARA ACTIVARLA';
    });
  }
  function ensureStarted() {
    if (!experienceOpened || started) return;
    started = true;
    soundWanted = true;
    playMusic();
  }
  function activeVideo() {
    if (!experienceOpened) return diveComplete ? diveLoop : dive;
    return chapters[current].querySelector('video');
  }
  function syncPlayback(forceVideo = false) {
    const active = activeVideo();
    const blocked = holding || document.hidden;
    videos.forEach(video => {
      const explicitDive = video === dive && !experienceOpened;
      const allowed = video === active && !blocked && (!motion.matches || forceVideo || explicitDive);
      if (allowed) video.play().catch(() => {
        if (video !== dive || experienceOpened) return;
        $('retry-entry').hidden = false;
        $('dive-status').textContent = 'Toca para reproducir el video de entrada.';
      });
      else video.pause();
    });
    if (blocked || !soundWanted) { audioAttempt++; audio.pause(); reflectSound(); }
    else if (audio.paused) playMusic();
  }

  // Story changes swim through a view transition where the browser has one; elsewhere they still fade in.
  let activeTransition = null, renderingTransition = false;
  function withTransition(kind, update) {
    if (motion.matches || renderingTransition || typeof document.startViewTransition !== 'function') { update(); return; }
    if (activeTransition) activeTransition.skipTransition();
    const root = document.documentElement;
    root.dataset.transition = kind;
    const transition = document.startViewTransition(() => {
      renderingTransition = true;
      try { update(); } finally { renderingTransition = false; }
    });
    activeTransition = transition;
    transition.finished.catch(() => {}).finally(() => {
      if (activeTransition !== transition) return;
      activeTransition = null;
      delete root.dataset.transition;
    });
  }
  function bubbleBurst(count = 14, origin) {
    if (motion.matches) return;
    for (let n = 0; n < count; n++) {
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      const size = 6 + Math.random() * 18;
      bubble.style.setProperty('--x', `${origin ? origin.x + (Math.random() - .5) * 70 : Math.random() * window.innerWidth}px`);
      bubble.style.setProperty('--y', `${origin ? origin.y : window.innerHeight + 30}px`);
      bubble.style.setProperty('--size', `${size}px`);
      bubble.style.setProperty('--rise', `${origin ? 160 + Math.random() * 160 : window.innerHeight * (.55 + Math.random() * .5)}px`);
      bubble.style.setProperty('--drift', `${(Math.random() - .5) * 70}px`);
      bubble.style.animationDuration = `${(origin ? 1 : 1.5) + Math.random() * 1.1}s`;
      bubble.style.animationDelay = `${Math.random() * .3}s`;
      $('particles').appendChild(bubble);
      bubble.addEventListener('animationend', () => bubble.remove(), { once:true });
    }
  }
  function tapRipple(x, y) {
    if (motion.matches) return;
    const ripple = document.createElement('span');
    ripple.className = 'tap-ripple';
    ripple.style.setProperty('--x', `${x}px`);
    ripple.style.setProperty('--y', `${y}px`);
    $('particles').appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once:true });
    bubbleBurst(5, { x, y });
  }
  function goTo(index, direction = 0) {
    if (!experienceOpened) return;
    index = Math.max(0, Math.min(chapters.length - 1, index));
    const changed = current !== index;
    stage.dataset.direction = direction < 0 ? 'backward' : 'forward';
    current = index;
    const render = () => {
      chapters.forEach((chapter, n) => {
        chapter.hidden = n !== current;
        chapter.inert = n !== current;
        chapter.classList.toggle('is-active', n === current);
        chapter.setAttribute('aria-hidden', String(n !== current));
      });
      const chapter = chapters[current];
      if (changed) {
        chapter.scrollTop = 0;
        if (chapter.id === 'razones') showReason(direction < 0 ? reasons.length - 1 : 0);
        chapter.focus({ preventScroll: true });
        if (!renderingTransition) animateIn(chapter.querySelector('.backdrop'), [{ opacity:.25, transform:'scale(1.06)' }, { opacity:1, transform:'scale(1)' }], 800);
        bubbleBurst(direction < 0 ? 8 : 14);
      }
      $('chapter-label').textContent = chapter.dataset.label;
      $('previous-story').disabled = current === 0;
      $('next-story').disabled = current === chapters.length - 1;
      $('story-announcement').textContent = chapter.dataset.label;
      $('navigation-hint').textContent = holding ? 'SUELTA PARA CONTINUAR' : 'IZQUIERDA: VOLVER · DERECHA: SEGUIR';
      try { history.replaceState(null, '', `#${chapter.id}`); } catch {}
      syncPlayback();
      updateProgress();
    };
    if (changed) withTransition(direction < 0 ? 'backward' : 'forward', render);
    else render();
  }
  function bump(direction) {
    const content = chapters[current].querySelector('.story-content');
    animateIn(content, [{ translate:'0 0' }, { translate:`${direction * -14}px 0`, offset:.35 }, { translate:`${direction * 5}px 0`, offset:.7 }, { translate:'0 0' }], 420);
  }
  function navigate(direction) {
    if (!experienceOpened || dialogs.some(dialog => dialog.open)) return;
    ensureStarted();
    if (chapters[current].id === 'razones') {
      if (direction > 0 && reason < reasons.length - 1) { showReason(reason + 1); return; }
      if (direction < 0 && reason > 0) { showReason(reason - 1); return; }
    }
    const target = current + direction;
    if (target < 0 || target >= chapters.length) { bump(direction); return; }
    goTo(target, direction);
  }
  $('previous-story').addEventListener('click', () => navigate(-1));
  $('next-story').addEventListener('click', () => navigate(1));
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const target = chapters.findIndex(chapter => `#${chapter.id}` === link.getAttribute('href'));
    if (target < 0) return;
    event.preventDefault();
    ensureStarted();
    goTo(target, target < current ? -1 : 1);
  }));

  // A tap navigates; a scroll, drag, button interaction or long press never does.
  function releaseHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (holding) { holding = false; document.body.classList.remove('is-holding'); $('navigation-hint').textContent = 'IZQUIERDA: VOLVER · DERECHA: SEGUIR'; syncPlayback(); }
  }
  const isControl = target => !!target.closest('button,a,input,select,textarea,dialog,[data-no-navigation]');
  stage.addEventListener('pointerdown', event => {
    if (!experienceOpened || !event.isPrimary || event.button !== 0 || isControl(event.target)) return;
    pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, time:performance.now(), scroll:chapters[current].scrollTop, story:current, held:false, moved:false };
    holdTimer = setTimeout(() => {
      if (!pointer || pointer.moved) return;
      pointer.held = true;
      holding = true;
      document.body.classList.add('is-holding');
      $('navigation-hint').textContent = 'SUELTA PARA CONTINUAR';
      syncPlayback();
    }, 350);
  });
  stage.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 14) {
      pointer.moved = true;
      releaseHold();
    }
  }, { passive:true });
  stage.addEventListener('pointerup', event => {
    const gesture = pointer;
    pointer = null;
    releaseHold();
    if (!gesture || gesture.id !== event.pointerId || gesture.story !== current || gesture.held || isControl(event.target)) return;
    if (Math.abs(chapters[current].scrollTop - gesture.scroll) > 4) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (performance.now() - gesture.time > 650) return;
    if (Math.abs(dx) > 55 && Math.abs(dy) < 35) {
      navigate(dx < 0 ? 1 : -1);
      return;
    }
    if (gesture.moved || Math.hypot(dx, dy) > 14 || performance.now() - lastNavigation < 220) return;
    lastNavigation = performance.now();
    tapRipple(event.clientX, event.clientY);
    navigate(event.clientX >= window.innerWidth / 2 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => { pointer = null; releaseHold(); });
  window.addEventListener('pointerup', () => { pointer = null; releaseHold(); });
  window.addEventListener('pointercancel', () => { pointer = null; releaseHold(); });
  window.addEventListener('blur', () => { pointer = null; releaseHold(); });
  document.addEventListener('keydown', event => {
    if (!experienceOpened || event.altKey || event.ctrlKey || event.metaKey || dialogs.some(dialog => dialog.open) || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); navigate(event.key === 'ArrowRight' ? 1 : -1); }
  });

  function revealEntryInvitation() {
    if (experienceOpened) return;
    entryInvitationReady = true;
    $('entry').classList.add('message-ready');
    $('enter-experience').hidden = false;
    $('replay-dive').hidden = false;
    $('retry-entry').hidden = true;
    $('dive-status').textContent = 'Ya estamos bajo el mar. Toca el mensaje para empezar la experiencia.';
  }
  // Full submersion is at 2 seconds in this clip; wait two more seconds of playback.
  const ENTRY_INVITATION_TIME = 2 + 2;
  // The loop fades in under the last moments of the dive, so the scene never jumps.
  const LOOP_CROSSFADE = .7;
  let loopFading = false;
  function resetLoopFade() {
    loopFading = false;
    diveLoop.classList.remove('is-visible');
  }
  dive.addEventListener('timeupdate', () => {
    if (dive.currentTime >= ENTRY_INVITATION_TIME) revealEntryInvitation();
    if (dive.currentTime >= ENTRY_INVITATION_TIME) diveLoop.preload = 'auto';
    if (loopFading || experienceOpened || motion.matches || !Number.isFinite(dive.duration)) return;
    if (dive.currentTime < dive.duration - LOOP_CROSSFADE) return;
    loopFading = true;
    diveLoop.currentTime = 0;
    diveLoop.hidden = false;
    diveLoop.play().catch(() => {});
    requestAnimationFrame(() => diveLoop.classList.add('is-visible'));
  });
  dive.addEventListener('ended', () => {
    if (experienceOpened) return;
    revealEntryInvitation();
    diveComplete = true;
    dive.hidden = true;
    diveLoop.hidden = false;
    diveLoop.classList.add('is-visible');
    syncPlayback();
  });
  dive.addEventListener('error', () => {
    if (experienceOpened) return;
    // A missing video must not leave the entrance permanently locked.
    diveComplete = true;
    dive.hidden = true;
    diveLoop.hidden = false;
    diveLoop.classList.add('is-visible');
    revealEntryInvitation();
    syncPlayback();
  });
  $('retry-entry').addEventListener('click', () => {
    $('retry-entry').hidden = true;
    syncPlayback(true);
  });
  $('replay-dive').addEventListener('click', () => {
    diveComplete = false;
    entryInvitationReady = false;
    $('entry').classList.remove('message-ready');
    $('enter-experience').hidden = true;
    $('replay-dive').hidden = true;
    dive.hidden = false;
    diveLoop.hidden = true;
    resetLoopFade();
    dive.currentTime = 0;
    syncPlayback(true);
  });
  $('enter-experience').addEventListener('click', event => {
    if (!entryInvitationReady || experienceOpened) return;
    experienceOpened = true;
    // The reveal opens like a bubble from wherever she touched the message.
    const root = document.documentElement;
    if (root.style) {
      root.style.setProperty('--open-x', `${event.clientX || window.innerWidth / 2}px`);
      root.style.setProperty('--open-y', `${event.clientY || window.innerHeight / 2}px`);
    }
    // Music starts inside the touch itself, before the reveal animation runs.
    ensureStarted();
    withTransition('open', () => {
      $('entry').hidden = true;
      $('entry').inert = true;
      document.body.classList.remove('entry-pending');
      [stage, document.querySelector('.topbar'), document.querySelector('.story-footer'), document.querySelector('.skip')].forEach(element => {
        element.hidden = false;
        element.inert = false;
      });
      goTo(0);
      chapters[0].focus({ preventScroll:true });
      bubbleBurst(22);
    });
  });
  function animateIn(element, frames, duration = 400) {
    if (motion.matches || !element || typeof element.animate !== 'function') return;
    element.animate(frames, { duration, easing:'cubic-bezier(.2,.8,.2,1)' });
  }
  document.addEventListener('click', event => {
    const control = event.target.closest('button,.pill');
    // A soft squish and rebound, like pressing a bubble.
    if (control && !control.disabled) animateIn(control, [{ scale:1 }, { scale:.93, offset:.3 }, { scale:1.035, offset:.68 }, { scale:1 }], 420);
  });
  function openDialog(id) {
    $(id).showModal();
    animateIn($(id), [{ opacity:0, transform:'translateY(36px) scale(.94)', filter:'blur(6px)' }, { opacity:1, transform:'translateY(0) scale(1)', filter:'blur(0)' }], 620);
    $(id).scrollTop = 0;
    syncPlayback();
  }
  const closeDialog = dialog => withTransition('dialog', () => dialog.close());
  $('read-letter').addEventListener('click', () => openDialog('letter-dialog'));
  dialogs.forEach(dialog => {
    dialog.querySelector('[data-close]').addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('close', () => syncPlayback());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
  });
  $('letter-continue').addEventListener('click', () => withTransition('forward', () => { $('letter-dialog').close(); navigate(1); }));

  const plans = [
    { image:'media/paseo.jpg', title:'Paseo sin rumbo', description:'Nuestra música, una vuelta sin prisa y una parada para comer algo rico.' },
    { image:'media/noche.jpg', title:'Tarde de pelis', description:'Una cobija, nuestras películas favoritas y cero ganas de mirar el reloj.' },
    { image:'media/atardecer.jpg', title:'Ver el atardecer', description:'Quedarnos cerquita hasta que aparezca la primera estrella.' },
    { image:'media/intro-loop.jpg', title:'Explorar contigo', description:'Descubrir un lugar nuevo. El único requisito: ir de tu mano.' }
  ];
  const planButtons = [...document.querySelectorAll('[data-plan]')];
  function choosePlan(index) {
    selectedPlan = index;
    planButtons.forEach((button, n) => button.setAttribute('aria-pressed', String(n === index)));
    $('plan-selected-title').textContent = plans[index].title;
    $('plan-selected-description').textContent = plans[index].description;
    $('confirm-plan').disabled = false;
    animateIn($('plan-selected-title'), [{ opacity:0, transform:'translateY(10px)', filter:'blur(4px)' }, { opacity:1, transform:'translateY(0)', filter:'blur(0)' }], 420);
    animateIn($('plan-selected-description'), [{ opacity:0 }, { opacity:0, offset:.3 }, { opacity:1 }], 520);
    animateIn(planButtons[index], [{ scale:1 }, { scale:.94, offset:.3 }, { scale:1.05, offset:.65 }, { scale:1 }], 460);
  }
  planButtons.forEach(button => button.addEventListener('click', () => choosePlan(Number(button.dataset.plan))));
  $('road-surprise').addEventListener('click', () => {
    const panel = $('adventure-panel');
    panel.hidden = !panel.hidden;
    $('road-surprise').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) animateIn(panel, [{ opacity:0, transform:'translateY(-10px)' }, { opacity:1, transform:'translateY(0)' }], 420);
  });
  $('surprise-plan').addEventListener('click', () => choosePlan((selectedPlan === null ? Math.floor(Math.random() * plans.length) : selectedPlan + 1) % plans.length));
  $('confirm-plan').addEventListener('click', () => {
    if (selectedPlan === null) return;
    confirmedPlan = selectedPlan;
    $('road-chosen-title').textContent = plans[confirmedPlan].title;
    $('road-note').textContent = plans[confirmedPlan].description;
    $('road-choice-card').hidden = false;
    $('road-surprise').textContent = 'Cambiar nuestro plan ♡';
    $('adventure-panel').hidden = true;
    $('road-surprise').setAttribute('aria-expanded', 'false');
    animateIn($('road-choice-card'), [{ opacity:0, transform:'translateY(18px) scale(.94)' }, { opacity:1, transform:'translateY(-3px) scale(1.01)', offset:.7 }, { opacity:1, transform:'translateY(0) scale(1)' }], 560);
    hearts($('road-choice-card'));
  });
  function reflectFavoriteReason() {
    const chosen = favoriteReason === reason;
    $('favorite-reason').setAttribute('aria-pressed', String(chosen));
    $('favorite-reason').textContent = chosen ? 'Guardada en nuestro recuerdo ♥' : 'Esta es mi favorita ♡';
  }
  $('favorite-reason').addEventListener('click', event => {
    favoriteReason = favoriteReason === reason ? null : reason;
    reflectFavoriteReason();
    if (favoriteReason !== null) hearts(event.currentTarget);
  });
  $('save-sunset').addEventListener('click', event => {
    const saved = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', String(saved));
    event.currentTarget.textContent = saved ? 'Guardado en nuestro corazón ♥' : 'Guardar este atardecer ♡';
    $('sunset-note').textContent = saved ? 'Este momento ya es nuestro. Y nos quedan muchos más. ♡' : 'Un pequeño recuerdo de nuestro océano.';
    if (saved) hearts(event.currentTarget);
  });
  document.querySelectorAll('.wish-list li').forEach((item, index) => {
    const heading = item.querySelector('h3');
    const detail = item.querySelector('p');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wish-toggle';
    detail.id = `wish-detail-${index}`;
    detail.classList.add('wish-detail');
    detail.hidden = true;
    button.setAttribute('aria-controls', detail.id);
    button.setAttribute('aria-expanded', 'false');
    button.textContent = heading.textContent;
    const symbol = document.createElement('span');
    symbol.textContent = '+';
    symbol.setAttribute('aria-hidden', 'true');
    button.appendChild(symbol);
    heading.replaceWith(button);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'wish-save';
    save.textContent = 'Lo quiero contigo ♡';
    save.hidden = true;
    save.setAttribute('aria-pressed', 'false');
    detail.parentNode.appendChild(save);
    save.addEventListener('click', () => {
      const selected = !chosenWishes.has(index);
      if (selected) chosenWishes.add(index); else chosenWishes.delete(index);
      save.setAttribute('aria-pressed', String(selected));
      save.textContent = selected ? 'Guardado para nosotros ♥' : 'Lo quiero contigo ♡';
      if (selected) hearts(save);
    });
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      detail.hidden = !expanded;
      save.hidden = !expanded;
      button.setAttribute('aria-expanded', String(expanded));
      symbol.textContent = expanded ? '−' : '+';
      animateIn(symbol, [{ rotate:expanded ? '-90deg' : '90deg', opacity:.3 }, { rotate:'0deg', opacity:1 }], 360);
      if (!expanded) return;
      animateIn(detail, [{ opacity:0, transform:'translateY(-8px)', clipPath:'inset(0 0 100% 0)' }, { opacity:1, transform:'translateY(0)', clipPath:'inset(0 0 0 0)' }], 480);
      animateIn(save, [{ opacity:0, transform:'translateY(8px) scale(.9)' }, { opacity:0, offset:.4 }, { opacity:1, transform:'translateY(0) scale(1)' }], 560);
    });
  });
  function hearts(target, count = 12) {
    if (motion.matches) return;
    const rect = target.getBoundingClientRect();
    animateIn(target, [{ filter:'brightness(1)' }, { filter:'brightness(1.25)', offset:.3 }, { filter:'brightness(1)' }], 600);
    for (let n = 0; n < count; n++) {
      const particle = document.createElement('span');
      particle.className = 'particle';
      particle.textContent = n % 3 ? '♡' : '✧';
      particle.style.setProperty('--x', `${rect.left + rect.width / 2 + (Math.random() - .5) * rect.width}px`);
      particle.style.setProperty('--y', `${rect.top}px`);
      particle.style.setProperty('--size', `${18 + Math.random() * 22}px`);
      particle.style.setProperty('--drift', `${(Math.random() - .5) * 160}px`);
      particle.style.animationDelay = `${Math.random() * .25}s`;
      $('particles').appendChild(particle);
      particle.addEventListener('animationend', () => particle.remove(), { once:true });
    }
  }
  let love = 0;
  $('send-love').addEventListener('click', event => {
    const messages = ['Una ola de cariño, solo para ti. ♡', 'Y otra más. Porque contigo nunca es suficiente. ♡', 'Si el cariño fuera agua, ya llenamos Fondo de Bikini. ♡', 'Te elegiría en este y en todos los océanos. ♡'];
    $('love-note').textContent = messages[Math.min(love++, messages.length - 1)];
    animateIn($('love-note'), [{ opacity:0, transform:'translateY(8px)' }, { opacity:1, transform:'translateY(0)' }], 420);
    animateIn($('final-title'), [{ scale:1 }, { scale:1.08, offset:.25 }, { scale:.98, offset:.5 }, { scale:1.04, offset:.7 }, { scale:1 }], 700);
    hearts(event.currentTarget, 18);
  });

  let summaryBlob = null, summaryFile = null, summaryURL = null, summaryKey = '', summaryGeneration = 0;
  function memoryState() {
    return {
      giftImage: confirmedPlan === null ? 'media/paseo.jpg' : plans[confirmedPlan].image,
      planTitle: confirmedPlan === null ? null : plans[confirmedPlan].title,
      planDescription: confirmedPlan === null ? null : plans[confirmedPlan].description,
      favoriteReason: favoriteReason === null ? null : reasons[favoriteReason][1],
      wishes: [...chosenWishes].map(index => ['Seguir haciendo tonterías.', 'Ser tu lugar tranquilo.', 'Coleccionar días contigo.'][index]),
      sunsetSaved: $('save-sunset').getAttribute('aria-pressed') === 'true'
    };
  }
  async function buildSummary() {
    const state = memoryState();
    const key = JSON.stringify(state);
    if (summaryBlob && key === summaryKey) return;
    const generation = ++summaryGeneration;
    summaryBlob = null;
    summaryFile = null;
    $('summary-preview').hidden = true;
    $('download-summary').disabled = true;
    $('whatsapp-summary').setAttribute('aria-disabled', 'true');
    $('share-summary').hidden = true;
    $('retry-summary').hidden = true;
    $('summary-status').textContent = 'Preparando tu imagen con nuestros detalles…';
    try {
      const blob = await OceanMemory.createPNG(state);
      if (generation !== summaryGeneration) return;
      if (summaryURL) URL.revokeObjectURL(summaryURL);
      summaryBlob = blob;
      summaryKey = key;
      summaryURL = URL.createObjectURL(blob);
      $('summary-preview').src = summaryURL;
      $('summary-preview').hidden = false;
      $('download-summary').disabled = false;
      $('whatsapp-summary').setAttribute('href', OceanMemory.whatsappURL(state));
      $('whatsapp-summary').setAttribute('aria-disabled', 'false');
      if (typeof File !== 'undefined') summaryFile = new File([blob], 'nuestro-oceano.png', { type:'image/png' });
      if (summaryFile && navigator.share && navigator.canShare) {
        try { $('share-summary').hidden = !navigator.canShare({ files:[summaryFile] }); } catch {}
      }
      $('summary-status').textContent = 'Listo: este recuerdo lleva lo que elegiste durante la aventura.';
    } catch {
      if (generation !== summaryGeneration) return;
      $('summary-status').textContent = 'No pude preparar la imagen. Toca para intentarlo otra vez.';
      $('retry-summary').hidden = false;
    }
  }
  $('open-summary').addEventListener('click', () => { openDialog('summary-dialog'); buildSummary(); });
  $('retry-summary').addEventListener('click', buildSummary);
  function downloadSummary() {
    if (!summaryBlob || !summaryURL) return false;
    const link = document.createElement('a');
    link.href = summaryURL;
    link.download = 'nuestro-oceano.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }
  $('download-summary').addEventListener('click', () => {
    if (downloadSummary()) $('summary-status').textContent = 'Tu imagen está lista para guardarse en las descargas de tu dispositivo.';
  });
  $('whatsapp-summary').addEventListener('click', event => {
    if (!downloadSummary()) { event.preventDefault(); return; }
    // The original link click opens the chat, preserving browser user activation.
    $('summary-status').textContent = 'Se descargará tu recuerdo. Adjunta la imagen en el chat que se abrirá para enviarla.';
  });
  $('share-summary').addEventListener('click', async () => {
    if (!summaryFile || !navigator.share) return;
    try {
      await navigator.share({ files:[summaryFile], title:'Nuestro océano', text:'Un pequeño recuerdo de nuestra aventura. ♡' });
      $('summary-status').textContent = 'Tu recuerdo se abrió en la opción para compartir que elegiste.';
    } catch (error) {
      $('summary-status').textContent = error.name === 'AbortError'
        ? 'Tu recuerdo sigue aquí para cuando quieras compartirlo.'
        : 'Puedes descargar la imagen y abrir nuestro chat con el botón de WhatsApp.';
    }
  });
  $('sound').addEventListener('click', () => {
    if (!experienceOpened) return;
    if (!started) started = true;
    soundWanted = !soundWanted;
    if (soundWanted) playMusic();
    else { audioAttempt++; audio.pause(); reflectSound(); }
  });
  document.addEventListener('visibilitychange', () => { pointer = null; releaseHold(); syncPlayback(); });
  motion.addEventListener('change', () => syncPlayback());
  videos.forEach(video => video.addEventListener('timeupdate', () => { if (video === activeVideo()) updateProgress(); }));
  const fullscreen = $('fullscreen');
  if (document.fullscreenEnabled && document.documentElement.requestFullscreen) fullscreen.hidden = false;
  fullscreen.addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { fullscreen.hidden = true; }
  });
  document.addEventListener('fullscreenchange', () => fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Salir de pantalla completa' : 'Entrar en pantalla completa'));
  reflectSound();
  syncPlayback();
})();
