/*
 * main.js
 *   1. Tab switching
 *   2. Video preload + playback (three layer design)
 *   3. Section slide in on scroll
 *   4. Sticky TOC nav with section highlight
 *   5. BibTeX copy button
 */

/* TAB SWITCHING
 * Contract:
 *   .tab-bar[data-tabgroup="X"]         container
 *   .tab-btn[data-tab="V"]              buttons within that bar
 *   .tab-panel[data-tabgroup="X"][data-config="V"]   matching panel
 * Activating a panel resumes autoplay videos without forcing load(), because
 * load() resets currentTime and breaks custom scrubbing.
 */
function guardedVideoLoad(video) {
  if (!video) return false;
  // load() resets the media element to t=0. Do not call it while the user
  // is scrubbing, or after metadata is already present and seeking works.
  if (video.dataset.scrubbing === '1') return false;
  if (video.readyState > 0 || video.duration > 0) return false;
  try {
    video.load();
    return true;
  } catch (e) {
    return false;
  }
}

document.querySelectorAll('.tab-bar[data-tabgroup]').forEach(function (tabBar) {
  var group = tabBar.dataset.tabgroup;

  tabBar.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetConfig = btn.dataset.tab;

      tabBar.querySelectorAll('.tab-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      document.querySelectorAll('.tab-panel[data-tabgroup="' + group + '"]').forEach(function (panel) {
        panel.classList.remove('active');
      });
      btn.classList.add('active');

      var activePanel = document.querySelector(
        '.tab-panel[data-tabgroup="' + group + '"][data-config="' + targetConfig + '"]'
      );
      if (activePanel) {
        activePanel.classList.add('active');
        activePanel.querySelectorAll('video').forEach(function (video) {
          video.preload = 'auto';
          if (video.hasAttribute('autoplay')) {
            video.muted = true;
            video.play().catch(function () {});
          } else {
            guardedVideoLoad(video);
          }
        });
      }
    });
  });
});


/* VIDEO PRELOAD + PLAYBACK
 *   1. INTENT    Rolling window in DOM order, plus visibility and tab
 *                switch hooks, decides what to queue.
 *   2. PREFETCH  Idle scheduled, concurrency capped drain. Low
 *                fetchPriority so user critical work wins.
 *   3. PLAYBACK  Visible videos play; pause on exit. Late visible
 *                videos jump the queue.
 */
