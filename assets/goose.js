/* MAMM 2026 — goose companion.
   A small original goose that greets delegates and follows the pointer (or the
   last tap on touch screens) like a desktop pet. Self-contained: injects its own
   styles, draws itself as inline SVG, remembers on/off in localStorage.
   Remove this file and its <script> tag to remove the goose entirely. */
(function () {
'use strict';

var KEY = 'mamm2026.goose';
var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
var coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }

/* ------------------------------------------------------------------ style */
var css = '' +
'.goose{position:fixed;left:0;top:0;z-index:35;width:var(--gs);height:var(--gs);--gs:72px;cursor:pointer;' +
'  -webkit-tap-highlight-color:transparent;touch-action:manipulation;border:0;padding:0;background:none;will-change:transform}' +
'.goose:focus-visible{outline:2px solid var(--ring,#2563eb);outline-offset:4px;border-radius:12px}' +
'.goose svg{width:100%;height:100%;overflow:visible;display:block;filter:drop-shadow(0 3px 3px rgba(15,23,42,.18))}' +
'.goose .g-flip{transform-origin:50% 50%;transition:transform .18s ease-out}' +
'.goose.left .g-flip{transform:scaleX(-1)}' +
'.goose .g-body{transform-origin:60px 92px}' +
'.goose.walk .g-body{animation:g-bob .36s ease-in-out infinite alternate}' +
'.goose .g-legL,.goose .g-legR{transform-origin:58px 96px}' +
'.goose.walk .g-legL{animation:g-step .36s ease-in-out infinite alternate}' +
'.goose.walk .g-legR{animation:g-step .36s ease-in-out infinite alternate-reverse}' +
'.goose .g-neck{transform-origin:66px 70px;transition:transform .35s cubic-bezier(.16,1,.3,1)}' +
'.goose.look .g-neck{animation:g-look 2.4s ease-in-out}' +
'.goose.preen .g-neck{animation:g-preen 1.8s ease-in-out}' +
'.goose.sleep .g-neck{transform:rotate(-58deg) translate(-6px,10px)}' +
'.goose.sleep .g-eye{transform:scaleY(.12)}' +
'.goose .g-eye{transform-origin:84px 33px;animation:g-blink 5s infinite}' +
'.goose .g-wing{transform-origin:46px 70px;transition:transform .2s}' +
'.goose.flap .g-wing{animation:g-flap .18s ease-in-out 6 alternate}' +
'.goose.hop{animation:g-hop .5s cubic-bezier(.3,1.6,.5,1)}' +
'.goose .g-z{opacity:0}' +
'.goose.sleep .g-z{animation:g-z 2.6s ease-in-out infinite}' +
'@keyframes g-bob{from{transform:translateY(0) rotate(-2deg)}to{transform:translateY(-3px) rotate(2deg)}}' +
'@keyframes g-step{from{transform:rotate(-22deg)}to{transform:rotate(22deg)}}' +
'@keyframes g-look{0%,100%{transform:none}30%{transform:rotate(-12deg)}65%{transform:rotate(10deg) translateX(2px)}}' +
'@keyframes g-preen{0%,100%{transform:none}40%,70%{transform:rotate(-70deg) translate(-12px,14px)}55%{transform:rotate(-64deg) translate(-12px,14px)}}' +
'@keyframes g-blink{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}' +
'@keyframes g-flap{from{transform:rotate(0)}to{transform:rotate(-38deg)}}' +
'@keyframes g-hop{0%,100%{translate:0 0}40%{translate:0 -16px}}' +
'@keyframes g-z{0%{opacity:0;transform:translate(0,0) scale(.6)}30%{opacity:1}100%{opacity:0;transform:translate(10px,-22px) scale(1.1)}}' +
'.goose-bubble{position:fixed;left:0;top:0;z-index:36;max-width:230px;padding:9px 12px;border-radius:12px;' +
'  background:var(--surface,#fff);color:var(--ink,#0f172a);border:1px solid var(--border-strong,#b6c2d2);' +
'  box-shadow:0 8px 24px rgba(15,23,42,.16);font:500 13.5px/1.4 var(--font-sans,system-ui,sans-serif);' +
'  opacity:0;transform:translateY(6px) scale(.96);transform-origin:bottom center;pointer-events:none;' +
'  transition:opacity .25s cubic-bezier(.16,1,.3,1),transform .25s cubic-bezier(.16,1,.3,1)}' +
'.goose-bubble.show{opacity:1;transform:none}' +
'.goose-bubble b{color:var(--primary,#14366b)}' +
'.goose-bubble::after{content:"";position:absolute;left:var(--tail,50%);bottom:-7px;width:12px;height:12px;margin-left:-6px;' +
'  background:inherit;border-right:1px solid var(--border-strong,#b6c2d2);border-bottom:1px solid var(--border-strong,#b6c2d2);transform:rotate(45deg)}' +
'@media (max-width:600px){.goose{--gs:58px}.goose-bubble{max-width:200px;font-size:13px}}' +
'@media print{.goose,.goose-bubble{display:none!important}}';
var st = document.createElement('style');
st.textContent = css;
document.head.appendChild(st);

/* -------------------------------------------------------------- the goose
   Original drawing, side view facing right. viewBox 0..120. */
var SVG = '' +
'<svg viewBox="0 0 120 120" aria-hidden="true"><g class="g-flip">' +
  '<g class="g-legL"><path d="M56 92 L54 108" stroke="#e8890c" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M48 109 Q55 104 62 109 Z" fill="#f59e0b" stroke="#e8890c" stroke-width="2" stroke-linejoin="round"/></g>' +
  '<g class="g-legR"><path d="M66 92 L68 108" stroke="#d97706" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M62 109 Q69 104 76 109 Z" fill="#f59e0b" stroke="#d97706" stroke-width="2" stroke-linejoin="round"/></g>' +
  '<g class="g-body">' +
    '<path d="M22 66 Q14 52 26 50 Q30 58 38 60 Q60 52 80 62 Q94 70 90 84 Q84 98 60 98 Q34 98 26 84 Q22 76 22 66 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>' +
    '<path d="M32 88 Q56 97 84 86" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>' +
    '<g class="g-wing"><path d="M36 68 Q52 58 70 70 Q66 84 50 86 Q38 84 36 68 Z" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>' +
      '<path d="M44 76 Q52 72 62 76 M46 81 Q53 78 60 81" fill="none" stroke="#cbd5e1" stroke-width="1.6" stroke-linecap="round"/></g>' +
    '<g class="g-neck">' +
      '<path d="M66 70 Q62 50 72 38 Q78 30 86 30" fill="none" stroke="#cbd5e1" stroke-width="15" stroke-linecap="round"/>' +
      '<path d="M66 70 Q62 50 72 38 Q78 30 86 30" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round"/>' +
      '<circle cx="84" cy="32" r="11" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>' +
      '<path d="M93 29 Q104 31 106 35 Q103 39 93 38 Z" fill="#f59e0b" stroke="#d97706" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M94 35 L104 35.5" stroke="#d97706" stroke-width="1.2" stroke-linecap="round"/>' +
      '<g class="g-eye"><circle cx="86" cy="29" r="2.6" fill="#0f172a"/><circle cx="86.9" cy="28.1" r=".9" fill="#fff"/></g>' +
      '<ellipse cx="83" cy="36" rx="3" ry="1.8" fill="#fda4af" opacity=".55"/>' +
      '<path d="M63 62 L70 66 L63 70 Z M77 62 L70 66 L77 70 Z" fill="#0f766e"/><circle cx="70" cy="66" r="2.2" fill="#14366b"/>' +
    '</g>' +
  '</g>' +
  '<text class="g-z" x="94" y="22" font-family="ui-monospace,monospace" font-size="12" font-weight="700" fill="#64748b">z</text>' +
'</g></svg>';

/* --------------------------------------------------------------- messages */
var TIPS = {
  schedule: ['Tap a session card to see its papers.', 'Room 1, 2 and 3 run side by side — pick your track!'],
  papers: ['Press <b>/</b> to search titles, authors and abstracts.', 'Use the star to build <b>My programme</b>.'],
  paper: ['Save this paper with the <b>star</b>, or add it to your calendar.', 'The QR button shares this exact paper.'],
  speakers: ['Keynote lectures are all in <b>Room 1</b>.'],
  authors: ['Tap a name to list that author’s papers.'],
  rooms: ['Session chairs: here is your room, hour by hour.'],
  saved: ['Your starred papers stay in this browser only.'],
  session: ['Papers are listed in presentation order.'],
  info: ['Day 3 is the Sun Moon Lake cruise!']
};
var GREET = 'Hello! Welcome to <b>MAMM 2026</b>. I’ll tag along — tap me any time.';
var HONK = ['Honk!', 'Honk honk!', 'HONK.', 'Need a session? Try the search!', 'See you at the coffee break!'];

/* ------------------------------------------------------------------ state */
var el, bubble, x, y, tx, ty, face = 1, moving = false, lastMove = 0, lastTip = 0, idleStage = 0, bubbleTimer = null, raf = null;
var size = function () { return el ? el.offsetWidth : 72; };

function home() {
  return { x: 18, y: window.innerHeight - size() - 18 };
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function place() {
  el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  if (bubble.classList.contains('show')) placeBubble();
}
function placeBubble() {
  var bw = bubble.offsetWidth, bh = bubble.offsetHeight, s = size();
  var bx = clamp(x + s / 2 - bw / 2, 8, window.innerWidth - bw - 8);
  var by = y - bh - 10;
  if (by < 8) by = y + s + 12;
  bubble.style.setProperty('--tail', clamp(x + s / 2 - bx, 14, bw - 14) + 'px');
  bubble.style.transform = '';
  bubble.style.left = bx + 'px';
  bubble.style.top = by + 'px';
}
function say(html, ms) {
  if (!bubble) return;
  bubble.innerHTML = html;
  bubble.classList.add('show');
  placeBubble();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(function () { if (bubble) bubble.classList.remove('show'); }, ms || 4200);
}
function act(cls, ms) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;                  // restart the animation
  el.classList.add(cls);
  setTimeout(function () { if (el) el.classList.remove(cls); }, ms);
}
function wake() {
  if (!el) return;
  idleStage = 0;
  el.classList.remove('sleep');
}

/* follow the pointer, stopping a little short of it so it never sits under the cursor */
function setTarget(px, py) {
  var s = size();
  tx = clamp(px - s / 2, 4, window.innerWidth - s - 4);
  ty = clamp(py + 26, 60, window.innerHeight - s - 6);   // walk to just below the pointer
  lastMove = performance.now();
  wake();
}

function tick(now) {
  raf = requestAnimationFrame(tick);
  var dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy);
  var stopAt = coarse ? 4 : 48;
  if (d > stopAt) {
    var sp = Math.min(d - stopAt, d > 260 ? 4.2 : 2.6);
    x += dx / d * sp;
    y += dy / d * sp;
    if (Math.abs(dx) > 2) {
      var f = dx > 0 ? 1 : -1;
      if (f !== face) { face = f; el.classList.toggle('left', face < 0); }
    }
    if (!moving) { moving = true; el.classList.add('walk'); }
    place();
    lastMove = now;
  } else if (moving) {
    moving = false;
    el.classList.remove('walk');
  } else {
    var idle = now - lastMove;
    if (idleStage === 0 && idle > 4000) { idleStage = 1; act(Math.random() < .5 ? 'look' : 'preen', 2500); }
    else if (idleStage === 1 && idle > 11000) { idleStage = 2; act('look', 2500); }
    else if (idleStage === 2 && idle > 25000) { idleStage = 3; el.classList.add('sleep'); }
  }
}

