// Flashcard controls. DOMAINS and CARDS are embedded by scripts/build.mjs.
let idx = 0;
let flipped = false;
let optionHeld = false;
let dealing = false;

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
  if(flipBtn.disabled || !optionHeld || dealing || CARDS.length < 2) return;

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

card.addEventListener('click', () => setFlipped(!flipped));
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
  optionHeld = false;
  updateControls();
}
window.addEventListener('blur', releaseOption);
document.addEventListener('visibilitychange', () => {
  if(document.hidden) releaseOption();
});

renderCard();
document.documentElement.classList.add('deck-ready');
