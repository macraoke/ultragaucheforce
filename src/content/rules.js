// Règles du contenu : transforme les fichiers de `content/` en un seul objet prêt à jouer,
// et explique en français tout ce qui cloche (fichier, ligne, colonne).
//
// Utilisé tel quel par le jeu, l'Atelier, `npm start`, `npm run verifier`, les tests et la CI :
// un contributeur voit donc dans son navigateur les mêmes messages que la CI.

import { Fiche, parseLines } from './parse.js';
import { WEAPONS, SPECIALS, MOVES, REACTIONS, ENDINGS, ENEMY_GROUPS, BOSS_ATTACKS } from '../sim/behaviors.js';

export const TILE = 16;

/** Lettres réservées dans une carte de niveau. */
export const MARKERS = {
  D: 'départ du héros',
  S: 'sortie (camion-sono)',
  K: 'camarade en garde à vue',
  Q: 'piquet de grève (point de reprise)',
  Y: 'boss (un ultra-riche tiré au hasard, sauf si l’en-tête en impose un)',
  N: 'nasse (les lignes se referment quand le héros passe ici)',
};

/** Les raretés d'une pancarte ou d'un bandeau, de la plus courante à la plus rare. Leurs noms sont à part, pour la Collection. */
export { RARITIES } from './rarities.js';
const RARITY_STEPS = [55, 83, 96]; // sur cent lignes : 55 communes, 28 rares, 13 épiques, 4 légendaires

/** La rareté d'une ligne se tire de son texte : personne ne la règle, et elle est la même pour tout le monde. */
export function rarityOf(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  const roll = ((h ^ (h >>> 13)) >>> 0) % 100;
  return RARITY_STEPS.filter((step) => roll >= step).length;
}

export const THEMES = ['richesses', 'droits', 'ordre', 'democratie', 'programme', 'luttes'];
export const NATURES = ['officielle', 'presse', 'associative', 'militante', 'createur'];
export const BACKDROPS = ['campagne', 'ville', 'citadelle'];
export const CAMPS = ['ordre', 'medias', 'pouvoir']; // à qui appartient une unité : seules celles de l'ordre comptent dans le bilan des blessés

// ---------------------------------------------------------------- lecteurs typés

const str = (def = '') => ({ t: 'str', def });
const req = () => ({ t: 'str', req: true });
const num = (min, max, def) => ({ t: 'num', min, max, def });
const pick = (vals, def = vals[0]) => ({ t: 'pick', vals, def });
const bool = (def = false) => ({ t: 'bool', def });
const list = () => ({ t: 'list' });
const url = (required = false) => ({ t: 'url', req: required });
const day = (required = false) => ({ t: 'day', req: required });
const CREDITS = { auteur: str('anonyme'), licence: str('CC-BY-SA-4.0') };

/** Appartenance stricte : `'constructor' in {}` est vrai, `has({}, 'constructor')` ne l'est pas. */
const has = (obj, key) => Object.hasOwn(obj, key);

const splitList = (raw) => (raw ? raw.split('|').map((s) => s.trim()).filter(Boolean) : []);

function setPath(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  let at = obj;
  for (const p of parts) at = at[p] ??= {};
  at[last] = value;
}

function readValue(f, key, s, report) {
  if (s.t === 'list') return f.all(key);
  const raw = f.get(key);
  if (raw === undefined || raw === '') {
    if (s.req) report(f.has(key) ? f.lineOf(key) : 1, `Il manque « ${key}: … ».`);
    return s.def ?? '';
  }
  const line = f.lineOf(key);
  switch (s.t) {
    case 'num': {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n)) {
        report(line, `« ${key} » doit être un nombre (reçu : « ${raw} »).`);
        return s.def;
      }
      if (n < s.min || n > s.max) {
        report(line, `« ${key} » doit être entre ${s.min} et ${s.max} (reçu : ${n}).`);
        return s.def;
      }
      return n;
    }
    case 'pick':
      if (!s.vals.includes(raw)) {
        report(line, `« ${key}: ${raw} » n'existe pas. Choix possibles : ${s.vals.join(', ')}.`);
        return s.def;
      }
      return raw;
    case 'bool':
      if (raw !== 'oui' && raw !== 'non') {
        report(line, `« ${key} » se répond par oui ou par non.`);
        return s.def;
      }
      return raw === 'oui';
    case 'url':
      if (!/^https:\/\/\S+$/.test(raw)) {
        report(line, `« ${key} » doit être une adresse complète qui commence par https://`);
        return '';
      }
      return raw;
    case 'day':
      if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(raw)) {
        report(line, `« ${key} » doit être une date AAAA, AAAA-MM ou AAAA-MM-JJ (reçu : « ${raw} »).`);
        return '';
      }
      return raw;
    default:
      return raw;
  }
}