function tip(view) {
  var now = Date.now();
  if (now - lastTip < 30000) return;           // not chatty: at most one tip every 30 s
  var list = TIPS[view];
  if (!list) return;
  lastTip = now;
  setTimeout(function () { say(list[Math.floor(Math.random() * list.length)], 4200); }, 900);
}

/* ------------------------------------------------------------------- build */
function build() {
  el = document.createElement('button');
  el.type = 'button';
  el.className = 'goose';
  el.setAttribute('aria-label', 'Goose companion — press to say hello');
  el.innerHTML = SVG;
  bubble = document.createElement('div');
  bubble.className = 'goose-bubble';
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  document.body.appendChild(bubble);

  var h = home();
  if (reduced) { x = h.x; y = h.y; }
  else { x = window.innerWidth + 20; y = h.y; face = -1; el.classList.add('left'); }   // waddles in from the right
  tx = h.x; ty = h.y;
  place();

  el.addEventListener('click', function (e) {
    e.stopPropagation();
    wake();
    if (!reduced) { act('flap', 1200); act('hop', 520); }
    say(HONK[Math.floor(Math.random() * HONK.length)], 2200);
  });

  if (!reduced) {
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse') setTarget(e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' && !el.contains(e.target)) setTarget(e.clientX, e.clientY - 60);
    }, { passive: true });
    document.addEventListener('mouseleave', function () {
      var hh = home(); tx = hh.x; ty = hh.y;
    });
    lastMove = performance.now();
    raf = requestAnimationFrame(tick);
  }
  window.addEventListener('resize', function () {
    x = clamp(x, 4, window.innerWidth - size() - 4);
    y = clamp(y, 60, window.innerHeight - size() - 6);
    tx = clamp(tx, 4, window.innerWidth - size() - 4);
    ty = clamp(ty, 60, window.innerHeight - size() - 6);
    place();
  });
  window.addEventListener('hashchange', function () {
    var v = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || 'schedule';
    tip(v);
  });

  setTimeout(function () { say(GREET, 5200); lastTip = Date.now(); if (!reduced) act('flap', 1200); }, reduced ? 600 : 1500);
}
function destroy() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (el) el.remove();
  if (bubble) bubble.remove();
  el = bubble = null;
}

/* --------------------------------------------------------------- on / off */
function syncToggle(on) {
  var b = document.getElementById('goose-toggle');
  if (b) {
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? 'Hide the goose' : 'Bring back the goose';
  }
}
function setOn(on) {
  save(on);
  if (on && !el) build();
  if (!on && el) destroy();
  syncToggle(on);
}
function init() {
  var pref = load();
  var on = pref === null ? true : !!pref;
  var b = document.getElementById('goose-toggle');
  if (b) b.addEventListener('click', function () { setOn(!el); });
  setOn(on);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
