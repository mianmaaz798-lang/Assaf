/* ASSAF — procedural perfume bottle renderer (SVG).
   Every product gets a bottle drawn from its liquid colours, cap finish and shape,
   so the site looks complete without photography. Replace with <img> tags once
   product photography is available (see README). */
(function () {
  var uid = 0;
  var CAPS = {
    gold: ['#f6dc9b', '#c9a45c', '#8a6a26'],
    black: ['#4a4a4a', '#1d1d1d', '#050505'],
    silver: ['#ffffff', '#c9c9c9', '#7d7d7d'],
    rose: ['#f8d6c8', '#d79f8a', '#9a6250']
  };

  function grad(id, stops, vertical) {
    var attrs = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"';
    return '<linearGradient id="' + id + '" ' + attrs + '>' +
      stops.map(function (s, i) {
        return '<stop offset="' + (i / (stops.length - 1)) + '" stop-color="' + s + '"/>';
      }).join('') + '</linearGradient>';
  }

  function textColor(p) {
    // light liquids get dark label text
    var hex = p.liquid[0].replace('#', '');
    var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 170 ? '#3a2a17' : '#f6e7c4';
  }

  ASSAF.bottle = function (p, opts) {
    opts = opts || {};
    var n = ++uid;
    var L = 'liq' + n, C = 'cap' + n, G = 'gls' + n, S = 'shd' + n;
    var cap = CAPS[p.cap] || CAPS.gold;
    var tc = textColor(p);
    var body, neck, capEl, label, shine;

    if (p.shape === 'tall') {
      body = '<rect x="55" y="95" width="90" height="190" rx="8" fill="url(#' + L + ')"/>';
      shine = '<rect x="55" y="95" width="90" height="190" rx="8" fill="url(#' + G + ')"/>' +
        '<rect x="64" y="104" width="8" height="170" rx="4" fill="#fff" opacity=".28"/>';
      neck = '<rect x="88" y="78" width="24" height="20" fill="url(#' + C + ')"/>';
      capEl = '<rect x="76" y="22" width="48" height="58" rx="3" fill="url(#' + C + ')"/>' +
        '<rect x="76" y="30" width="48" height="3" fill="#000" opacity=".15"/>';
      label = { x: 100, y: 190, w: 64 };
    } else if (p.shape === 'round') {
      body = '<circle cx="100" cy="200" r="80" fill="url(#' + L + ')"/>';
      shine = '<circle cx="100" cy="200" r="80" fill="url(#' + G + ')"/>' +
        '<path d="M48 175 A60 60 0 0 1 90 135" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".35"/>';
      neck = '<rect x="86" y="108" width="28" height="18" fill="url(#' + C + ')"/>';
      capEl = '<rect x="70" y="46" width="60" height="64" rx="30" fill="url(#' + C + ')"/>';
      label = { x: 100, y: 205, w: 76 };
    } else {
      body = '<rect x="38" y="110" width="124" height="172" rx="12" fill="url(#' + L + ')"/>';
      shine = '<rect x="38" y="110" width="124" height="172" rx="12" fill="url(#' + G + ')"/>' +
        '<rect x="48" y="120" width="10" height="150" rx="5" fill="#fff" opacity=".28"/>';
      neck = '<rect x="85" y="92" width="30" height="20" fill="url(#' + C + ')"/>';
      capEl = '<rect x="66" y="36" width="68" height="58" rx="4" fill="url(#' + C + ')"/>' +
        '<rect x="66" y="80" width="68" height="4" fill="#000" opacity=".18"/>';
      label = { x: 100, y: 200, w: 84 };
    }

    var name = p.name.toUpperCase();
    var labelEl =
      '<g text-anchor="middle" fill="' + tc + '">' +
      '<line x1="' + (label.x - label.w / 2) + '" x2="' + (label.x + label.w / 2) + '" y1="' + (label.y - 22) + '" y2="' + (label.y - 22) + '" stroke="' + tc + '" stroke-width=".8" opacity=".6"/>' +
      '<text x="' + label.x + '" y="' + label.y + '" font-family="Cormorant Garamond, serif" font-size="20" letter-spacing="5" font-weight="600">ASSAF</text>' +
      '<text x="' + label.x + '" y="' + (label.y + 16) + '" font-family="Jost, sans-serif" font-size="6.5" letter-spacing="2">' + name + '</text>' +
      '<line x1="' + (label.x - label.w / 2) + '" x2="' + (label.x + label.w / 2) + '" y1="' + (label.y + 28) + '" y2="' + (label.y + 28) + '" stroke="' + tc + '" stroke-width=".8" opacity=".6"/>' +
      '</g>';

    return '<svg class="bottle-svg" viewBox="0 0 200 310" role="img" aria-label="' + p.name + ' bottle" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      grad(L, [p.liquid[0], p.liquid[1]], true) +
      grad(C, [cap[2], cap[0], cap[1], cap[2]], false) +
      '<linearGradient id="' + G + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/>' +
      '<stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>' +
      '<radialGradient id="' + S + '"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      (opts.shadow === false ? '' : '<ellipse cx="100" cy="294" rx="78" ry="10" fill="url(#' + S + ')"/>') +
      neck + body + shine + labelEl + capEl +
      '</svg>';
  };
})();