/** Des clés qui ont changé de nom : le message dit laquelle écrire à la place. */
const RENAMED = { debordement: '« ligne.vie: … » : une ligne a maintenant une vie (voir docs/ajouter-un-personnage.md)' };

function readFields(f, spec, report, extra = () => false) {
  const out = {};
  for (const [key, s] of Object.entries(spec)) setPath(out, key, readValue(f, key, s, report));
  for (const { key, line } of f.fields) {
    if (key in spec || extra(key)) continue;
    if (RENAMED[key]) report(line, `Clé inconnue « ${key} ». Écris plutôt ${RENAMED[key]}.`);
    else report(line, `Clé inconnue « ${key} ». Clés possibles : ${Object.keys(spec).join(', ')}.`);
  }
  return out;
}

/** Lit les réglages `prefixe.xxx` déclarés par un comportement et refuse les autres. */
function readParams(f, prefix, decl, report, extra = {}) {
  const out = {};
  const params = { ...decl.params, ...extra.params };
  const texts = [...(decl.texts || []), ...(extra.texts || [])];
  for (const [k, [min, max, def]] of Object.entries(params)) {
    out[k] = readValue(f, `${prefix}.${k}`, num(min, max, def), report);
  }
  for (const k of texts) out[k] = f.get(`${prefix}.${k}`) ?? '';
  for (const k of decl.lists || []) out[k] = splitList(f.get(`${prefix}.${k}`));
  const known = new Set(['type', ...Object.keys(params), ...texts, ...(decl.lists || [])]);
  for (const { key, line } of f.fields) {
    if (key.startsWith(`${prefix}.`) && !known.has(key.slice(prefix.length + 1))) {
      report(line, `Réglage inconnu « ${key} ». Réglages possibles : ${[...known].join(', ')}.`);
    }
  }
  return out;
}

function readBehavior(f, prefix, registry, report, { optional = false, ...extra } = {}) {
  const key = `${prefix}.type`;
  const type = f.get(key);
  const names = Object.keys(registry).join(', ');
  if (!type) {
    if (!optional) report(1, `Il manque « ${key}: … » (choix : ${names}).`);
    return null;
  }
  if (!has(registry, type)) {
    report(f.lineOf(key), `« ${key}: ${type} » n'existe pas. Choix possibles : ${names}.`);
    return null;
  }
  return { type, ...readParams(f, prefix, registry[type], report, extra) };
}

/** Lit tous les dessins (sections) d'une fiche : lettres de la palette, « . » = transparent. */
function readSprites(f, palette, report, { required = [], size = null, max = 96 } = {}) {
  const sprites = {};
  for (const name of required) {
    if (!f.sections[name]?.rows.length) report(1, `Il manque le dessin « --- ${name} ».`);
  }
  for (const [name, s] of Object.entries(f.sections)) {
    if (!s.rows.length) continue;
    const w = Math.max(...s.rows.map((r) => r.length));
    const rows = s.rows.map((r) => r.replaceAll(' ', '.').padEnd(w, '.'));
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '.' && !has(palette, row[x])) {
          report(s.line + y, `Couleur inconnue « ${row[x]} » : elle n'est pas dans content/palette.txt.`, x + 1);
        }
      }
    });
    if (size && (w !== size || rows.length !== size)) {
      report(s.line, `Le dessin « ${name} » doit faire ${size} × ${size} (ici ${w} × ${rows.length}).`);
    }
    if (w > max || rows.length > max) report(s.line, `Le dessin « ${name} » dépasse ${max} × ${max}.`);
    sprites[name] = rows;
  }
  return sprites;
}

const noSections = (f, report) => {
  for (const [name, s] of Object.entries(f.sections)) report(s.line - 1, `Section inattendue « --- ${name} ».`);
};

// ---------------------------------------------------------------- une fiche par type

const under = (...prefixes) => (key) => prefixes.some((p) => key.startsWith(`${p}.`));

/** La fiche de collection : d'où vient le personnage (texte libre) et la fiche de faits qui l'explique. */
const CARD = { origine: str(), fiche: list() }; // « fiche » se répète : une carte peut s'appuyer sur plusieurs faits

