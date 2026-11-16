# Contribuer

Ici, on ajoute une pancarte comme on ajoute un niveau : sans code, sans rien installer.

> [!TIP]
> Le plus court chemin : [une pancarte vue en manif](docs/ajouter-une-blague.md), une ligne de texte. Ou un niveau, dessiné dans l'Atelier du jeu.

| Je veux… | Où | Guide |
|---|---|---|
| lancer une idée | [une issue](https://github.com/macraoke/ultragaucheforce/issues/new/choose) | |
| une pancarte vue en manif, un slogan scandé | `content/pancartes/` | [pancarte ou bandeau](docs/ajouter-une-blague.md) |
| un bandeau vu sur une chaîne d'info | `content/manchettes/` | [pancarte ou bandeau](docs/ajouter-une-blague.md) |
| un niveau | l'Atelier du jeu : on le dessine, on l'essaie, on le propose | [niveau](docs/ajouter-un-niveau.md) |
| un héros, une recrue, une unité d'en face, un boss | `content/heros/`, `content/recrues/`, `content/ennemis/`, `content/boss/` | [personnage](docs/ajouter-un-personnage.md) |
| un décor | `content/decors/` | [niveau](docs/ajouter-un-niveau.md#un-décor) |
| un drapeau | `content/drapeaux/` | [drapeau](docs/ajouter-un-drapeau.md) |
| un bruitage, une musique, une voix | `content/sons/`, `content/musiques/`, `content/voix/` | [son](docs/ajouter-un-son.md) |
| une vraie citation, un chiffre | `content/citations/`, `content/fiches/` | [source](docs/ajouter-une-source.md) |
| une nouvelle mécanique | `src/sim/behaviors.js` | [mécanique](docs/ajouter-une-mecanique.md) |

## Le format : la fiche texte

```text
# une ligne qui commence par # est un commentaire
nom: La Casserolière
pv: 2
arme.cadence: 4

--- repos
...TTTT...
..TTTTTT..
```

- Des lignes `clé: valeur`. Ni guillemets, ni virgules.
- Pour les dessins et les cartes, des sections `--- nom` : une grille, un caractère par pixel ou par case. Les lettres sont les couleurs de [`content/palette.txt`](content/palette.txt), le point est transparent.
- Le nom du fichier est l'identifiant : `content/heros/zucman.txt` est le héros `zucman`. Minuscules, chiffres, tirets. Il ne change plus ensuite : la sauvegarde des joueurs s'en sert. Le nom affiché (`nom`), lui, peut changer.

Déposer un fichier suffit : aucune liste à tenir à jour.

## La Collection

Tout ce qu'on dépose se débloque quand le joueur le croise dans le jeu, et se retrouve dans la Collection. Neuf rayons : Camarades, Pancartes, En face, Lieux, Paroles, Vu à la télé, Faits, Propositions, Luttes.

Sur la carte d'un personnage ou d'un lieu, trois clés font le texte :

| Clé | Sur la carte |
|---|---|
| `citation` | une vraie citation de `content/citations/`, signée, datée, avec le lien |
| `fiche` | un fait sourcé de `content/fiches/` ; répétable |
| `origine` | une phrase, s'il reste quelque chose à dire |

Une pancarte, un slogan ou un bandeau porte sa source sur sa ligne : `TEXTE | où et quand — lien`. Sa rareté (commune, rare, épique, légendaire) se choisit à la main, sur la créativité, l'originalité et le comique : `| rareté: épique` au bout de la ligne. Sans ce champ, la ligne est commune. Vous pouvez en proposer une ; la relecture la garde ou la change ([le détail](docs/ajouter-une-blague.md#la-rareté)).

## Proposer depuis GitHub

1. Sur [le dépôt](https://github.com/macraoke/ultragaucheforce), ouvrez le dossier voulu.
2. **Add file → Create new file** : un nom, le contenu.
3. **Commit changes… → Propose changes**. GitHub copie le dépôt chez vous et ouvre la proposition tout seul ([détail](https://docs.github.com/fr/repositories/working-with-files/managing-files/creating-new-files)).

Créez votre propre fichier plutôt que de modifier celui d'un autre : deux propositions ne se marchent jamais dessus.

## Ensuite

- Un robot relit : format, références, sources, tests, build. Ce qui cloche est écrit en français, sur la ligne fautive.
- Première contribution ? GitHub attend qu'un mainteneur lâche le robot. Patience.
- Un mainteneur relit à son tour : drôle ? jouable ? vrai et sourcé ? dans [la charte](CHARTE.md) ?

## Tester chez soi

```bash
npm start
```

Le jeu est sur http://localhost:8080, la Galerie sur http://localhost:8080/galerie.html. Modifiez un fichier de `content/`, rechargez : c'est à jour.

```bash
npm run verifier
```

```bash
npm test
```

`npm run verifier` donne les messages du robot. `npm test` fait aussi traverser chaque niveau de la campagne par un robot joueur. Ajoutez `?debug` à l'adresse du jeu pour le piloter pas à pas (`window.__ugf`).

## Licence

Ce que vous apportez passe sous [CC BY-SA 4.0](content/LICENCE.md) (contenus) et [MIT](LICENSE) (code). N'apportez que ce qui est à vous ou déjà libre, et dites d'où ça vient.
