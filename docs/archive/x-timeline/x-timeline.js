(async () => {
  const target = document.getElementById('x-timeline');
  const status = document.getElementById('x-timeline-status');
  const button = document.getElementById('x-timeline-reload');
  const link = document.getElementById('x-timeline-link');
  if (!target || !status || !button || !link || target.dataset.initialized) return;
  target.dataset.initialized = 'true';
  const template = link.cloneNode(true);
  let busy = false;
  let timeout;
  const fail = () => {
    clearTimeout(timeout);
    status.hidden = false;
    status.textContent = '読み込めませんでした。時間を置いて「Xを再読み込み」を押すか、上のリンクからXをご覧ください。';
    busy = false;
    button.disabled = false;
  };
  // Delay only the first X load until interaction, following the TCD approach.
  // Remove every trigger after the first event; later interaction never reloads X.
  await new Promise(resolve => {
    const events = ['scroll', 'mousemove', 'mousedown', 'touchstart', 'keydown'];
    let triggered = false;
    const start = () => {
      if (triggered) return;
      triggered = true;
      events.forEach(name => window.removeEventListener(name, start));
      window.removeEventListener('load', restoredScroll);
      button.removeEventListener('click', start);
      button.disabled = true;
      button.textContent = 'Xを再読み込み';
      status.textContent = 'タイムラインを読み込み中…';
      resolve();
    };
    const restoredScroll = () => { if (window.pageYOffset > 0) start(); };
    events.forEach(name => window.addEventListener(name, start, { passive: true }));
    button.disabled = false;
    button.addEventListener('click', start);
    if (document.readyState === 'complete') restoredScroll();
    else window.addEventListener('load', restoredScroll, { once: true });
  });
  try {
    await window.portalHikeReady;
  } catch (error) {
    status.textContent = '初期化できませんでした。上のリンクからXでご覧ください。';
    console.error('Hike initialization failed', error);
    return;
  }
  const twitter = window.twttr = window.twttr || {};
  twitter._e = twitter._e || [];
  twitter.ready = twitter.ready || (callback => twitter._e.push(callback));
  twitter.ready(api => {
    let started = false;
    const load = (manual = false) => {
      if (busy || (started && !manual)) return;
      started = true;
      busy = true;
      button.disabled = true;
      clearTimeout(timeout);
      const anchor = template.cloneNode(true);
      anchor.className = 'twitter-timeline';
      status.hidden = false;
      status.textContent = 'タイムラインを読み込み中…';
      target.replaceChildren(anchor, status);
      // This timer only changes the message; it never retries a request.
      timeout = setTimeout(() => {
        status.textContent = '表示されない場合は、時間を置いて「Xを再読み込み」を押してください。';
        busy = false;
        button.disabled = false;
      }, 20000);
      try {
        const result = api.widgets.load(target);
        if (result && typeof result.catch === 'function') result.catch(fail);
      } catch (error) { fail(); }
    };
    api.events.bind('rendered', event => {
      if (event.target && target.contains(event.target)) {
        clearTimeout(timeout);
        status.hidden = true;
        busy = false;
        button.disabled = false;
      }
    });
    button.addEventListener('click', () => load(true));
    // Defer until widgets.js has finished its automatic page scan.
    // The initial HTML deliberately has no twitter-timeline class.
    setTimeout(() => load(), 0);
  });
  if (!document.getElementById('twitter-wjs')) {
    const script = document.createElement('script');
    script.id = 'twitter-wjs';
    script.async = true;
    script.src = 'https://platform.twitter.com/widgets.js';
    script.charset = 'utf-8';
    script.onerror = () => {
      status.textContent = 'Xを読み込めませんでした。ページを手動で再読み込みするか、上のリンクからXをご覧ください。';
    };
    document.head.appendChild(script);
  }
})();