/** Les armes réservées aux ennemis (le jet du canon à eau) ne se proposent pas aux héros. */
const HERO_WEAPONS = Object.fromEntries(Object.entries(WEAPONS).filter(([, w]) => w.only !== 'ennemi'));

function buildHero(f, ctx, report) {
  const spec = {
    nom: req(), inspiration: str(), traitement: str(), cri: str(), citation: str(),
    pv: num(1, 5, 2), vitesse: num(60, 220, 140), saut: num(1.5, 5, 3.2),
    largeur: num(6, 16, 10), hauteur: num(8, 24, 14), statut: pick(['jouable', 'test']), ...CARD, ...CREDITS,
  };
  const out = readFields(f, spec, report, under('arme', 'speciale'));
  out.arme = readBehavior(f, 'arme', HERO_WEAPONS, report);
  out.speciale = readBehavior(f, 'speciale', SPECIALS, report, {
    optional: true, params: { charges: [0, 9, 3] }, texts: ['nom'],
  });
  out.sprites = readSprites(f, ctx.palette, report, { required: ['repos'] });
  return out;
}

function buildEnemy(f, ctx, report) {
  const spec = {
    nom: req(), pv: num(1, 20, 2), vitesse: num(0, 200, 40), deplacement: pick(MOVES), reaction: pick(REACTIONS),
    vue: num(32, 400, 150), bouclier: bool(), contact: num(0, 3, 0), panique: num(0, 30, 0), fin: pick(ENDINGS), camp: pick(CAMPS),
    replique: list(), largeur: num(6, 32, 12), hauteur: num(6, 32, 16),
    sommation: list(), citation: str(),
    // `interpelle` : combien de manifestants l'unité emmène quand elle atteint le cortège (une fois toutes les 2,5 s).
    interpelle: num(0, 20, 0),
    // `ecriteau` : ce qu'on lit au-dessus de l'unité une fois hors service (rien si la clé est absente).
    ecriteau: str(), ...CARD, ...CREDITS,
  };
  const groups = Object.keys(ENEMY_GROUPS);
  const out = readFields(f, spec, report, under('arme', ...groups));
  out.arme = readBehavior(f, 'arme', WEAPONS, report, { optional: true });
  for (const group of groups) out[group] = readParams(f, group, ENEMY_GROUPS[group], report);
  out.sprites = readSprites(f, ctx.palette, report, { required: ['repos'] });
  return out;
}

/** Une recrue : quelqu'un (ou une assemblée) qui rejoint la manif quand le héros passe ou lui tend un tract. */
function buildRecruit(f, ctx, report) {
  // `soin` : combien de coups la recrue rend au personnage en jeu quand elle rejoint la manif (une street medic).
  const spec = { nom: req(), apport: num(1, 500, 0), multiplie: num(1.5, 5, 0), soin: num(0, 3, 0), slogan: list(), ...CARD, ...CREDITS };
  const out = readFields(f, spec, report);
  if (f.has('apport') === f.has('multiplie')) {
    report(1, 'Une recrue a besoin de « apport: … » (des gens qui rejoignent) OU de « multiplie: … » (la manif est multipliée), pas les deux.');
  }
  out.sprites = readSprites(f, ctx.palette, report, { required: ['image'], max: 48 });
  out.largeur = out.sprites.image?.[0]?.length || TILE;
  out.hauteur = out.sprites.image?.length || TILE;
  return out;
}

