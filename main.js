/* BEACON project page — toast for "releasing soon" buttons. */

(function () {
  var toast = document.getElementById('toast');
  var hideTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    toast.setAttribute('aria-hidden', 'false');

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      toast.classList.remove('visible');
      toast.setAttribute('aria-hidden', 'true');
    }, 2600);
  }

  document.querySelectorAll('[data-coming-soon]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var label = el.getAttribute('data-coming-soon') || 'This';
      showToast(label + ' releasing soon — stay tuned!');
    });
  });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  document.querySelectorAll('[data-copy-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sel = btn.getAttribute('data-copy-target');
      var target = sel ? document.querySelector(sel) : null;
      if (!target) return;
      copyText(target.innerText.trim()).then(function () {
        showToast('BibTeX copied to clipboard');
      }).catch(function () {
        showToast('Could not copy — please copy manually');
      });
    });
  });
})();