(function () {
  var AHEAD = 15, MAX_INFLIGHT = 4, VISIBLE = 0.25, MARGIN = '400px 0px';

  var conn = navigator.connection;
  if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) {
    AHEAD = 2; MAX_INFLIGHT = 2;
  }
  var schedule = window.requestIdleCallback
    ? function (cb) { requestIdleCallback(cb, { timeout: 1500 }); }
    : function (cb) { setTimeout(cb, 80); };

  var videos = [], frontier = -1, inflight = 0, queue = [];
  var state = new WeakMap();  // vid state: 'queued' | 'loading' | 'ready'
  var timers = new WeakMap();

  // Prefetch layer
  // Safari/WebKit rarely fires `canplaythrough` for MP4s, which would leave
  // `inflight` pinned and stall the queue. We listen to `canplay` (fires on
  // every mainstream browser once the first frame is decodable) and add a
  // timeout safety net so a flaky load can't block the pipeline either.
  function onDone() {
    if (state.get(this) === 'ready') return;
    state.set(this, 'ready');
    inflight--;
    this.removeEventListener('canplay', onDone);
    this.removeEventListener('loadeddata', onDone);
    this.removeEventListener('error', onDone);
    var t = timers.get(this);
    if (t) { clearTimeout(t); timers.delete(this); }
    if (queue.length) schedule(pump);
  }
  function pump() {
    while (inflight < MAX_INFLIGHT && queue.length) {
      var v = queue.shift();
      if (!v || state.get(v) !== 'queued') continue;
      if (v.dataset.scrubbing === '1') {
        queue.push(v);
        schedule(pump);
        return;
      }
      state.set(v, 'loading');
      inflight++;
      v.preload = 'auto';
      if ('fetchPriority' in v) v.fetchPriority = v.dataset.hot ? 'high' : 'low';
      v.addEventListener('canplay', onDone);
      v.addEventListener('loadeddata', onDone);
      v.addEventListener('error', onDone);
      timers.set(v, setTimeout(onDone.bind(v), 8000));
      if (!guardedVideoLoad(v)) onDone.call(v);
    }
  }

  // Intent layer
  function enqueue(v, front) {
    var s = state.get(v);
    if (s === 'loading' || s === 'ready') return;
    if (s === 'queued') {
      if (!front) return;
      var i = queue.indexOf(v);
      if (i > 0) queue.splice(i, 1);
    }
    state.set(v, 'queued');
    front ? queue.unshift(v) : queue.push(v);
    schedule(pump);
  }
  function advance(to) {
    to = Math.min(to, videos.length - 1);
    while (frontier < to) enqueue(videos[++frontier]);
  }

  var nearObs = new IntersectionObserver(function (es, self) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      advance(videos.indexOf(e.target) + AHEAD);
      self.unobserve(e.target);
    });
  }, { rootMargin: MARGIN });

  // Tab click bubbles to document after the per button handler flipped .active,
  // so the newly active panel is already queryable at this point.
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('.tab-btn');
    if (!btn) return;
    var bar = btn.closest('.tab-bar');
    var group = bar && bar.dataset.tabgroup;
    if (!group) return;
    var panel = document.querySelector(
      '.tab-panel.active[data-tabgroup="' + group + '"]'
    );
    panel && panel.querySelectorAll('video[autoplay]').forEach(function (v) {
      enqueue(v, true);
    });
  });

  // <details> hides children with display:none until open, so
  // IntersectionObserver never fires for videos inside a closed FAQ and
  // browsers skip `preload` on hidden <video> elements. When the user
  // opens one, we proactively load what's inside:
  //   - autoplay loops → enqueue in the prefetch frontier + start playing
  //   - controls videos → kick `preload="auto"` so the progress bar scrubs
  //     against buffered content without first waiting for user interaction
  function wireDetails() {
    document.querySelectorAll('details').forEach(function (d) {
      if (d.dataset.videoWired) return;
      d.dataset.videoWired = '1';
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        d.querySelectorAll('video').forEach(function (v) {
          if (v.hasAttribute('autoplay')) {
            enqueue(v, true);
            v.muted = true;
            if (v.dataset.userPaused === '1') return;
            if (v.paused) v.play().catch(function () {});
          } else {
            v.preload = 'auto';
            guardedVideoLoad(v);
          }
        });
      });
    });
  }

  // Apply any data-playbackrate="N" overrides. Some browsers reset the
  // rate on load() or source change, so also reapply on 'loadedmetadata'
  // and 'play'. Chrome/Firefox cap at 16; Safari is more restrictive.
  function applyRates() {
    document.querySelectorAll('video[data-playbackrate]').forEach(function (v) {
      var rate = parseFloat(v.dataset.playbackrate);
      if (!(rate > 0)) return;
      var set = function () { v.playbackRate = rate; };
      set();
      v.addEventListener('loadedmetadata', set);
      v.addEventListener('play', set);
    });
  }

  // Playback layer: play when visible, pause when off screen, resume on
  // re-entry. Scrolling back to a previously seen video resumes it.
  // Safari requires the muted *property* (not just the attribute) to be true
  // at the moment play() is called, or its autoplay policy rejects the call.
  //
  // Custom-controls flags:
  //   data-user-paused="1"  user clicked our pause button; skip auto play
  //   data-scrubbing="1"    user is dragging our progress bar; skip auto pause
  var playObs = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (v.dataset.scrubbing === '1') return;   // never fight an active drag
      if (e.isIntersecting) {
        if (state.get(v) !== 'ready') enqueue(v, true);
        if (v.dataset.userPaused === '1') return;
        if (v.paused) { v.muted = true; v.play().catch(function () {}); }
      } else if (!v.paused) v.pause();
    });
  }, { threshold: VISIBLE });

  // Boot
  function wire() {
    videos = [].slice.call(document.querySelectorAll('video[autoplay]'));
    videos.forEach(function (v) {
      nearObs.observe(v);
      playObs.observe(v);
    });
    // Hot start: videos already laid out near the viewport bypass idle
    // scheduling and load at fetchPriority=high so the first screen does
    // not wait behind YouTube or anything else.
    var horizon = window.innerHeight * 1.2;
    videos.forEach(function (v) {
      var r = v.getBoundingClientRect();
      if (r.bottom > 0 && r.top < horizon) {
        v.dataset.hot = '1';
        state.set(v, 'queued');
        queue.push(v);
      }
    });
    pump();
    advance(AHEAD - 1);   // cold seed for everything further down
    wireDetails();
    applyRates();
  }
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', wire)
    : wire();
})();