function buildBoss(f, ctx, report) {
  const attacks = Object.keys(BOSS_ATTACKS);
  const spec = {
    nom: req(), inspiration: str(), traitement: str(), pv: num(5, 400, 60), largeur: num(16, 96, 40),
    hauteur: num(16, 96, 48), vitesse: num(0, 200, 40), citation: str(), replique: list(),
    'fortune.montant': num(0, 1000, 0), 'fortune.fiche': str(),
    // `fortune.rente` : les fiches dont les `valeur`, multipliées, donnent ce que la fortune rapporte en un an, en euros
    // (un dividende par action, un nombre d'actions). Chaque nombre garde ainsi sa propre source.
    'fortune.rente': list(),
    // `assis` : il reste sur son tas, sans bouger ni charger, tant que sa vie n'est pas passée sous `leve`.
    assis: bool(), leve: num(0, 1, 0.7), ...CARD, ...CREDITS,
  };
  const out = readFields(f, spec, report, under('phase', ...attacks));
  out.phases = [];
  out.attaques = {};
  for (let n = 1; n <= 5; n++) {
    const p = `phase.${n}`;
    if (!f.has(`${p}.attaques`)) continue;
    const names = splitList(f.get(`${p}.attaques`));
    for (const name of names) {
      if (!has(BOSS_ATTACKS, name)) {
        report(f.lineOf(`${p}.attaques`), `Attaque inconnue « ${name} ». Choix possibles : ${attacks.join(', ')}.`);
      } else {
        out.attaques[name] ??= readParams(f, name, BOSS_ATTACKS[name], report);
      }
    }
    out.phases.push({
      jusqua: readValue(f, `${p}.jusqua`, num(0, 1, 0), report),
      rythme: readValue(f, `${p}.rythme`, num(0.4, 8, 2), report),
      attaques: names.filter((name) => has(BOSS_ATTACKS, name)),
    });
  }
  if (!out.phases.length) report(1, 'Un boss a besoin d’au moins une phase : « phase.1.attaques: salve | charge ».');
  out.sprites = readSprites(f, ctx.palette, report, { required: ['repos', 'portrait'] });
  return out;
}

function buildTile(f, ctx, report) {
  const spec = { nom: req(), symbole: req(), pv: num(0, 20, 1), solide: bool(true), explose: num(0, 80, 0), ...CREDITS };
  const out = readFields(f, spec, report);
  if (out.symbole && (!/^[A-Z]$/.test(out.symbole) || has(MARKERS, out.symbole))) {
    report(f.lineOf('symbole'), `« symbole » doit être une lettre majuscule libre (réservées : ${Object.keys(MARKERS).join(', ')}).`);
  }
  out.sprites = readSprites(f, ctx.palette, report, { required: ['image'], size: TILE });
  return out;
}

function buildDecor(f, ctx, report) {
  // `ecrit` : le jeu écrit dessus une vraie pancarte de `content/pancartes/`, choisie selon l'emplacement.
  // « pancarte » : texte sombre sur le dessin (banderole) ; « tag » : texte peint, sans fond (mur).
  // `brule` : quand la panique de la chaîne franchit un palier, ce décor peut prendre feu, et une équipe télé vient le filmer.
  const spec = { nom: req(), devant: bool(), ecrit: pick(['', 'pancarte', 'tag']), 'ecrit.y': num(0, 96, 8), ...CREDITS };
  const out = readFields(f, { nom: req(), devant: bool(), brule: bool(), ...CREDITS }, report, (key) => key === 'ecrit' || key === 'ecrit.y');
  out.ecrit = readValue(f, 'ecrit', spec.ecrit, report);
  out.ecritY = readValue(f, 'ecrit.y', spec['ecrit.y'], report);
  out.sprites = readSprites(f, ctx.palette, report, { required: ['image'] });
  return out;
}

function readResources(f, report, max = 3) {
  const out = [];
  for (let n = 1; n <= max; n++) {
    const p = `ressource.${n}`;
    if (!f.has(`${p}.url`) && !f.has(`${p}.titre`)) continue;
    out.push({
      titre: readValue(f, `${p}.titre`, req(), report),
      url: readValue(f, `${p}.url`, url(true), report),
      nature: readValue(f, `${p}.nature`, pick(NATURES, 'associative'), report),
    });
  }
  return out;
}

function buildFlag(f, ctx, report) {
  const out = readFields(f, { nom: req(), description: str(), ...CREDITS }, report, under('ressource'));
  out.ressources = readResources(f, report);
  out.sprites = readSprites(f, ctx.palette, report, { required: ['image'], max: 32 });
  return out;
}

const SOURCE = { 'source.titre': req(), 'source.url': url(true), 'source.nature': pick(NATURES, 'presse'), verifie: day(true) };

function buildCitation(f, ctx, report) {
  const spec = {
    texte: req(), auteur: req(), fonction: str(), date: day(true), contexte: str(), note: str(), mot: str(),
    categorie: pick(['diabolisation', 'puissants', 'gauche']), ...SOURCE,
  };
  noSections(f, report);
  return readFields(f, spec, report);
}

