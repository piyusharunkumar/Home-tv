/* Word clock: spells the time in lit letters on a dim letter grid ("IT IS HALF PAST TEN").
 * Two layouts: 'wide' (20 x 5, for the gallery's right-hand column) and 'square'
 * (11 x 10, the classic word-clock face, for the full-screen Clock mode).
 * Words change every five minutes; the four corner dots count the minutes in between. */
var WordClock = (function () {
  // Each word: [row, column, length]. Minute words end in _M; hour words are ONE…TWELVE.
  var LAYOUTS = {
    square: {
      rows: ['ITLISASAMPM', 'ACQUARTERDC', 'TWENTYFIVEX', 'HALFSTENFTO', 'PASTERUNINE',
             'ONESIXTHREE', 'FOURFIVETWO', 'EIGHTELEVEN', 'SEVENTWELVE', 'TENSEOCLOCK'],
      words: {
        IT: [0, 0, 2], IS: [0, 3, 2], A: [1, 0, 1], QUARTER: [1, 2, 7], TWENTY: [2, 0, 6], FIVE_M: [2, 6, 4],
        HALF: [3, 0, 4], TEN_M: [3, 5, 3], TO: [3, 9, 2], PAST: [4, 0, 4], NINE: [4, 7, 4],
        ONE: [5, 0, 3], SIX: [5, 3, 3], THREE: [5, 6, 5], FOUR: [6, 0, 4], FIVE: [6, 4, 4], TWO: [6, 8, 3],
        EIGHT: [7, 0, 5], ELEVEN: [7, 5, 6], SEVEN: [8, 0, 5], TWELVE: [8, 5, 6], TEN: [9, 0, 3], OCLOCK: [9, 5, 6]
      }
    },
    wide: {
      rows: ['ITLISAQUARTERHALFTEN', 'TWENTYFIVEXPASTETOAM', 'ONETWOTHREEFOURFIVEX',
             'SIXSEVENEIGHTNINETEN', 'ELEVENTWELVEZOCLOCKS'],
      words: {
        IT: [0, 0, 2], IS: [0, 3, 2], A: [0, 5, 1], QUARTER: [0, 6, 7], HALF: [0, 13, 4], TEN_M: [0, 17, 3],
        TWENTY: [1, 0, 6], FIVE_M: [1, 6, 4], PAST: [1, 11, 4], TO: [1, 16, 2],
        ONE: [2, 0, 3], TWO: [2, 3, 3], THREE: [2, 6, 5], FOUR: [2, 11, 4], FIVE: [2, 15, 4],
        SIX: [3, 0, 3], SEVEN: [3, 3, 5], EIGHT: [3, 8, 5], NINE: [3, 13, 4], TEN: [3, 17, 3],
        ELEVEN: [4, 0, 6], TWELVE: [4, 6, 6], OCLOCK: [4, 13, 6]
      }
    }
  };
  var HOURS = ['TWELVE', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN'];
  var MINUTES = [['OCLOCK'], ['FIVE_M', 'PAST'], ['TEN_M', 'PAST'], ['A', 'QUARTER', 'PAST'], ['TWENTY', 'PAST'],
    ['TWENTY', 'FIVE_M', 'PAST'], ['HALF', 'PAST'], ['TWENTY', 'FIVE_M', 'TO'], ['TWENTY', 'TO'],
    ['A', 'QUARTER', 'TO'], ['TEN_M', 'TO'], ['FIVE_M', 'TO']];

  // The words to light for a time, e.g. 22:30 → IT IS HALF PAST TEN.
  function words(d) {
    var step = Math.floor(d.getMinutes() / 5), h = d.getHours() % 12;
    if (step > 6) h = (h + 1) % 12;                 // "…TO" names the next hour
    var w = ['IT', 'IS'].concat(MINUTES[step]);
    if (step === 0) w.splice(2, 0, HOURS[h]); else w.push(HOURS[h]);
    return w;
  }

  // Builds the letter grid once inside `el`, then only flips classes on each update.
  function render(el, layoutName, d) {
    var L = LAYOUTS[layoutName];
    if (!el || !L) return;
    if (el.dataset.layout !== layoutName) {
      var html = '';
      L.rows.forEach(function (row, r) {
        html += '<div class="wclk-row">';
        for (var c = 0; c < row.length; c++) html += '<span data-rc="' + r + '-' + c + '">' + row[c] + '</span>';
        html += '</div>';
      });
      html += '<i class="wclk-dot d1"></i><i class="wclk-dot d2"></i><i class="wclk-dot d3"></i><i class="wclk-dot d4"></i>';
      el.innerHTML = html;
      el.dataset.layout = layoutName;
      el.className = (el.className.replace(/\s*wclk(-square|-wide)?\b/g, '') + ' wclk wclk-' + layoutName).trim();
    }
    var lit = {};
    words(d).forEach(function (k) {
      var p = L.words[k];
      for (var i = 0; i < p[2]; i++) lit[p[0] + '-' + (p[1] + i)] = true;
    });
    var cells = el.querySelectorAll('span[data-rc]');
    for (var j = 0; j < cells.length; j++) cells[j].className = lit[cells[j].getAttribute('data-rc')] ? 'on' : '';
    var extra = d.getMinutes() % 5, dots = el.querySelectorAll('.wclk-dot');
    for (var k = 0; k < dots.length; k++) dots[k].classList.toggle('on', k < extra);
    var label = words(d).join(' ').replace(/_M/g, '').replace('OCLOCK', "O'CLOCK").toLowerCase();
    el.setAttribute('aria-label', 'It is ' + label.replace(/^it is /, ''));
  }

  return { render: render, words: words, layouts: LAYOUTS };
})();
