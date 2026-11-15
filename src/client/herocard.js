// Le carton de déblocage d'un héros : volontairement démesuré.
// Tricolore qui claque, drapeaux des luttes, portrait géant, nom énorme, vraie citation
// sourcée, tambours et cuivres. Se ferme tout seul ou au premier toucher.

import { spriteElement } from './sprites.js';
import { frenchDate } from './dom.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const CONFETTI = ['#3b5dc9', '#f4f4f4', '#e43b44', '#f6c21c'];

/**
 * @param {object} bundle  le contenu du jeu
 * @param {object} hero    une fiche de `bundle.heros`
 * @param {{audio?: object, reduced?: boolean, rescued?: boolean}} options
 * @returns {Promise<void>} résolue quand le carton est fermé
 */
export function showHeroCard(bundle, hero, { audio = null, reduced = false, rescued = true } = {}) {
  return new Promise((resolve) => {
    const card = el('div', `carton${reduced ? ' sobre' : ''}`);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', hero.nom);

    const bands = el('div', 'bandes');
    bands.append(el('i'), el('i'), el('i'));
    card.append(bands, el('div', 'rayons'));

    const flags = Object.values(bundle.drapeaux);
    const half = Math.ceil(flags.length / 2);
    [['haut', flags.slice(0, half)], ['bas', flags.slice(half)]].forEach(([side, list]) => {
      const row = el('div', `drapeaux ${side}`);
      list.forEach((f) => {
        const flag = spriteElement(f.sprites.image, bundle.palette, 4);
        flag.title = f.nom;
        row.append(flag);
      });
      card.append(row);
    });

    const scene = el('div', 'scene');
    const portrait = el('div', 'portrait');
    const art = hero.sprites.portrait || hero.sprites.repos;
    const scale = Math.max(3, Math.floor(Math.min(innerHeight * 0.44, innerWidth * 0.36) / art.length));
    portrait.append(spriteElement(art, bundle.palette, scale));

    const words = el('div', 'mots');
    words.append(el('div', 'tampon', rescued ? 'Camarade libéré·e !' : 'Entre en scène'));
    words.append(el('h1', 'nom', hero.nom));
    if (hero.cri) words.append(el('p', 'cri', `« ${hero.cri} »`));
    const quote = bundle.citations[hero.citation];
    if (quote) {
      words.append(el('p', 'source', `Vraie citation : « ${quote.texte} » — ${quote.auteur}, ${frenchDate(quote.date)}`));
    }
    const perks = [rescued && '+1 vie', hero.speciale?.nom && `Spéciale : ${hero.speciale.nom}`].filter(Boolean);
    if (perks.length) {
      words.append(el('br'), el('p', 'bonus', perks.join(' · ')));
    }
    scene.append(portrait, words);
    card.append(scene);

    if (!reduced) {
      const confetti = el('div', 'confettis');
      for (let i = 0; i < 44; i++) {
        const bit = el('i');
        bit.style.left = `${(i * 37) % 100}%`;
        bit.style.background = CONFETTI[i % CONFETTI.length];
        bit.style.animationDuration = `${1.5 + ((i * 13) % 10) / 8}s`;
        bit.style.animationDelay = `${-((i * 7) % 20) / 10}s`;
        confetti.append(bit);
      }
      card.append(confetti);
    }

    document.body.append(card);
    // Le nom doit tenir en entier : on réduit la police jusqu'à ce qu'aucun mot ne déborde.
    const name = words.querySelector('.nom');
    for (let size = parseFloat(getComputedStyle(name).fontSize); name.scrollWidth > words.clientWidth && size > 18; size -= 3) {
      name.style.fontSize = `${size}px`;
    }
    audio?.play('tambour');
    const timers = [
      setTimeout(() => audio?.play('cuivres'), 480),
      setTimeout(() => audio?.speak(hero.id), 560),
      setTimeout(() => audio?.play('cymbale'), 600),
      setTimeout(close, reduced ? 1700 : 3200),
    ];

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      timers.forEach(clearTimeout);
      removeEventListener('keydown', onKey, true);
      card.classList.add('sort');
      setTimeout(() => {
        card.remove();
        resolve();
      }, 190);
    }
    function onKey(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) close();
    }
    // Un court délai avant d'accepter la fermeture : on ne zappe pas le carton par accident.
    setTimeout(() => {
      card.addEventListener('pointerdown', close);
      addEventListener('keydown', onKey, true);
    }, 450);
  });
}