function buildFact(f, ctx, report) {
  // `valeur` : le nombre brut, quand une scène du jeu calcule avec (exemple : le Smic net mensuel).
  // Le dictionnaire de la scène de taxe : une fiche qui porte `compare` sert d'échelle à une fortune (« N ans de revenus
  // d'un chirurgien » ; `valeur` = son revenu, `par` an ou mois) ; une fiche qui porte `finance` dit ce que la taxe
  // paierait (« N enseignants » ; `valeur` = le coût d'un seul, par an, ou une fois pour toutes si `ponctuel`) ;
  // une fiche marquée `choc` est un fait frappant sur les inégalités, que la scène affiche à son tour.
  const spec = {
    titre: req(), theme: pick(THEMES), texte: req(), portee: str(), periode: str(), valeur: num(0, 1e15, 0),
    compare: str(), finance: str(), par: pick(['an', 'mois']), ponctuel: bool(), choc: bool(), ...SOURCE,
  };
  noSections(f, report);
  const out = readFields(f, spec, report);
  if ((out.compare || out.finance) && !(out.valeur > 0)) {
    report(f.lineOf(out.compare ? 'compare' : 'finance'), 'Une comparaison a besoin de « valeur: … » : le revenu, ou le coût d’une unité, en euros.');
  }
  return out;
}

function buildSound(f, ctx, report) {
  const spec = { nom: str(), zzfx: str(), fichier: str(), volume: num(0, 1, 1), auteur: str(), licence: str('CC0-1.0'), source: url() };
  const out = readFields(f, spec, report);
  noSections(f, report);
  if (!out.zzfx === !out.fichier) report(1, 'Un bruitage a besoin de « zzfx: … » (son synthétisé) OU de « fichier: … » (enregistrement), pas les deux.');
  if (out.zzfx) {
    out.zzfx = out.zzfx.split(',').map((v) => (v.trim() === '' ? null : Number(v)));
    if (out.zzfx.some((v) => v !== null && !Number.isFinite(v))) report(f.lineOf('zzfx'), '« zzfx » doit être une liste de nombres séparés par des virgules.');
  }
  if (out.fichier && !ctx.assets.has(`content/sons/${out.fichier}`)) {
    report(f.lineOf('fichier'), `Le fichier « content/sons/${out.fichier} » est introuvable.`);
  }
  return out;
}

function buildMusic(f, ctx, report) {
  // `puis` : la piste qui suit celle-ci quand elle finit (un extrait, puis la version entière).
  const out = readFields(f, { titre: req(), artiste: req(), url: url(true), ou: str('partout'), puis: str(), ...CREDITS }, report);
  noSections(f, report);
  if (out.url && !out.url.startsWith('https://soundcloud.com/')) {
    report(f.lineOf('url'), '« url » doit être une piste SoundCloud (https://soundcloud.com/…).');
  }
  return out;
}

/** Les signes qu'une légende de niveau peut prendre : les minuscules, et quelques signes pour les niveaux très peuplés. */
export const LEGEND = /^[a-z+*@&%$!?=~^<>_,;]$/;

