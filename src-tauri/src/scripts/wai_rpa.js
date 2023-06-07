$(() => {
  window.hasWrite = false;
  window.timer = setInterval(() => {
    if ($('textarea')) {
      if (!window.hasWrite) {
        window.hasWrite = true;
        $('textarea').val('hi');
      }
      $('textarea').trigger('focus');
    }
  }, 1000);
});
async function init() {
  console.log('zepto init');
}

window.simulateEnterKey = () => {
  setTimeout(() => {
    console.log($('textarea'));
    $('textarea').val('hi');
    $('textarea').focus();
    $('textarea').trigger('focus');
    var e = jQuery.Event('keypress');
    e.which = 13;
    e.keyCode = 13;
    $('textarea').trigger(e);
  }, 5000);
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
document.addEventListener('DOMContentLoaded', init);