/* SECTION SLIDE IN
 * Each top level section slides up as it enters the viewport so the next
 * chapter feels like sliding in from below. Fires once per section. No
 * velocity gate, no snap, no hijacking of scroll itself.
 */
(function () {
  var sections = document.querySelectorAll(
    '#cross-trial, #in-trial, #in-the-wild, #method, #attention, #benchmark, #faq, #team, #acknowledgments'
  );

  var obs = new IntersectionObserver(function (entries, self) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-visible');
      self.unobserve(e.target);
    });
  }, { threshold: 0.04 });

  sections.forEach(function (s) {
    s.classList.add('section-reveal');
    obs.observe(s);
  });
})();


/* STICKY TOC NAV
 * Slides in after the hero leaves the viewport. Highlights the current
 * section via IntersectionObserver.
 */
(function () {
  var nav = document.getElementById('toc-nav');
  if (!nav) return;

  var firstMainSection = document.getElementById('cross-trial');
  var links = nav.querySelectorAll('.toc-link');

  // Visible once the first content section enters view, hidden at the footer
  // and while any full-bleed section is on screen (so it does not overlap
  // the video banner).
  var footer = document.getElementById('footer');
  var bleedSections = [document.getElementById('in-the-wild')].filter(Boolean);
  if (firstMainSection) {
    var updateNavVisibility = function () {
      var triggerY = firstMainSection.offsetTop - (window.innerHeight * 0.18);
      var pastStart = window.scrollY >= triggerY;
      var atFooter  = footer && (window.scrollY + window.innerHeight >= footer.offsetTop + 40);
      var overBleed = bleedSections.some(function (el) {
        var r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      });
      nav.classList.toggle('visible', pastStart && !atFooter && !overBleed);
    };

    updateNavVisibility();
    window.addEventListener('scroll', updateNavVisibility, { passive: true });
    window.addEventListener('resize', updateNavVisibility);
  }

  // Group links by target section so multiple links pointing to the same
  // section (e.g., "MemMimic" parent + "Cross-Trial Tasks" sublink) all
  // light up together.
  var sections = [];
  var byId = {};
  links.forEach(function (link) {
    var id = link.getAttribute('href').slice(1);
    var el = document.getElementById(id);
    if (!el) return;
    if (!byId[id]) { byId[id] = { el: el, links: [] }; sections.push(byId[id]); }
    byId[id].links.push(link);
  });

  // MemMimic parent stays active whenever any of its children is in view.
  var MEM_CHILDREN = { 'cross-trial': 1, 'in-trial': 1 };
  var memParent = document.querySelector('.toc-link.toc-parent');

  var sectionObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (l) { l.classList.remove('active'); });
      var match = sections.find(function (s) { return s.el === entry.target; });
      if (match) match.links.forEach(function (l) { l.classList.add('active'); });
      if (memParent && MEM_CHILDREN[entry.target.id]) memParent.classList.add('active');
    });
  }, { rootMargin: '-15% 0px -75% 0px' });
  sections.forEach(function (s) { sectionObs.observe(s.el); });
})();


/* BIBTEX COPY BUTTON
 * Wired inline via onclick="copyBibtex(this)". Uses the Clipboard API,
 * falling back to execCommand for older browsers.
 */