/** Un niveau : en-tête, légende (un signe = un ennemi, une recrue ou un décor), panneaux numérotés, puis la carte. */
export function buildLevel(f, ctx, report) {
  const spec = {
    titre: req(), accroche: str(), intro: str(), manchette: list(), fond: pick(BACKDROPS), boss: str(),
    heros: str(), camarades: str(), cortege: bool(), musique: str(),
    // `citation` : la vraie phrase qui ouvre le niveau ; `fiche` (répétable) : la première sert à l'écran de fin.
    citation: str(), fiche: list(),
    manif: num(0, 5000, 0), 'nasse.ennemi': str(), 'nasse.nombre': num(1, 6, 3), 'nasse.vitesse': num(4, 80, 18),
    'nasse.rythme': num(0, 600, 0), // secondes entre deux nasses qui reviennent d'elles-mêmes (0 : seulement aux repères « N »)
    ...CREDITS,
  };
  const isLegend = (k) => LEGEND.test(k);
  const isSign = (k) => /^panneau\.[1-9]$/.test(k);
  const out = readFields(f, spec, report, (k) => isLegend(k) || isSign(k));
  out.legende = {};
  out.panneaux = {};
  for (const { key, value, line } of f.fields) {
    if (isSign(key)) out.panneaux[key.at(-1)] = value;
    if (!isLegend(key)) continue;
    const type = has(ctx.ennemis, value) ? 'ennemi' : has(ctx.recrues || {}, value) ? 'recrue' : has(ctx.decors, value) ? 'decor' : null;
    if (type) out.legende[key] = { type, id: value };
    else report(line, `« ${key}: ${value} » : aucun ennemi ni décor ne s'appelle « ${value} » (aucune recrue non plus).`);
  }
  // La manif de départ : dix personnes quand le niveau a un cortège, sauf indication contraire.
  if (!f.has('manif')) out.manif = out.cortege ? 10 : 0;
  if (out.nasse.ennemi && !has(ctx.ennemis, out.nasse.ennemi)) {
    report(f.lineOf('nasse.ennemi'), `« nasse.ennemi: ${out.nasse.ennemi} » : cet ennemi n'existe pas dans content/ennemis/.`);
  }
  if (out.boss && !has(ctx.boss, out.boss)) report(f.lineOf('boss'), `Le boss « ${out.boss} » n'existe pas dans content/boss/.`);
  out.camarades = splitList(out.camarades);
  for (const id of [out.heros, ...out.camarades]) {
    if (id && !has(ctx.heros, id)) report(f.lineOf(id === out.heros ? 'heros' : 'camarades'), `Le héros « ${id} » n'existe pas dans content/heros/.`);
  }

  const map = f.sections.carte;
  if (!map?.rows.length) {
    report(1, 'Il manque la carte : une ligne « --- carte » suivie du dessin du niveau.');
    out.carte = [];
    return out;
  }
  const width = Math.max(...map.rows.map((r) => r.length));
  const rows = map.rows.map((r) => r.replaceAll(' ', '.').padEnd(width, '.'));
  const count = { D: 0, S: 0, Y: 0, N: 0 };
  let start = null;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.' || has(ctx.symbols, c)) continue;
      if (has(MARKERS, c)) {
        if (has(count, c)) count[c]++;
        if (c === 'D') start = { x, y };
      } else if (/[1-9]/.test(c)) {
        if (!has(out.panneaux, c)) report(map.line + y, `Panneau « ${c} » sans texte : ajoute « panneau.${c}: … » dans l'en-tête.`, x + 1);
      } else if (LEGEND.test(c)) {
        if (!has(out.legende, c)) report(map.line + y, `Signe « ${c} » inconnu : déclare-le dans l'en-tête, par exemple « ${c}: bac ».`, x + 1);
      } else {
        report(map.line + y, `Symbole « ${c} » inconnu. Tuiles : ${Object.keys(ctx.symbols).join(' ')} ; repères : ${Object.keys(MARKERS).join(' ')} ; vide : « . ».`, x + 1);
      }
    }
  });
  if (width > 400 || rows.length > 60) report(map.line, `Carte trop grande (${width} × ${rows.length}) : maximum 400 × 60.`);
  if (rows.length < 8) report(map.line, 'Carte trop basse : il faut au moins 8 lignes.');
  if (count.D !== 1) report(map.line, `Il faut exactement un départ « D » (ici ${count.D}).`);
  if (count.S < 1) report(map.line, 'Il faut au moins une sortie « S ».');
  if (count.Y > 1) report(map.line, `Un seul boss par niveau : la carte contient ${count.Y} « Y ».`);
  if (out.boss && !count.Y) report(map.line, 'L’en-tête impose un boss : place un « Y » dans la carte, là où il attend.');
  if (count.N && !out.nasse.ennemi) report(map.line, 'La carte contient une nasse « N » : ajoute « nasse.ennemi: … » dans l’en-tête.');
  if (start && count.S && !exitReachable(rows, start, ctx.symbols)) {
    report(map.line, 'La sortie « S » est inatteignable : un mur indestructible sépare le départ de la sortie.');
  }
  out.carte = rows;

  // Section facultative « --- murs » : les murs du fond, dessinés derrière l'action, sans collision.
  const back = f.sections.murs;
  out.murs = [];
  if (back?.rows.length) {
    out.murs = back.rows.map((r) => r.replaceAll(' ', '.').padEnd(width, '.'));
    out.murs.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '.' && !has(ctx.symbols, row[x])) {
          report(back.line + y, `Symbole « ${row[x]} » inconnu dans les murs du fond : seules les tuiles y ont leur place.`, x + 1);
        }
      }
    });
    if (out.murs.length !== rows.length || out.murs[0].length !== width) {
      report(back.line, `Les murs du fond doivent avoir la taille de la carte (${width} × ${rows.length}).`);
    }
  }
  return out;
}

