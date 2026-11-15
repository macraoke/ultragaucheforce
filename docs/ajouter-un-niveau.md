# Ajouter un niveau

Un fichier texte : un en-tête, puis une carte où un caractère vaut une case.

## Le plus simple : l'Atelier

1. Dans le jeu, ouvrez **Atelier**.
2. Modifiez le modèle. Les erreurs s'affichent au fil de la frappe, ligne et colonne comprises.
3. **Tester** lance votre niveau tout de suite.
4. **Proposer sur GitHub** ouvre la page de création du fichier, déjà remplie. Niveau trop long pour un lien ? Il est copié : collez-le dans la page qui s'ouvre.

Sans l'Atelier : créez `content/niveaux/mon-niveau.txt` (voir [CONTRIBUER.md](../CONTRIBUER.md)).

## Un niveau complet

<!-- fichier: content/niveaux/la-place-du-marche.txt -->
```text
titre: La place du marché
auteur: ton pseudo
citation: macron-traverse-la-rue
fiche: droit-de-manifester
fond: ville
cortege: oui
manif: 5
panneau.1: Touche-la : elle rejoint la manif
s: soignante
b: bac
d: drone
=: banderole
--- carte
........................................
........................................
........................................
..................d.....................
........................................
.........................PPP............
........................................
..D...1..s...=.......b...K......Q...S...
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
```

Déposé dans `content/niveaux/`, il apparaît dans « Niveaux de la communauté ». La campagne, elle, suit l'ordre de [`content/campagne.txt`](../content/campagne.txt).

## L'en-tête

| Clé | Rôle |
|---|---|
| `titre` | obligatoire |
| `auteur` | votre pseudo, pour le crédit |
| `citation` | la vraie déclaration qui ouvre le niveau (un fichier de `content/citations/`) |
| `fiche` | un fait sourcé de `content/fiches/` ; répétable ; la première s'affiche à la fin du niveau |
| `accroche` | une phrase sous le titre |
| `fond` | `campagne`, `ville` ou `citadelle` |
| `cortege` | `oui` : la manif suit le héros |
| `manif` | combien de manifestants au départ (10 avec un cortège, sauf indication ; 5000 au plus) |
| `panneau.1` à `panneau.9` | le texte du panneau placé par le chiffre correspondant sur la carte |
| un signe de légende | `b: bac` place une unité, une recrue ou un décor à chaque `b` de la carte |
| `heros` | le héros de départ (sinon le premier disponible) |
| `camarades` | l'ordre des héros libérés, séparés par une barre verticale : `melenchotron \| zuc-man` (sinon au hasard) |
| `boss` | l'identifiant d'un boss de `content/boss/` ; il faut alors un `Y` sur la carte |
| `nasse.ennemi` | l'unité qui forme la nasse ; obligatoire s'il y a un `N` sur la carte |
| `nasse.nombre` | unités de chaque côté (1 à 6, défaut 3) |
| `nasse.vitesse` | vitesse à laquelle les lignes se referment, en pixels par seconde (4 à 80, défaut 18) |
| `nasse.rythme` | la nasse revient d'elle-même autour du héros, toutes les tant de secondes (0 à 600 ; 0, par défaut : seulement aux repères `N`) |
| `manchette` | une alerte de PANIQUE TV propre au niveau ; répétable |
| `intro` | le texte du carton d'ouverture, quand il n'y a pas de `citation` |
| `musique` | une piste de `content/musiques/` |

Un signe de légende est une minuscule, ou l'un de ceux-ci : `+ * @ & % $ ! ? = ~ ^ < > _ , ;`.

Le niveau devient une carte de la Collection, avec sa citation et ses fiches.

## La carte

| Symbole | Case |
|---|---|
| `.` | vide |
| `D` | départ du héros (un seul) |
| `S` | sortie : le camion-sono (au moins une ; il occupe la case du `S` et les deux à sa droite) |
| `K` | camarade en garde à vue : le libérer donne une vie, change de héros et amène 20 personnes |
| `Q` | piquet de grève : point de reprise, et 10 personnes de plus |
| `Y` | boss |
| `N` | nasse : deux lignes se referment quand le héros passe ici |
| `1` à `9` | panneau |
| un signe de légende | unité, recrue ou décor déclaré dans l'en-tête |
| une majuscule | une tuile |