function copyBibtex(btn) {
  var text = document.getElementById('bibtex-content').innerText;

  var succeed = function () {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(function () {
      btn.textContent = 'Copy BibTeX';
      btn.classList.remove('copied');
    }, 2000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(succeed).catch(function () {
      fallbackCopy(text, succeed);
    });
  } else {
    fallbackCopy(text, succeed);
  }
}

function fallbackCopy(text, callback) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  callback();
}


/* CUSTOM VIDEO CONTROLS
 * Hover-reveal progress + play/rate/fullscreen pill on every <video>.
 * Autoplay/autoloop stays wired through the IntersectionObserver above;
 * this module coordinates via two data flags:
 *   - data-user-paused="1"   user hit our pause button; skip auto-play
 *   - data-scrubbing="1"     user is dragging the track; skip auto-pause
 */
(function () {
  var RATES = [0.5, 1, 1.5, 2];

  var SVG_PLAY  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5-13-7.5z" fill="currentColor"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="4.5" width="3.5" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="3.5" height="15" rx="1" fill="currentColor"/></svg>';
  var SVG_FS    = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 9 4 4 9 4"/><polyline points="20 9 20 4 15 4"/><polyline points="4 15 4 20 9 20"/><polyline points="20 15 20 20 15 20"/></svg>';
  var SVG_FS_EXIT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 4 9 9 4 9"/><polyline points="15 4 15 9 20 9"/><polyline points="4 15 9 15 9 20"/><polyline points="20 15 15 15 15 20"/></svg>';

  function makeBtn(cls, html, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.innerHTML = html;
    b.setAttribute('aria-label', label);
    return b;
  }

  function attach(video) {
    if (video.dataset.customControls === '1') return;
    video.dataset.customControls = '1';
    // We render our own UI; kill any native controls.
    video.removeAttribute('controls');
    video.controls = false;

    // Always wrap the video in a fresh .vid-host div so the overlay only
    // covers the video rect (never a sibling <figcaption> below it).
    var host = video.parentElement;
    if (!host.classList.contains('vid-host')) {
      var wrap = document.createElement('div');
      wrap.className = 'vid-host';
      host.insertBefore(wrap, video);
      wrap.appendChild(video);
      host = wrap;
    }
    if (video.classList.contains('full-bleed')) host.classList.add('vid-host-bleed');

    var overlay = document.createElement('div');
    overlay.className = 'vid-controls';

    var track = document.createElement('div');
    track.className = 'vid-track';
    var fill  = document.createElement('div');
    fill.className = 'vid-fill';
    var knob  = document.createElement('div');
    knob.className = 'vid-knob';
    var range = document.createElement('input');
    range.className = 'vid-range';
    range.type = 'range';
    range.min = '0';
    range.max = '1000';
    range.step = '1';
    range.value = '0';
    range.setAttribute('aria-label', 'Seek video');
    track.appendChild(fill);
    track.appendChild(knob);
    track.appendChild(range);

    var time = document.createElement('div');
    time.className = 'vid-time';
    var timeCur = document.createElement('span');
    timeCur.className = 'vid-time-cur';
    timeCur.textContent = '0:00';
    var timeSep = document.createElement('span');
    timeSep.className = 'vid-time-sep';
    timeSep.textContent = '/';
    var timeTot = document.createElement('span');
    timeTot.className = 'vid-time-tot';
    timeTot.textContent = '0:00';
    time.appendChild(timeCur);
    time.appendChild(timeSep);
    time.appendChild(timeTot);

    var pill = document.createElement('div');
    pill.className = 'vid-pill';
    var btnPlay = makeBtn('vid-btn vid-btn-play', SVG_PLAY, 'Play/Pause');
    var btnRate = makeBtn('vid-btn vid-btn-rate', '1×', 'Playback speed');
    var btnFs   = makeBtn('vid-btn vid-btn-fs', SVG_FS, 'Fullscreen');
    pill.appendChild(btnPlay);
    pill.appendChild(btnRate);
    pill.appendChild(btnFs);

    overlay.appendChild(track);
    overlay.appendChild(time);
    overlay.appendChild(pill);
    host.appendChild(overlay);

    // Initial rate index picks up any existing data-playbackrate default.
    var seedRate = parseFloat(video.dataset.playbackrate);
    var rateIdx = 1;
    if (seedRate > 0) {
      var i = RATES.indexOf(seedRate);
      if (i >= 0) rateIdx = i;
    }
    btnRate.textContent = RATES[rateIdx] + '×';

    var RANGE_MAX = 1000;
    var scrubbing = false;

    function syncPlayIcon() {
      btnPlay.innerHTML = video.paused ? SVG_PLAY : SVG_PAUSE;
    }
    function fmtTime(t) {
      if (!isFinite(t) || t < 0) t = 0;
      var total = Math.floor(t);
      var m = Math.floor(total / 60);
      var s = total % 60;
      return m + ':' + (s < 10 ? '0' + s : s);
    }
    function syncFill() {
      if (scrubbing) return;
      var d = video.duration;
      if (!(d > 0)) {
        fill.style.width = '0%';
        knob.style.left = '0%';
        timeCur.textContent = '0:00';
        timeTot.textContent = '0:00';
        return;
      }
      var pct = Math.max(0, Math.min(100, (video.currentTime / d) * 100));
      fill.style.width = pct + '%';
      knob.style.left = pct + '%';
      range.value = String(Math.round((pct / 100) * RANGE_MAX));
      timeCur.textContent = fmtTime(video.currentTime);
      timeTot.textContent = fmtTime(d);
    }
    video.addEventListener('play', syncPlayIcon);
    video.addEventListener('pause', syncPlayIcon);
    video.addEventListener('timeupdate', syncFill);
    video.addEventListener('loadedmetadata', syncFill);
    video.addEventListener('durationchange', syncFill);
    syncPlayIcon();
    syncFill();

    // Smoother scrubber while hovering the host: cheap RAF only when
    // we're actively engaged with a video, otherwise we rely on the
    // browser's 4Hz timeupdate event.
    var hoverRafId = 0;
    function tickHover() {
      if (!video.paused) syncFill();
      hoverRafId = requestAnimationFrame(tickHover);
    }
    host.addEventListener('pointerenter', function () {
      if (!hoverRafId) hoverRafId = requestAnimationFrame(tickHover);
    });
    host.addEventListener('pointerleave', function () {
      if (hoverRafId) { cancelAnimationFrame(hoverRafId); hoverRafId = 0; }
    });

    function togglePlay() {
      if (video.paused) {
        video.dataset.userPaused = '';
        video.muted = true;
        video.play().catch(function () {});
      } else {
        video.dataset.userPaused = '1';
        video.pause();
      }
    }

    // Click anywhere on the video surface toggles play/pause.
    video.addEventListener('click', function () { togglePlay(); });

    btnPlay.addEventListener('click', function (ev) {
      ev.stopPropagation();
      togglePlay();
    });

    btnRate.addEventListener('click', function (ev) {
      ev.stopPropagation();
      rateIdx = (rateIdx + 1) % RATES.length;
      var r = RATES[rateIdx];
      video.playbackRate = r;
      if (video.dataset.playbackrate) video.dataset.playbackrate = String(r);
      btnRate.textContent = r + '×';
    });

    btnFs.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (host.requestFullscreen) {
        host.requestFullscreen().catch(function () {
          if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        });
      } else if (host.webkitRequestFullscreen) {
        host.webkitRequestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    });
    function syncFsIcon() {
      var active = (document.fullscreenElement === host) ||
                   (document.webkitFullscreenElement === host);
      btnFs.innerHTML = active ? SVG_FS_EXIT : SVG_FS;
    }
    document.addEventListener('fullscreenchange', syncFsIcon);
    document.addEventListener('webkitfullscreenchange', syncFsIcon);

    // Scrubber. A transparent native <input type=range> sits on top of
    // .vid-track; the browser owns drag capture and thumb movement. We
    // commit on every `input` event (drag preview + tap-to-position).
    // seekToPct no-ops while duration is unknown, so an early drag moves
    // the knob visually and starts seeking once loadedmetadata fires.
    var wasPlaying = false;

    function rangePct() {
      var v = parseFloat(range.value);
      if (!(v >= 0)) v = 0;
      return Math.max(0, Math.min(1, v / RANGE_MAX));
    }
    function renderPct(pct) {
      var s = (pct * 100) + '%';
      fill.style.width = s;
      knob.style.left = s;
      range.value = String(Math.round(pct * RANGE_MAX));
      var d = video.duration;
      if (d > 0) timeCur.textContent = fmtTime(pct * d);
    }
    function seekToPct(pct) {
      var d = video.duration;
      if (!(d > 0)) return;
      // Clamp just below the end so a near-end seek on a looped clip
      // cannot wrap to 0 before the frame lands.
      var t = Math.min(pct * d, Math.max(0, d - 0.05));
      try { video.currentTime = t; } catch (e) {}
    }

    range.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      scrubbing = true;
      wasPlaying = !video.paused;
      overlay.classList.add('is-scrub');
      video.dataset.scrubbing = '1';
      if (video.preload !== 'auto') video.preload = 'auto';
      if (wasPlaying) video.pause();
      ev.stopPropagation();
    });
    range.addEventListener('input', function (ev) {
      var pct = rangePct();
      renderPct(pct);
      seekToPct(pct);
      ev.stopPropagation();
    });

    function endScrub() {
      if (!scrubbing) return;
      scrubbing = false;
      overlay.classList.remove('is-scrub');
      syncFill();
      if (wasPlaying) {
        video.muted = true;
        video.play().catch(function () {});
      }
      // Hold data-scrubbing briefly so a late IntersectionObserver pass
      // doesn't auto-pause the video we just told to resume.
      setTimeout(function () {
        if (!scrubbing) video.dataset.scrubbing = '';
      }, 260);
    }
    range.addEventListener('change', endScrub);
    range.addEventListener('pointerup', endScrub);
    range.addEventListener('pointercancel', endScrub);
    range.addEventListener('blur', endScrub);
    range.addEventListener('click', function (ev) { ev.stopPropagation(); });
  }

  function wireAll() {
    document.querySelectorAll('video').forEach(attach);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', wireAll)
    : wireAll();
})();


