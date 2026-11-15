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
accroche: Un automate, un drone, une cellule, un camion-sono.
intro: UN MARCHÉ AURAIT LIEU SUR LA PLACE DU MARCHÉ
fond: ville
manchette: LES TOMATES SERAIENT « ANORMALEMENT ROUGES »
panneau.1: Libère ton camarade, puis file vers le camion-sono.
b: bouclier
d: drone
--- carte
........................................
........................................
........................................
..................d.....................
........................................
.........................PPP............
........................................
..D...1......b...........K......Q...S...
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
```

Déposé dans `content/niveaux/`, il apparaît dans « Niveaux de la communauté ». La campagne, elle, suit l'ordre de [`content/campagne.txt`](../content/campagne.txt).

## L'en-tête

| Clé | Rôle |
|---|---|
| `titre` | obligatoire |
| `auteur` | votre pseudo, pour le crédit |
| `accroche` | la phrase sous le titre |
| `intro` | la manchette du carton d'ouverture (parodie de PANIQUE TV) |
| `fond` | `campagne`, `ville` ou `citadelle` |
| `manchette` | une manchette propre au niveau ; répétez la ligne pour en mettre plusieurs |
| `panneau.1` à `panneau.9` | le texte du panneau placé par le chiffre correspondant sur la carte |
| une lettre minuscule | la légende : `b: bouclier` place un ennemi ou un décor à chaque `b` de la carte |
| `heros` | le héros de départ (sinon le premier disponible) |
| `camarades` | l'ordre des héros libérés, séparés par une barre verticale : `melenchotron \| zuc-man` (sinon au hasard) |
| `boss` | l'identifiant d'un boss de `content/boss/` ; il faut alors un `Y` sur la carte |
| `cortege` | `oui` : des manifestants suivent le héros |
| `fiche` | la fiche sourcée affichée à la fin (un fichier de `content/fiches/`) |
| `musique` | une piste de `content/musiques/` |

## La carte

| Symbole | Case |
|---|---|
| `.` | vide |
| `D` | départ du héros (un seul) |
| `S` | sortie : le camion-sono (au moins une ; il occupe la case du `S` et les deux à sa droite) |
| `K` | camarade en garde à vue : le libérer donne une vie et change de héros |
| `Q` | piquet de grève : point de reprise |
| `Y` | boss |
| `1` à `9` | panneau |
| `a` à `z` | ennemi ou décor déclaré dans l'en-tête |
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
| `X` | tonneau : explose, et fait exploser ses voisins | 1 |
| `A` | acier | indestructible |
| `O` | socle rocheux | indestructible |

Ennemis : `bouclier`, `editorialiste`, `drone`, `faux-jeune`. Décors : `vache`, et tout fichier de [`content/decors/`](../content/decors).

## Les règles que le robot vérifie

- Au moins 8 lignes ; au plus 400 colonnes sur 60 lignes.
- Exactement un `D`, au moins un `S`, un `Y` si et seulement si l'en-tête a un `boss`.
- Chaque chiffre a son `panneau.N`, chaque minuscule sa légende.
- La sortie doit être atteignable : aucun mur indestructible ne doit couper la carte en deux.
- En plus, pour la campagne : un robot joueur doit réussir à traverser le niveau.

## Conseils de construction

- **Posez le sol sur du socle** (`O`) : une rangée de terre ou de pavé, puis du socle dessous. On peut alors creuser sans tomber dans le vide ni rester coincé.
- **Tout mur se grimpe** en sautant plusieurs fois contre lui. Évitez seulement un surplomb d'acier au-dessus d'un mur à escalader.
- Pas de trou de plus de quatre cases de large.
- Le héros tire à l'horizontale : placez ce qui doit être détruit à sa hauteur, ou près d'un tonneau.
- Écartez les tonneaux de deux cases : assez près pour la réaction en chaîne, assez loin pour qu'on la voie.
- Trois à six minutes suffisent : un gag, un sauvetage, un passage à casser, la sortie.
- Un panneau, c'est un conseil ou une blague. Pas un roman.