Les tuiles disponibles (la liste à jour est dans l'Atelier et dans [`content/tuiles/`](../content/tuiles)) :

| | Tuile | Résistance |
|---|---|---|
| `T` | terre | 3 |
| `P` | planche | 1 |
| `F` | botte de foin | 1 |
| `R` | pierre sèche | 3 |
| `B` | brique | 3 |
| `G` | pavé | 3 |
| `V` | vitrine | 1 |
| `M` | marbre | 4 |
| `H` | haie | 2 |
| `L` | liasses de billets | 2 |
| `C` | bâche de bassine | 1 |
| `X` | tonneau : explose, et fait exploser ses voisins | 1 |
| `A` | acier | indestructible |
| `O` | socle rocheux | indestructible |

Unités : tout fichier de [`content/ennemis/`](../content/ennemis) (`crs`, `bac`, `drone`…). Recrues : tout fichier de [`content/recrues/`](../content/recrues) (`soignante`, `cheminot`, `ag`…). Décors : tout fichier de [`content/decors/`](../content/decors) (`kiosque`, `banderole`, `vache`…).

## La manif

Le but du joueur : arriver toujours plus nombreux.

- Une **recrue** rejoint quand le héros la touche ou lui tend un tract. Son gain s'affiche au-dessus d'elle : `+ 20`, `× 2`.
- Plus on est nombreux, plus les tracts font de dégâts.
- Une charge, un nuage de gaz ou une chute du héros dispersent une part de la manif.

## Les lignes

Une unité qui porte `debordement` (le barrage, le blindé, la grille) est une ligne : on ne la casse pas, on ne la saute pas, elle cède quand le héros arrive assez nombreux. Le nombre s'affiche au-dessus d'elle.

Devant une ligne qui tient, des passants rejoignent peu à peu : personne ne reste coincé. Pour que ce soit un choix et non une attente, placez avant elle de quoi la déborder, et davantage en hauteur pour qui explore.

## La nasse

Un `N` sur la carte, `nasse.ennemi` dans l'en-tête. Quand le héros passe sur le `N`, deux lignes apparaissent à neuf cases de chaque côté et se referment. La nasse est levée si le héros en sort (par les toits, par un tunnel), si une ligne cède, ou au bout de vingt secondes.

Il faut du sol plat de chaque côté du `N`, et une issue en hauteur ou en sous-sol.

## Un décor

Un fichier `content/decors/mon-decor.txt` : un dessin `image` (et `image2` pour l'animer), sans collision.

| Clé | Rôle |
|---|---|
| `nom` | obligatoire |
| `devant` | `oui` : dessiné devant les personnages |
| `ecrit` | `pancarte` : le jeu écrit sur le dessin une vraie pancarte de `content/pancartes/` (une banderole) ; `tag` : il la peint au-dessus, sans fond (un mur) |
| `ecrit.y` | hauteur du texte, en pixels depuis le haut du dessin (0 à 96, défaut 8) |

Au même endroit, c'est toujours la même pancarte. Modèles : [`banderole`](../content/decors/banderole.txt), [`tag`](../content/decors/tag.txt).

## Les règles que le robot vérifie

- Au moins 8 lignes ; au plus 400 colonnes sur 60 lignes.
- Exactement un `D`, au moins un `S`, un `Y` si et seulement si l'en-tête a un `boss`.
- Chaque chiffre a son `panneau.N`, chaque signe sa légende, un `N` son `nasse.ennemi`.
- La sortie doit être atteignable : aucun mur indestructible ne doit couper la carte en deux.
- En plus, pour la campagne : un robot joueur doit réussir à traverser le niveau.

## Conseils de construction

- **Posez le sol sur du socle** (`O`) : une rangée de terre ou de pavé, puis du socle dessous. On peut alors creuser sans tomber dans le vide ni rester coincé.
- **Tout mur se grimpe** en sautant plusieurs fois contre lui. Évitez seulement un surplomb d'acier au-dessus d'un mur à escalader.
- Pas de trou de plus de quatre cases de large.
- Le héros tire à l'horizontale : placez ce qui doit être détruit à sa hauteur, ou près d'un tonneau.
- Écartez les tonneaux de deux cases : assez près pour la réaction en chaîne, assez loin pour qu'on la voie.
- **Des recrues sur le chemin au sol** avant chaque ligne : le robot joueur ne monte pas les chercher.
- En hauteur, ce qui récompense : une assemblée générale, un camarade à libérer.
- Trois à six minutes suffisent : un sauvetage, une ligne à déborder, un passage à casser, la sortie.
- Un panneau, c'est un conseil en quelques mots.

## Les murs du fond (facultatif)

Pour qu'un bâtiment ait un intérieur, ajoutez après la carte une section `--- murs`, de la même taille : les tuiles qu'on y dessine s'affichent assombries, derrière l'action, sans collision. Les niveaux de la campagne s'en servent pour la grange, le métro ou la Citadelle.

```text
--- murs
........................................
.........................BBB............
.........................BBB............
```
(complétez avec des lignes de points jusqu'à la hauteur de la carte)
