# Pour les agents de code

Un jeu web satirique, sans dépendance. L'essentiel pour y contribuer avec un assistant.

## Commandes

```bash
npm start
```

```bash
npm run verifier
```

```bash
npm test
```

```bash
npm run build
```

- `npm start` : le jeu sur http://localhost:8080, la Galerie sur `/galerie.html`. Pas de build, on recharge. Après un changement dans `src/content/` ou `tools/`, relancer le serveur.
- `npm run verifier` : valide `content/`, en français, fichier et ligne.
- `npm test` : `node --test`. Un robot traverse chaque niveau de la campagne.
- `npm run build` : la version à héberger, dans `dist/`.
- `?debug` dans l'adresse du jeu : `window.__ugf` (pas à pas, état de la partie).

Node 22. Aucune dépendance, aucune étape de build pour jouer.

## Où est quoi

| Dossier | Contenu | Règle |
|---|---|---|
| `content/` | héros, recrues, ennemis, boss, niveaux, tuiles, décors, drapeaux, citations, fiches, sons, pancartes, manchettes | des fiches texte ; ni code, ni JSON |
| `src/sim/` | la simulation | pure : ni DOM, ni `Math.random`, ni `Date` ; hasard par `game.rng` |
| `src/content/` | lecture et validation du contenu | partagé par le jeu, l'Atelier, les outils, la CI |
| `src/client/` | rendu, entrées, sons, écrans | lit la simulation, ne la modifie pas |
| `tools/` | serveur local, vérification, build | Node seul |
| `tests/` | `tests/sim/` et ses fiches d'essai dans `tests/fixtures/content/` | |
| `docs/` | un guide par type de contribution | à tenir à jour avec le code |

- Un contenu se change dans `content/`. Un personnage qui combine des comportements existants ne touche pas à `src/`.
- Chaque fiche devient une carte de la Collection (`src/client/collection.js`) : `citation`, `fiche` et `origine` font son texte.
- Une mécanique se change dans `src/sim/behaviors.js` : réglages déclarés et bornés, un test, sa ligne dans `docs/ajouter-un-personnage.md`.
- Identifiants en anglais ; commentaires, contenu et docs en français.
- Le format : `CONTRIBUTING.md`. Les clés de chaque fiche : `docs/`. En cas de doute, `src/content/rules.js` fait foi.
- Ce qui entre ou non dans le jeu : `CHARTE.md`.

## N'inventez jamais une source

- Une entrée de `content/citations/`, `content/fiches/`, `content/pancartes/` ou `content/manchettes/` n'existe que si la page source a été ouverte **pendant cette session** et que les mots ou le nombre y figurent.
- Ni citation de mémoire, ni adresse devinée, ni date approximative. Page inaccessible : pas d'entrée, et on le dit.
- `verifie` est la date réelle de la relecture.
- Ce que dit un personnage (`cri`, `replique`, `sommation`, `slogan`, `arme.mots`) reprend des mots réels : une citation, un slogan, un texte officiel déjà dans `content/`.

## Avant de proposer

`npm run verifier` et `npm test` passent. Changement visible : une capture du vrai jeu. Dire ce qui a été vérifié, et ce qui ne l'a pas été.