/* METHOD IMAGE LIGHTBOX
 * Click any .method-img img to open a centered zoomed view on a dimmed,
 * blurred backdrop. Close with a click on the backdrop, the × button,
 * or Esc. Image is preloaded before the open animation fires so the
 * transition isn't interrupted by decode/paint.
 */
(function () {
  var overlay = null;
  var opening = false;

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    var node = overlay;
    setTimeout(function () {
      if (overlay === node) removeOverlay();
    }, 320);
  }

  function onKey(ev) {
    if (ev.key === 'Escape') close();
  }

  function animateOpen(el) {
    // Double rAF so the initial (hidden) styles apply before the
    // `is-open` class triggers the transition. Without this the browser
    // can collapse both states into the same paint and skip the animation.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add('is-open');
      });
    });
  }

  function open(src, alt) {
    if (opening) return;
    opening = true;

    // Preload the image so the opening animation has decoded pixels to show.
    var preload = new Image();
    preload.onload = preload.onerror = function () {
      opening = false;
      if (overlay) return; // another open already in flight

      overlay = document.createElement('div');
      overlay.className = 'img-lightbox';

      var img = document.createElement('img');
      img.src = src;
      img.alt = alt || '';
      img.draggable = false;
      overlay.appendChild(img);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'img-lightbox-close';
      btn.setAttribute('aria-label', 'Close');
      btn.textContent = '×';
      overlay.appendChild(btn);

      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      animateOpen(overlay);

      overlay.addEventListener('click', function (ev) {
        if (ev.target === img) return;
        close();
      });
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        close();
      });
      document.addEventListener('keydown', onKey);
    };
    preload.src = src;
  }

  function wire() {
    document.querySelectorAll('.method-img img').forEach(function (img) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function (ev) {
        ev.preventDefault();
        open(img.currentSrc || img.src, img.alt);
      });
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', wire)
    : wire();
})();
