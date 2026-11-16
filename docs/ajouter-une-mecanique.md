# Ajouter une mécanique

Une nouvelle façon de tirer, une spéciale, une réaction d'unité, une attaque de boss : c'est du code, à un seul endroit — le registre [`src/sim/behaviors.js`](../src/sim/behaviors.js).

## Le principe

Un comportement, c'est une entrée du registre avec :

- `doc` : une phrase, en français ;
- `params` : ses réglages chiffrés, chacun avec `[minimum, maximum, défaut]` ;
- `texts` et `lists` : ses réglages en texte, et en listes séparées par une barre verticale ;
- une fonction qui agit sur la partie.

Les réglages déclarés deviennent aussitôt des clés de fiche, bornes comprises. Rien à déclarer ailleurs.

| Registre | Clés de fiche | Fonction |
|---|---|---|
| `WEAPONS` | `arme.type`, `arme.<réglage>` | `fire(game, tireur, réglages, camp, cible)`, ou `update(game, tireur, réglages, dt, actif)` pour une arme continue |
| `SPECIALS` | `speciale.type`, `speciale.<réglage>` | `use(game, héros, réglages)` → vrai si la charge est consommée |
| `ENEMY_GROUPS` | `<groupe>.<réglage>` d'une unité : `charge.vitesse`, `faisceau.largeur` | les réglages d'une réaction, lus par `src/sim/enemy.js` |
| `BOSS_ATTACKS` | `phase.N.attaques`, `<attaque>.<réglage>` | `run(game, boss, réglages)` |

- Une arme continue (le jet du canon à eau) est appelée à chaque pas : elle tient son propre état sur le tireur.
- `only: 'ennemi'` réserve une arme aux unités : les fiches de héros la refusent.
- `distance: true` sur une attaque de boss : il peut s'en servir assis.
- Un déplacement ou une réaction d'unité s'ajoute à `MOVES` ou `REACTIONS`, et se joue dans `src/sim/enemy.js`.

## Exemple : une spéciale « rafale de vent »

```js
export const SPECIALS = {
  // …
  vent: {
    doc: 'Une bourrasque pousse toutes les unités devant le héros.',
    params: { portee: [32, 320, 160], force: [50, 600, 300] },
    texts: ['son'],
    use(game, hero, s) {
      for (const e of game.enemies) {
        const dx = e.x - hero.x;
        if (e.state !== 'done' && Math.sign(dx) === hero.facing && Math.abs(dx) < s.portee) e.kick = hero.facing * s.force;
      }
      game.emit('shake', { force: 4 });
      return true;
    },
  },
};
```

Un héros peut aussitôt écrire dans sa fiche :

```text
speciale.type: vent
speciale.nom: VENT DE PANIQUE !
speciale.portee: 200
speciale.force: 400
```

## Les règles de la simulation

- Pas de navigateur : ni `document`, ni `window`, ni son, ni dessin.
- Pas de hasard ni d'horloge du système : `game.rng` et le pas fixe `DT`. Même graine, mêmes actions, même partie.
- Du bruit, une secousse, un texte : `game.sfx('nom-du-son', x)` et `game.emit('shake' | 'bubble' | 'debris' | …, données)`. Le client fait le reste.
- La manif : `game.crowd` la compte, `game.addCrowd(n)` la fait grossir, `game.disperse(part, raison, lieu)` en disperse une part, `game.loseCrowd(n, raison, lieu)` en retire `n` ; la raison (`charge`, `gaz`, `chute`, `interpelle`, `touche`) s'affiche : « − 12 dispersés ».
- Le héros touché : `game.hurtHero(n, { kind, x })`, où `kind` dit par quoi (`tir`, `gaz`, `charge`, `contact`, `explosion`) et `x` d'où : son dessin recule à l'opposé.
- Une rencontre à noter dans la Collection : `game.discover('ennemi', identifiant)`.
- Des distances fixes, jamais la taille de l'écran.
- Une tuile ne se crée jamais dans une case occupée par un personnage (`game.actorsIn`).

## Avant de proposer

```bash
npm test
```

- Un test dans `tests/sim/` : une petite partie montée avec les fiches de `tests/fixtures/content/`, quelques pas, l'effet vérifié.
- Le robot de traversée finit toujours les niveaux de la campagne.
- Une ligne dans le tableau de [ajouter-un-personnage.md](ajouter-un-personnage.md).
- Une proposition, une mécanique.

Le rendu et les écrans vivent dans `src/client/`, la validation dans `src/content/`. Le pourquoi : [DECISIONS.md](DECISIONS.md).
