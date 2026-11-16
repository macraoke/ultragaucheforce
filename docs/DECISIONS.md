# Décisions techniques

Les choix qui structurent le projet, et pourquoi. Tout se rediscute : ouvrez une issue.

## Du web natif, sans moteur ni dépendance

Des modules JavaScript, un `<canvas>`, aucune étape de build pour jouer.

- **Léger** : le jeu complet pèse quelques centaines de kilo-octets. L'export web d'un moteur comme Godot se compte en méga-octets.
- **Rien à installer pour contribuer** : un niveau est un fichier texte, pas un projet à ouvrir dans un éditeur.
- **Lisible** : un jeu de plateformes sur grille tient en quelques centaines de lignes de collisions, de particules et de sons. Autant les avoir sous les yeux.
- **Durable** : rien à mettre à jour, rien qui casse quand une dépendance change.

Seul code repris : le générateur de sons de [ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT, un fichier), pour régler les bruitages dans son outil en ligne.

Le prix : pas de typage automatique, un petit moteur à entretenir. Les tests compensent.

## Un seul format de contenu : la fiche texte

Des lignes `clé: valeur`, puis des sections en grilles de caractères.

- **Pas de JSON** : une virgule oubliée est la première cause d'échec d'une contribution.
- **Les dessins sont du texte** : un sprite se relit dans une proposition, se retouche sans logiciel, ne pèse rien.
- **Un fichier par élément, aucune liste** : déposer suffit, et deux propositions ne se marchent pas dessus.
- **Les mêmes règles partout** : `src/content/rules.js` valide dans le jeu, dans l'Atelier, en local et en CI, en français, à la ligne près.

Le prix : un format maison. Il tient en moins de cent lignes (`src/content/parse.js`).

## Une simulation pure

`src/sim/` ne touche ni à l'écran, ni au son, ni à l'horloge. Pas fixe de 1/60 de seconde, hasard à graine, et des événements que `src/client/` transforme en images et en sons.

- **Testable** : la partie tourne telle quelle dans Node. Un robot traverse chaque niveau de la campagne à chaque proposition : s'il passe, on ne peut pas y rester coincé.
- **Reproductible** : même graine, mêmes actions, même partie. C'est ce qu'il faudra pour jouer à plusieurs en ligne.
- **Identique partout** : téléphone ou grand écran, seule la fenêtre change.

## Des fichiers pour les sons, SoundCloud pour la musique

- **Bruitages** : dans le dépôt, sous licence libre, joués hors-ligne. Une ligne de texte pour un son synthétisé, quelques kilo-octets pour un enregistrement.
- **Pas de voix de synthèse** : elle sonnait comme une annonce de hall de gare. Le déblocage d'un héros se fait au tambour et aux cuivres, le nom écrit en grand. `content/voix/` reste ouvert à un vrai enregistrement.
- **Musique** : le lecteur officiel de SoundCloud. Un lien suffit pour proposer un morceau, les artistes gardent la main, le dépôt reste léger.

Le prix : pas de musique hors-ligne, et un lecteur tiers avec ses traceurs. Il n'est chargé que si la musique est activée.

Le lecteur ne dit pas toujours qu'une piste se tait. Radio Manif vérifie que la lecture avance : sinon, elle passe à une autre piste. Quand le navigateur refuse de jouer sans geste du joueur, un bouton le montre et le prochain toucher relance la musique.

## Le but : une manif qui grossit

On ne gagne pas en tirant plus, mais en arrivant plus nombreux.

- **Le nombre est la ressource** : chaque recrue ajoute du monde, une assemblée générale multiplie. Plus on est nombreux, plus les tracts font de dégâts.
- **Une ligne cède au nombre**, pas aux coups : barrage, blindé, grille. Explorer pour recruter devient le cœur du niveau.
- **Jamais d'impasse** : devant une ligne qui tient, des passants rejoignent peu à peu, et d'autant plus que la manif perd du monde en attendant. Une nasse est levée au bout de vingt secondes.
- **Disperser, pas éliminer** : une charge ou du gaz dispersent une part de la manif, la BAC interpelle ; on lit combien et pourquoi (« − 12 gazés »). Une unité finit hors service, un boss s'éjecte.

