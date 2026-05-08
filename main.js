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
})();
