# Contribuer

Ici, on ajoute une blague comme on ajoute un niveau : en écrivant un fichier texte. Pas de code, rien à installer.

| Je veux… | Où | Guide |
|---|---|---|
| lancer une idée | [une issue](https://github.com/macraoke/ultragaucheforce/issues/new/choose) | |
| une manchette de PANIQUE TV | `content/manchettes/` | [blague](docs/ajouter-une-blague.md) |
| une pancarte | `content/pancartes/` | [blague](docs/ajouter-une-blague.md) |
| un niveau | l'Atelier du jeu, puis `content/niveaux/` | [niveau](docs/ajouter-un-niveau.md) |
| un héros, un ennemi, un boss | `content/heros/`, `content/ennemis/`, `content/boss/` | [personnage](docs/ajouter-un-personnage.md) |
| un drapeau | `content/drapeaux/` | [drapeau](docs/ajouter-un-drapeau.md) |
| un bruitage, une musique, une voix off | `content/sons/`, `content/musiques/`, `content/voix/` | [son](docs/ajouter-un-son.md) |
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
- Le nom du fichier est l'identifiant : `content/heros/zuc-man.txt` est le héros `zuc-man`. Minuscules, chiffres, tirets.

Déposer un fichier suffit : aucune liste à tenir à jour.

## Proposer depuis GitHub

1. Sur [le dépôt](https://github.com/macraoke/ultragaucheforce), ouvrez le dossier voulu.
2. **Add file → Create new file** : un nom, le contenu.
3. **Commit changes… → Propose changes**. GitHub copie le dépôt chez vous et ouvre la proposition tout seul ([détail](https://docs.github.com/fr/repositories/working-with-files/managing-files/creating-new-files)).

Créez votre propre fichier plutôt que de modifier celui d'un autre : deux propositions ne se marchent jamais dessus.

## Ensuite

- Un robot relit : format, références, sources, tests, build. Ce qui cloche est écrit en français, sur la ligne fautive.
- Première contribution ? GitHub attend qu'un mainteneur lâche le robot. Patience.
- Un mainteneur relit à son tour : drôle ? jouable ? sourcé ? dans [la charte](CHARTE.md) ?

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