## En face : des unités réelles

CRS, BAC, BRAV-M, gendarmes mobiles, canon à eau, hélicoptère, blindé, et ceux qui parlent : un ministre, un éditorialiste.

- **Une carte par unité** : une compagnie, un escadron, une fonction. Une personnalité parle avec ses propres mots.
- **Un comportement par unité**, tiré de ce qui est documenté : sommations puis charge, visée du LBD, lacrymogènes en cloche, nasse.
- **Une fiche sourcée par unité** : textes officiels, rapports parlementaires, Conseil d'État, Défenseur des droits.

## Tout texte est une référence

Ce que le jeu affiche a été dit, écrit, scandé ou diffusé : citations signées et datées, pancartes vues en manif, slogans, bandeaux de chaînes d'info, sommations du code de la sécurité intérieure. Chaque ligne porte où, quand et le lien.

- **PANIQUE TV ne parodie plus, elle cite** : le réel suffit.
- Restent écrits par nous : les noms des personnages, les panneaux d'aide, l'interface.

## La Collection

Chaque fiche de `content/` devient une carte, trouvée en la croisant dans le jeu : personnages, lieux, paroles, pancartes, bandeaux, faits, propositions, luttes.

- **Jouer, c'est découvrir** : la carte donne la citation exacte, le fait, et le lien vers la source.
- **Rien à déclarer** : `citation`, `fiche` et `origine` dans une fiche suffisent ; aucune liste de cartes à tenir.
- La sauvegarde reste locale : la liste des cartes trouvées, rien d'autre.

## La fortune, assise

Chaque niveau finit devant un ultra-riche, assis sur sa fortune : un tas de liasses qui remplit son cadre, avec sa légende juste dessous (ce que vaut une liasse). Lequel ? Le hasard le dit à chaque partie. Puis on le taxe, sur un seul écran qui se lit dans l'ordre, une idée par étape :