/** Parcours en largeur : tout sauf l'indestructible est franchissable (on peut creuser et grimper). */
function exitReachable(rows, start, symbols) {
  const h = rows.length;
  const w = rows[0].length;
  const blocked = (x, y) => {
    const t = symbols[rows[y][x]];
    return Boolean(t && t.solide && t.pv === 0);
  };
  const seen = new Uint8Array(w * h);
  const queue = [start.y * w + start.x];
  seen[queue[0]] = 1;
  while (queue.length) {
    const at = queue.pop();
    const x = at % w;
    const y = (at - x) / w;
    if (rows[y][x] === 'S') return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || blocked(nx, ny)) continue;
      seen[ny * w + nx] = 1;
      queue.push(ny * w + nx);
    }
  }
  return false;
}

// ---------------------------------------------------------------- assemblage

const FOLDERS = {
  tuiles: buildTile, decors: buildDecor, drapeaux: buildFlag, heros: buildHero, ennemis: buildEnemy, boss: buildBoss,
  recrues: buildRecruit, citations: buildCitation, fiches: buildFact, sons: buildSound, musiques: buildMusic, niveaux: buildLevel,
};
const LINE_FOLDERS = ['manchettes', 'pancartes'];

/**
 * @param {{path: string, text: string | null}[]} files  fichiers de `content/` (text = null pour un fichier binaire)
 * @returns {{bundle: object, errors: {file: string, line: number, col?: number, message: string}[]}}
 */
