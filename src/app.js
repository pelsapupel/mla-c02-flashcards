// Flashcard controls. DOMAINS and CARDS are embedded by scripts/build.mjs.
let idx = 0;
let flipped = false;
let optionHeld = false;
let dealing = false;
let phoneMode = false;
let gesture = null;
let suppressClickUntil = 0;

const card = document.getElementById('card');
const scene = card.parentElement;
const stage = scene.parentElement;
const questionText = document.getElementById('questionText');
const answerText = document.getElementById('answerText');
const domainTagFront = document.getElementById('domainTagFront');
const domainTagBack = document.getElementById('domainTagBack');
const countFront = document.getElementById('countFront');
const countBack = document.getElementById('countBack');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const flipBtn = document.getElementById('flipBtn');
const flipLabel = document.getElementById('flipLabel');
const sourceTagFront = document.getElementById('sourceTagFront');
const examTagFront = document.getElementById('examTagFront');
const examTagBack = document.getElementById('examTagBack');

function updateControls(){
  prevBtn.disabled = dealing || idx === 0;
  nextBtn.disabled = dealing || idx === CARDS.length - 1;
  flipBtn.disabled = dealing || (optionHeld && CARDS.length < 2);
  flipLabel.textContent = optionHeld ? 'Random card' : 'Flip card';
  flipBtn.title = dealing ? 'Dealing a random card' :
    optionHeld ? 'Reveal a random card' : 'Flip card; hold Option / Alt to randomize';
}

function renderCard(){
  const item = CARDS[idx];
  const domain = DOMAINS[item.d];

  questionText.textContent = item.q;
  answerText.textContent = item.a;
  sourceTagFront.textContent = item.source === 'yt' ? '*Guide from YT course' : '*Guide from docx';
  examTagFront.textContent = item.exam;
  examTagBack.textContent = item.exam;
  domainTagFront.textContent = domain.label;
  domainTagBack.textContent = domain.label;

  const countLabel = (idx + 1) + ' / ' + CARDS.length;
  countFront.textContent = countLabel;
  countBack.textContent = countLabel;

  card.style.setProperty('--accent', 'var(' + domain.color + ')');
  card.style.setProperty('--accent-soft', 'var(' + domain.color + '-soft)');

  updateControls();
  fitPhoneText();
}

function setFlipped(next){
  if(dealing) return;
  flipped = next;
  card.classList.toggle('flipped', flipped);
}

function goTo(newIdx){
  if(dealing || newIdx < 0 || newIdx >= CARDS.length) return;
  idx = newIdx;
  setFlipped(false);
  renderCard();
}

async function dealRandomCard(){
  if(dealing || CARDS.length < 2) return;

  // Sample uniformly from every card except the one currently showing.
  const pick = Math.floor(Math.random() * (CARDS.length - 1));
  const newIdx = pick >= idx ? pick + 1 : pick;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || !scene.animate){
    goTo(newIdx);
    return;
  }

  // Preserve the visible face as a separate card that slides behind the deck.
  const outgoing = scene.cloneNode(true);
  outgoing.classList.add('dealing-card');
  outgoing.setAttribute('aria-hidden', 'true');
  outgoing.inert = true;
  outgoing.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  outgoing.querySelector('.card').style.transform = getComputedStyle(card).transform;
  stage.appendChild(outgoing);
  stage.classList.add('is-dealing');
  goTo(newIdx);
  dealing = true;
  updateControls();

  try{
    const sendBack = outgoing.animate([
      { transform:'translate(0, 0) rotate(0deg)', zIndex:3, opacity:1, offset:0 },
      { transform:'translate(68%, -16%) rotate(12deg)', zIndex:3, opacity:1, offset:0.45 },
      { transform:'translate(68%, -16%) rotate(12deg)', zIndex:0, opacity:1, offset:0.5 },
      { transform:'translate(10px, 10px) rotate(2.2deg)', zIndex:0, opacity:0.25, offset:1 }
    ], { duration:650, easing:'cubic-bezier(.4, 0, .2, 1)', fill:'forwards' });
    const reveal = scene.animate([
      { transform:'translate(6px, 6px) rotate(-1.4deg) scale(.98)' },
      { transform:'translate(0, 0) rotate(0deg) scale(1)' }
    ], { duration:650, easing:'cubic-bezier(.4, 0, .2, 1)' });
    await Promise.all([sendBack.finished, reveal.finished]);
  } finally {
    outgoing.remove();
    stage.classList.remove('is-dealing');
    dealing = false;
    updateControls();
  }
}

card.addEventListener('click', (event) => {
  if(phoneMode && performance.now() < suppressClickUntil){
    event.preventDefault();
    return;
  }
  setFlipped(!flipped);
});
flipBtn.addEventListener('click', () => optionHeld ? dealRandomCard() : setFlipped(!flipped));
prevBtn.addEventListener('click', () => goTo(idx - 1));
nextBtn.addEventListener('click', () => goTo(idx + 1));

