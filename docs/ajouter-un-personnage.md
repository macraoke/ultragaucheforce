# Ajouter un personnage : héros, ennemi ou boss

Une fiche texte : des réglages, puis des dessins. Tant qu'il combine des comportements existants, pas une ligne de code : déposez le fichier, il est dans le jeu.

- Un héros : `content/heros/mon-heros.txt`
- Un ennemi : `content/ennemis/mon-ennemi.txt`
- Un boss : `content/boss/mon-boss.txt`

Pour voir le résultat : `npm start`, puis la Galerie (http://localhost:8080/galerie.html).

## Les dessins

Chaque section `--- nom` est une image : une lettre par pixel, les lettres étant les couleurs de [`content/palette.txt`](../content/palette.txt), et `.` le transparent. Le personnage regarde **vers la droite** ; le jeu le retourne tout seul.

| Section | Rôle |
|---|---|
| `repos` | obligatoire : le personnage immobile |
| `marche1`, `marche2` | les deux pas de la marche (sinon `repos`) |
| `saut` | en l'air (sinon `marche1`) |
| `portrait` | héros : le portrait géant du carton de déblocage ; boss : obligatoire |
| `projectile` | ce que lance son arme |
| `onde` | héros : l'onde de la spéciale `sol` |
| `fin` | ennemi : une fois en grève ou en panne |
| `ejecte` | boss : la caricature qui s'éjecte, indemne |

Un héros fait une douzaine de pixels de large pour dix-huit de haut. Les fichiers existants sont les meilleurs modèles.

## Un héros

<!-- fichier: content/heros/casseroliere.txt -->
```text
# Née d'un arrêté préfectoral de 2023 qui interdisait les « dispositifs sonores portatifs ».
nom: La Casserolière
traitement: archétype — une manifestante armée d'une casserole
cri: ON EST LÀ !
voix: La Casserolière !
pv: 2
vitesse: 145
saut: 3.2
auteur: ton pseudo

# Arme : des coups de casserole, courts, qui traversent tout.
arme.type: tir
arme.cadence: 4
arme.vitesse: 180
arme.portee: 120
arme.degats: 1
arme.terrain: 1
arme.perce: 1
arme.taille: 12
arme.mots: BING ! | BANG ! | CLONG !
arme.son: impact

# Spéciale : le concert.
speciale.type: onde
speciale.nom: CONCERT DE CASSEROLES !
speciale.charges: 2
speciale.rayon: 90
speciale.etourdit: 3

--- repos
...TTTT...
..TTTTTT..
..ssssss..
..skssks..
..ssssss..
...ssss...
..RRRRRRhh
.RRRRRRRhh
.RRRRRRR.t
.RRRRRRR..
..RRRRR...
..nnnnn...
..nn.nn...
..nn.nn...
..nn.nn...
.kkk.kkk..
```

| Clé | Rôle | Bornes |
|---|---|---|
| `nom` | obligatoire | |
| `inspiration` | la personnalité publique caricaturée, s'il y en a une | |
| `traitement` | en une phrase : archétype, ou nature de la caricature | |
| `cri` | la phrase du carton de déblocage | |
| `voix` | ce que dit la voix off (sinon le nom) | |
| `citation` | une vraie citation de `content/citations/`, affichée sous le cri | |
| `pv` | points de vie | 1 à 5 |
| `vitesse` | pixels par seconde | 60 à 220 |
| `saut` | hauteur du saut, en cases | 1,5 à 5 |
| `largeur`, `hauteur` | la boîte de collision, en pixels | 6 à 16, 8 à 24 |
| `statut` | `jouable`, ou `test` pour l'écarter des sauvetages | |

Une vraie citation s'ajoute d'abord dans [`content/citations/`](ajouter-une-source.md).

## Un ennemi

<!-- fichier: content/ennemis/prefet-automate.txt -->
```text
nom: Le Préfet Automate
pv: 2
vitesse: 0
deplacement: fixe
reaction: tire
vue: 160
fin: panne
replique: ARRÊTÉ N° 4 242 : IL EST INTERDIT D'INTERDIRE D'INTERDIRE.
auteur: ton pseudo

arme.type: tir
arme.cadence: 0.6
arme.vitesse: 90
arme.portee: 200
arme.degats: 1
arme.terrain: 0
arme.taille: 10
arme.mots: ARRÊTÉ ! | INTERDIT ! | DISPERSION !
arme.son: mot

--- repos
..kkkkkk..
..khhhhk..
..hchhch..
..hhhhhh..
...nnnn...
..nnYYnn..
.nnnnnnnn.
.nnnnnnnn.
..nnnnnn..
..nn..nn..
..nn..nn..
.kkk..kkk.
```

| Clé | Rôle | Choix ou bornes |
|---|---|---|
| `pv` | points de vie | 1 à 20 |
| `vitesse` | pixels par seconde | 0 à 200 |
| `deplacement` | | `marche`, `vol`, `fixe` |
| `reaction` | ce qu'il fait en voyant le héros | `tire`, `fonce`, `cadre` (filme et fait monter la panique), `rien` |
| `vue` | distance de détection, en pixels | 32 à 400 |
| `bouclier` | pare les tirs de face | `oui`, `non` |
| `contact` | dégâts au toucher | 0 à 3 |
| `panique` | points de panique par seconde quand il « cadre » | 0 à 30 |
| `fin` | à zéro point de vie | `greve`, `panne` |
| `replique` | une phrase qu'il prononce ; répétez la ligne pour en mettre plusieurs | |
| `largeur`, `hauteur` | boîte de collision | 6 à 32 |

L'arme est facultative. Pour placer l'ennemi, un niveau le déclare dans sa légende : `p: prefet-automate`.

## Un boss

Le modèle : [`content/boss/arnault-armure.txt`](../content/boss/arnault-armure.txt). À zéro point de vie, la machine s'arrête et son pilote s'éjecte (dessin `ejecte`).

| Clé | Rôle | Bornes |
|---|---|---|
| `nom`, `inspiration`, `traitement` | comme un héros | |
| `pv`, `vitesse` | | 5 à 400, 0 à 200 |
| `largeur`, `hauteur` | boîte de collision | 16 à 96 |
| `replique` | une phrase qu'il lance ; répétable | |
| `citation` | une vraie citation de `content/citations/` | |
| `fortune.montant` | en milliards d'euros | |
| `fortune.fiche` | la fiche de `content/fiches/` qui source ce montant ; sans elle, pas de scène de taxation | |
| `phase.1.jusqua` | la phase dure tant que les points de vie dépassent cette fraction | 0 à 1 |
| `phase.1.rythme` | secondes entre deux attaques | 0,4 à 8 |
| `phase.1.attaques` | les attaques de la phase, séparées par une barre verticale : `salve \| charge` | |

Jusqu'à cinq phases (`phase.1` à `phase.5`). Les dessins `repos` et `portrait` sont obligatoires.

## Les comportements disponibles

Déclarés dans [`src/sim/behaviors.js`](../src/sim/behaviors.js), bornes comprises : le robot refuse ce qui dépasse.

### Arme : `arme.type: tir`

Lance un ou plusieurs projectiles devant soi.

| Réglage | Effet | Bornes | Défaut |
|---|---|---|---|
| `arme.cadence` | tirs par seconde | 0,2 à 20 | 5 |
| `arme.vitesse` | pixels par seconde | 30 à 420 | 240 |
| `arme.gravite` | 0 = tout droit ; plus = en cloche | 0 à 900 | 0 |
| `arme.elan` | impulsion vers le haut au départ | 0 à 400 | 0 |
| `arme.dispersion` | écart vertical au hasard | 0 à 80 | 0 |
| `arme.nombre` | projectiles par tir | 1 à 8 | 1 |
| `arme.portee` | pixels parcourus | 16 à 640 | 220 |
| `arme.degats` | dégâts aux adversaires | 0 à 10 | 1 |
| `arme.terrain` | dégâts au décor | 0 à 10 | 1 |
| `arme.rebonds` | nombre de rebonds | 0 à 5 | 0 |
| `arme.explosion` | rayon de l'explosion à l'impact | 0 à 64 | 0 |
| `arme.perce` | 1 = traverse les adversaires | 0 ou 1 | 0 |
| `arme.blindage` | 1 = passe les boucliers | 0 ou 1 | 0 |
| `arme.fratricide` | 1 = touche aussi son propre camp | 0 ou 1 | 0 |
| `arme.gaz` | secondes de nuage laissé à l'impact | 0 à 6 | 0 |
| `arme.taille` | côté du projectile, en pixels | 2 à 24 | 4 |
| `arme.recul` | pousse le tireur en arrière | 0 à 200 | 0 |
| `arme.image` | le dessin du projectile (une section de la fiche) | | `projectile` |
| `arme.mots` | des mots lancés à la place d'un dessin, séparés par une barre verticale : `BING ! \| BANG !` | | |
| `arme.son` | un bruitage de `content/sons/` | | `tir` |

### Spéciales des héros : `speciale.type`

Toutes acceptent aussi `speciale.nom` (le cri affiché), `speciale.charges` (0 à 9, défaut 3) et `speciale.son`.

| Type | Effet | Réglages (bornes, défaut) |
|---|---|---|
| `onde` | onde circulaire qui repousse, étourdit et fissure le décor | `rayon` (16 à 160, 72), `degats` (0 à 10, 2), `terrain` (0 à 10, 2), `recul` (0 à 400, 220), `etourdit` en secondes (0 à 6, 2) |
| `sol` | onde qui court le long du sol, des deux côtés | `vitesse` (60 à 420, 240), `portee` (32 à 480, 220), `degats` (0 à 10, 3), `terrain` (0 à 10, 3) |
| `clones` | des doubles apparaissent et tirent avec le héros | `nombre` (1 à 4, 2), `duree` en secondes (1 à 12, 6) |
| `mur` | fait pousser une colonne de tuiles devant soi | `hauteur` (1 à 5, 3), `distance` (1 à 3, 1), `tuile` (un fichier de `content/tuiles/`) |

### Attaques de boss

Les réglages s'écrivent au nom de l'attaque : `salve.nombre: 5`.

| Attaque | Effet | Réglages (bornes, défaut) |
|---|---|---|
| `salve` | rafale visant le héros | `nombre` (1 à 12, 3), `vitesse` (40 à 300, 140), `degats` (0 à 3, 1), `ecart` (0 à 1, 0,25) |
| `charge` | fonce à travers l'arène | `vitesse` (60 à 400, 200), `degats` (0 à 3, 1) |
| `invocation` | appelle des renforts | `nombre` (1 à 4, 2), `ennemi` (un fichier de `content/ennemis/`) |
| `pluie` | fait tomber des projectiles du ciel | `nombre` (1 à 12, 5), `vitesse` (40 à 300, 120), `degats` (0 à 3, 1) |

Il vous faut un comportement qui n'existe pas ? C'est une [nouvelle mécanique](ajouter-une-mecanique.md).