export function buildContent(files) {
  const errors = [];
  const reporter = (file) => (line, message, col) => errors.push({ file, line: line || 1, col, message });
  const bundle = { palette: {}, campagne: [], manchettes: [], pancartes: [], voix: {} };
  for (const dir of Object.keys(FOLDERS)) bundle[dir] = {};
  const ctx = { palette: bundle.palette, symbols: {}, assets: new Set(), ...bundle };
  const byPath = new Map(files.map((f) => [f.path, f]));

  for (const f of files) if (f.text === null) ctx.assets.add(f.path);

  const palette = byPath.get('content/palette.txt');
  if (!palette) reporter('content/palette.txt')(1, 'Fichier introuvable : la palette de couleurs est obligatoire.');
  else {
    const f = new Fiche(palette.text);
    const report = reporter(palette.path);
    f.errors.forEach((e) => report(e.line, e.message));
    for (const { key, value, line } of f.fields) {
      const color = value.split(/\s+/)[0];
      if (key.length !== 1 || key === '.') report(line, `Une couleur se nomme par un seul caractère (pas « ${key} »).`);
      else if (!/^#[0-9a-fA-F]{6}$/.test(color)) report(line, `Couleur illisible « ${value} » : écris #rrggbb.`);
      else bundle.palette[key] = color;
    }
  }

  const fiches = [];
  const lineIds = Object.fromEntries(LINE_FOLDERS.map((dir) => [dir, new Map()])); // identifiant ou texte → où il est déjà pris
  for (const file of files) {
    const m = file.path.match(/^content\/([a-z]+)\/([^/]+)\.txt$/);
    if (!m || file.text === null) continue;
    const [, dir, id] = m;
    const report = reporter(file.path);
    if (LINE_FOLDERS.includes(dir)) {
      for (const { text, line } of parseLines(file.text)) {
        // « TEXTE | où et quand — adresse », puis au besoin « | était: l'ancien texte ».
        const [texte, ...rest] = text.split('|').map((s) => s.trim());
        const at = rest.findIndex((s) => /^était\s*:/.test(s));
        const was = at < 0 ? undefined : rest.splice(at, 1)[0].replace(/^était\s*:\s*/, '');
        const credit = rest.shift() ?? '';
        if (rest.length || was === '') report(line, 'Une ligne s’écrit « TEXTE | où et quand — adresse », puis au besoin « | était: l’ancien texte ». Il y a une barre « | » de trop, ou rien après « était: ».');
        const address = credit.split(' — ')[1]; // crédit : « où et quand — adresse de la source »
        if (address !== undefined && !/^https:\/\/\S+$/.test(address)) {
          report(line, 'Après « — », il faut l’adresse de la source : elle commence par https://');
        }
        // Un texte corrigé garde son identifiant : celui de sa première écriture, noté « était: … ».
        // Le déblocage des joueurs et la rareté le suivent. Deux lignes ne partagent jamais un identifiant.
        // Ni son identifiant ni son texte : le jeu retrouve une pancarte par ce qui est écrit dessus.
        const id = was || texte;
        const twin = lineIds[dir].get(id) || lineIds[dir].get(texte);
        if (twin) report(line, `Cette ligne existe déjà (${twin.file}, ligne ${twin.line}) : même texte, ou un « était: » qui reprend celui d’une autre.`);
        else for (const name of [id, texte]) lineIds[dir].set(name, { file: file.path, line });
        bundle[dir].push({ id, texte, credit, rarete: rarityOf(id) });
      }
      continue;
    }
    if (!FOLDERS[dir]) continue;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      report(1, `Nom de fichier « ${id}.txt » : uniquement des minuscules, chiffres et tirets (exemple : mon-heros.txt).`);
      continue;
    }
    fiches.push({ dir, id, file, report });
  }

  const order = Object.keys(FOLDERS);
  fiches.sort((a, b) => order.indexOf(a.dir) - order.indexOf(b.dir) || a.id.localeCompare(b.id));
  for (const { dir, id, file, report } of fiches) {
    const f = new Fiche(file.text);
    f.errors.forEach((e) => report(e.line, e.message));
    const item = FOLDERS[dir](f, ctx, report);
    item.id = id;
    bundle[dir][id] = item;
    if (dir === 'tuiles' && item.symbole) {
      if (ctx.symbols[item.symbole]) report(f.lineOf('symbole'), `Le symbole « ${item.symbole} » est déjà pris par la tuile « ${ctx.symbols[item.symbole].id} ».`);
      else ctx.symbols[item.symbole] = item;
    }
  }

  for (const path of ctx.assets) {
    const m = path.match(/^content\/voix\/([a-z0-9-]+)\.[a-z0-9]+$/);
    if (m) bundle.voix[m[1]] = path;
  }

  const campaign = byPath.get('content/campagne.txt');
  if (campaign) {
    for (const { text, line } of parseLines(campaign.text)) {
      if (has(bundle.niveaux, text)) bundle.campagne.push(text);
      else reporter(campaign.path)(line, `Le niveau « ${text} » n'existe pas dans content/niveaux/.`);
    }
  }

  // Références croisées : une fiche ne peut citer que ce qui existe.
  const refs = (dir, target, get) => {
    for (const item of Object.values(bundle[dir])) {
      for (const id of [get(item)].flat()) {
        if (id && !has(bundle[target], id)) reporter(`content/${dir}/${item.id}.txt`)(1, `« ${id} » n'existe pas dans content/${target}/.`);
      }
    }
  };
  refs('heros', 'citations', (h) => h.citation);
  refs('boss', 'citations', (b) => b.citation);
  refs('ennemis', 'citations', (e) => e.citation);
  for (const dir of ['heros', 'ennemis', 'boss', 'recrues']) refs(dir, 'fiches', (item) => item.fiche);
  refs('ennemis', 'ennemis', (e) => e.renfort.ennemi);
  refs('boss', 'fiches', (b) => [b.fortune.fiche, ...b.fortune.rente]);
  refs('niveaux', 'fiches', (n) => n.fiche);
  refs('niveaux', 'citations', (n) => n.citation);
  refs('niveaux', 'musiques', (n) => n.musique);
  refs('musiques', 'musiques', (m) => m.puis);
  for (const b of Object.values(bundle.boss)) {
    const ally = b.attaques?.invocation?.ennemi;
    if (ally && !has(bundle.ennemis, ally)) reporter(`content/boss/${b.id}.txt`)(1, `« invocation.ennemi: ${ally} » : cet ennemi n'existe pas.`);
  }
  for (const h of Object.values(bundle.heros)) {
    const tile = h.speciale?.tuile;
    if (tile && !has(bundle.tuiles, tile)) reporter(`content/heros/${h.id}.txt`)(1, `« speciale.tuile: ${tile} » : cette tuile n'existe pas.`);
  }

  return { bundle, errors };
}

/** Valide un niveau seul (Atelier) avec les mêmes règles que la CI. */
export function checkLevel(text, bundle) {
  const errors = [];
  const symbols = Object.fromEntries(Object.values(bundle.tuiles).map((t) => [t.symbole, t]));
  const f = new Fiche(text);
  const report = (line, message, col) => errors.push({ line: line || 1, col, message });
  f.errors.forEach((e) => report(e.line, e.message));
  const level = buildLevel(f, { ...bundle, symbols }, report);
  return { level, errors };
}

export const formatError = (e) => `${e.file ? `${e.file}:` : 'ligne '}${e.line}${e.col ? `:${e.col}` : ''} — ${e.message}`;