document.addEventListener('keydown', (e) => {
  optionHeld = e.altKey;
  updateControls();
  if(e.altKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
  if(e.code === 'Space' && !e.target.closest('button')){ e.preventDefault(); setFlipped(!flipped); }
  if(e.code === 'ArrowRight'){ goTo(idx + 1); }
  if(e.code === 'ArrowLeft'){ goTo(idx - 1); }
});

document.addEventListener('keyup', (e) => {
  optionHeld = e.altKey;
  updateControls();
});

function releaseOption(){
  gesture = null;
  optionHeld = false;
  updateControls();
}
window.addEventListener('blur', releaseOption);
document.addEventListener('visibilitychange', () => {
  if(document.hidden) releaseOption();
});

// Primary touch input selects gesture controls, including after an input-mode change.
const phoneInput = window.matchMedia('(hover: none) and (pointer: coarse)');
const deckHint = document.getElementById('deckHint');
const desktopHint = deckHint.innerHTML;
const SWIPE_DISTANCE = 48;
const AXIS_BIAS = 1.25;

function fitPhoneText(){
  for(const paragraph of [questionText, answerText]){
    paragraph.style.fontSize = '';
    if(!phoneMode || !paragraph.parentElement.clientHeight) continue;
    const body = paragraph.parentElement;
    const style = getComputedStyle(body);
    const availableHeight = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const availableWidth = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    let size = parseFloat(getComputedStyle(paragraph).fontSize);
    while(size > 11 && (paragraph.scrollHeight > availableHeight + 1 || paragraph.scrollWidth > availableWidth + 1)){
      size = Math.max(11, size - 0.5);
      paragraph.style.fontSize = size + 'px';
    }
  }
}

function updateInputMode(){
  phoneMode = phoneInput.matches;
  gesture = null;
  document.documentElement.classList.toggle('phone-mode', phoneMode);
  deckHint.innerHTML = phoneMode
    ? 'Swipe left: next &middot; swipe right: previous<br>Swipe up: flip &middot; two fingers up: random card'
    : desktopHint;
  fitPhoneText();
}

function preventPhoneDefault(event){
  if(phoneMode && event.cancelable) event.preventDefault();
}

function updateTouchPositions(event){
  if(!gesture) return;
  for(const touch of Array.from(event.changedTouches)){
    const point = gesture.points.get(touch.identifier);
    if(!point){
      gesture.cancelled = true;
      continue;
    }
    point.x = touch.clientX;
    point.y = touch.clientY;
    point.travel = Math.max(point.travel, Math.hypot(point.x - point.startX, point.y - point.startY));
  }
}

function startPhoneGesture(event){
  if(!phoneMode) return;
  preventPhoneDefault(event);
  suppressClickUntil = performance.now() + 500;
  if(!gesture){
    gesture = {
      points: new Map(),
      fingers: 0,
      cancelled: dealing,
      startedAt: performance.now(),
      onCard: event.target instanceof Element && Boolean(event.target.closest('#card')),
    };
  }
  for(const touch of Array.from(event.changedTouches)){
    if(gesture.points.has(touch.identifier)){
      gesture.cancelled = true;
      continue;
    }
    gesture.points.set(touch.identifier, {
      startX: touch.clientX, startY: touch.clientY,
      x: touch.clientX, y: touch.clientY, travel: 0,
    });
  }
  gesture.fingers = Math.max(gesture.fingers, event.touches.length);
  if(gesture.points.size > 2) gesture.cancelled = true;
}

function movePhoneGesture(event){
  if(!phoneMode) return;
  preventPhoneDefault(event);
  updateTouchPositions(event);
}

function endPhoneGesture(event){
  if(!phoneMode) return;
  preventPhoneDefault(event);
  suppressClickUntil = performance.now() + 500;
  updateTouchPositions(event);
  if(!gesture || event.touches.length) return;
  const completed = gesture;
  gesture = null;
  if(completed.cancelled || dealing) return;
  const points = Array.from(completed.points.values());
  const movedUp = point => {
    const dx = point.x - point.startX;
    const dy = point.y - point.startY;
    return dy <= -SWIPE_DISTANCE && -dy > Math.abs(dx) * AXIS_BIAS;
  };
  if(completed.fingers === 2 && points.length === 2){
    if(points.every(movedUp)) dealRandomCard();
    return;
  }
  if(completed.fingers !== 1 || points.length !== 1) return;
  const point = points[0];
  const dx = point.x - point.startX;
  const dy = point.y - point.startY;
  if(Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * AXIS_BIAS){
    goTo(idx + (dx < 0 ? 1 : -1));
  } else if(movedUp(point)){
    setFlipped(!flipped);
  } else if(completed.onCard && point.travel < 12 && performance.now() - completed.startedAt < 500){
    // Handle taps directly because preventing touch defaults suppresses synthetic clicks.
    setFlipped(!flipped);
  }
}

document.addEventListener('touchstart', startPhoneGesture, { passive: false });
document.addEventListener('touchmove', movePhoneGesture, { passive: false });
document.addEventListener('touchend', endPhoneGesture, { passive: false });
document.addEventListener('touchcancel', (event) => {
  preventPhoneDefault(event);
  gesture = null;
}, { passive: false });
document.addEventListener('gesturestart', preventPhoneDefault, { passive: false });
document.addEventListener('gesturechange', preventPhoneDefault, { passive: false });
phoneInput.addEventListener('change', updateInputMode);
window.addEventListener('resize', () => {
  gesture = null;
  fitPhoneText();
});

updateInputMode();
renderCard();
document.documentElement.classList.add('deck-ready');
fitPhoneText();