1. **Sa fortune, à l'échelle de quelqu'un** (« 670 000 ans de revenus d'un chirurgien ») et ce qu'elle rapporte en un an, pour répondre d'avance à « flux et stocks ».
2. Le bouton « Taxer les riches » : **2 % par an**, au plus, puisque l'impôt est différentiel. La part des 2 % quitte le tas.
3. **Ce que ça paierait** (« 64 000 enseignants »).
4. **Ce que chacun paie déjà** : autour de 52 % pour presque tout le monde, 27 % pour les milliardaires. Les deux nombres toujours ensemble.

Chaque étape porte ses sources, en petit. Le bouton suivant mène au bilan du niveau avec un slogan scandé en manif, tiré au hasard (« On lâche rien ! »).

L'échelle et l'exemple se tirent au hasard dans un dictionnaire de fiches sourcées (`compare`, `finance`). Choix proposé, à valider par Valentin : un exemple n'est pas tiré quand 2 % de la fortune en paient moins de dix (« 2 Canadair » ne dit rien) ; il reste au tirage des fortunes plus grosses. Les faits frappants sur les inégalités (`choc`) se comprennent seuls : l'un d'eux, tiré au hasard, passe à l'écran de fin, dans « Et en vrai ? ». Le public visé est autant la classe moyenne que les jeunes : c'est une manif virtuelle, elle doit apprendre quelque chose à chacun.

## Les blessés annoncés, répartis comme en vrai

L'écran de fin donne le nombre de blessés que la partie annonce côté forces de l'ordre, réparti comme les 1 233 CRS blessés en octobre 2026 dans le fichier interne de leur direction : blessés légers, arrêts de travail, où, acouphènes, blessés sans ambiguïté par un tiers parmi ceux dont l'origine est connue. Chaque part est arrondie vers le bas à deux chiffres : elle ne dit jamais plus que la source, et 3 blessés donnent « 2,8 blessés légers », pas « 2 » ni « 3 ». La fiche est dans « Et en vrai ? ».

## Itération 3

- **Le téléphone d'abord** : l'image remplit l'écran, tout l'écran répond (manche flottant à gauche, trois zones à droite), et le jeu pivote en paysage quand le téléphone est tenu debout.
- **La panique est celle de la chaîne** : sa jauge vit dans le bandeau de PANIQUE TV, à côté de son nom. BFM-TV et CNews sont des unités qui cadrent le héros.
- **Un seul comptage de la manif** : le chiffre de la préfecture est retiré.
- **Les blessés, détaillés** : plus de compteur pendant la partie ; à la fin, le nombre annoncé côté forces de l'ordre, et ce qui le compose.
- **La nasse revient d'elle-même**, sans être annoncée.
- **On choisit son héros** parmi ceux de la Collection ; chaque camarade libéré vaut une vie de plus.
- **La Collection se joue** : cartes à retourner, « Nouveau », progression par rayon, ce qu'on a débloqué, en fin de niveau.

## Itération 4

- **Des niveaux en hauteur et en profondeur** : sol épais qu'on creuse partout, galeries, caves, métro, immeubles à étages. Le héros tire aussi vers le bas et vers le haut.
- **Les pancartes se débloquent** : toutes se valent, avec ou sans source ; chacune a une rareté tirée de son texte. Une seule façon d'en voir arriver une : une tranche de vingt personnes qui rejoint la manif en apporte une, une fois sur deux, tirée au hasard. Le cortège ne montre que celles qui sont arrivées.
- **Une pile de personnages** : on part avec un seul, tiré au hasard la première fois, choisi ensuite. Chacun encaisse quelques coups : une barre de vie sous la pile, pas de cœurs. Quand il tombe, le précédent prend sa place ; pile vide, niveau perdu. Chaque camarade libéré rejoint la pile, avec son grand carton.
- **Le score, c'est la manif** : sa taille à l'arrivée, avec un record par niveau.
- **Le hasard partout** : le boss, le personnage de départ, les camarades libérés, les pancartes, et dans la scène de taxe l'échelle, l'exemple et le fait choc.
- **Un plan de campagne** : une seule liste d'étapes ; un niveau déposé est une étape comme une autre.
- **PANIQUE TV filme les poubelles** : quand la panique franchit un palier, une poubelle prend feu et une équipe télé vient la filmer, elle, pas la manif. Le bandeau est celui d'une chaîne d'info : logo, trois crans de panique, un fil qui défile.
- **Des écrans courts** : un écran, une idée ; ce qui précise se déplie. Une citation est simplement signée, et sa signature mène à la source.
- **L'Atelier se dessine** : une palette d'images, on peint, on essaie.

## Une sauvegarde qui survit aux mises à jour

Tout est sur l'appareil du joueur ; une mise à jour ne lui fait rien perdre.

- **Un numéro de version** dans la sauvegarde. Changer son format, c'est ajouter une fonction de passage dans `src/client/save.js` et une vraie sauvegarde de l'ancienne version dans `tests/fixtures/sauvegardes/`.
- **Un identifiant ne change pas.** Le nom du fichier est l'identifiant, et il dit la personne ou l'étiquette (`melenchon`, `arnault`) ; le nom affiché, lui, peut changer.
- **Une pancarte corrigée garde son déblocage** : l'ancien texte reste au bout de la ligne, après `était:`. Sa rareté ne bouge pas.
- **Rien n'est retiré** : ce qu'une version du jeu ne connaît pas reste dans la sauvegarde.

## Hors-ligne : seulement dans la version construite

`npm run build` ajoute le service worker, les icônes et le contenu assemblé. En développement, aucun cache.

- Tout le jeu est mis en cache d'un bloc, sous un nom tiré de l'empreinte des fichiers : jamais deux versions mélangées.
- Une mise à jour attend le feu vert du joueur, depuis le menu. Jamais en pleine partie.
- Chemins relatifs partout : le jeu marche dans un sous-dossier, comme sur GitHub Pages.
- Le service worker ignore tout ce qui part vers un autre site.
