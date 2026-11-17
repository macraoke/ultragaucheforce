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

**Une caméra qui avance avec le monde** (Valentin, 16 novembre 2026 : « tout est vraiment flou/illisible pendant que je me déplace ») : l'écran dessine à son rythme (60, 120 images par seconde, parfois une de travers), le monde avance par pas. La caméra suit le héros à chaque pas, pas à chaque image, et ce qu'elle suit (le héros, le cortège, ses pancartes) est arrondi par rapport à elle : en marche, rien ne recule puis n'avance d'un pixel.

## Des fichiers pour les sons, SoundCloud pour la musique

- **Bruitages** : dans le dépôt, sous licence libre, joués hors-ligne. Une ligne de texte pour un son synthétisé, quelques kilo-octets pour un enregistrement.
- **Pas de voix de synthèse** : elle sonnait comme une annonce de hall de gare. Le déblocage d'un héros se fait au tambour et aux cuivres, le nom écrit en grand. `content/voix/` reste ouvert à un vrai enregistrement.
- **Musique** : le lecteur officiel de SoundCloud. Un lien suffit pour proposer un morceau, les artistes gardent la main, le dépôt reste léger.

Le prix : pas de musique hors-ligne, et un lecteur tiers avec ses traceurs. Il se charge à l'ouverture de la page, même musique coupée (voir « Le lecteur préchargé »).

**Des musiques qui tournent** (Valentin, 16 novembre 2026 : « aussi les musiques pendant le jeu elles tournent pas assez je trouve ») : un niveau dure moins qu'une piste, et chaque niveau tirait la sienne au hasard dans une liste courte ; la même revenait souvent, toujours depuis le début. Désormais, en partie, un sac : toutes celles qu'un niveau peut jouer passent avant qu'une revienne. Et « sa piste en premier » (Valentin, 16 novembre 2026 : « chaque entrée dans un niveau commence par sa piste à lui, et le sac prend le relais ensuite »).

**Une question au premier lancement** (décision de Valentin, 16 novembre 2026 : « Une question au premier lancement ») : le menu demande « Radio Manif ? », Oui ou Non, deux boutons pareils ; le focus reste sur « Jouer ». Rien de SoundCloud ne se chargeait avant la réponse (ce n'est plus le cas : voir « Le lecteur préchargé »). « Oui » charge le lecteur et lance la musique : dans Chromium, ce toucher suffit ; dans Safari, la lecture attend le toucher suivant (« ▶ Relancer la musique », ou n'importe où). La réponse est retenue (`options.musiqueChoisie`, version 2 de la sauvegarde) ; Options la change ensuite. Échap ou B : non, pour cette fois, et la question revient au lancement suivant. Une sauvegarde d'avant la question : musique activée, rien à demander ; sinon, la question, une fois.

**La musique d'office, ⏸ et ⏭ au hasard** (Valentin, 17 novembre 2026 : « j'aimerais bien que ce soit auto play by default […] Left to the "Next" button, add a Pause button . I like the choices you made for default musics for the menu and levels . Keep that and randomize the "Next" button ») : la question du premier lancement n'est plus posée. La musique est activée d'office (version 3 de la sauvegarde : qui n'avait jamais choisi l'a ; qui l'avait coupée la garde coupée). Elle part au chargement si le navigateur l'accepte, sinon au premier geste, n'importe où, sans bouton « Relancer » à toucher. ⏸ tient jusqu'à ce que le joueur remette la musique. ⏭ tire au hasard parmi les pistes du moment ; les pistes par défaut ne changent pas. Le prix : le lecteur de SoundCloud et ses traceurs se chargent dès la première visite.

**Le lecteur préchargé** (Valentin, 17 novembre 2026 : « Précharger le lecteur ») : le lecteur de SoundCloud se charge à l'ouverture de la page, même musique coupée, muet et caché derrière « ▶ Radio Manif ». Ce toucher lance la piste déjà chargée pendant le geste : Safari refusait une lecture lancée une à quatre secondes plus tard, le temps que le lecteur arrive. Le prix : SoundCloud et ses traceurs se chargent à chaque visite, musique coupée comprise. SoundCloud injoignable (réseau, bloqueur) : le bouton le dit, au lieu d'afficher le lecteur une fraction de seconde.

**Une autre piste ouvre le menu** (Valentin, 17 novembre 2026 : « La remplacer au menu ») : La Marseillaise de la République française est une piste chiffrée ; sans module de lecture (Chromium sans Widevine, Firefox de test), elle reste muette. Le menu commence par « We're the Resistors » d'Eric Skiff (`ouverture: oui`) : un flux MP3 en clair, en Creative Commons BY, de la musique 8 bits pour un menu de jeu. La Marseillaise reste au menu, au hasard de ⏭.

Le lecteur ne dit pas toujours qu'une piste se tait. Radio Manif vérifie que la lecture avance : une piste morte cède la place à une autre, un réseau lent est attendu. Quand le navigateur refuse de jouer sans geste du joueur, un bouton le montre et le prochain toucher relance la musique. SoundCloud injoignable : on joue sans musique, et seul le bouton de Radio Manif, ou le retour du réseau, réessaie.

## Le but : une manif qui grossit

On ne gagne pas en tirant plus, mais en arrivant plus nombreux.

- **Le nombre est la ressource** : chaque recrue ajoute du monde, une assemblée générale multiplie. Plus on est nombreux, plus les tracts font de dégâts.
- **Une ligne a une vie** : barrage, blindé, grille. Les tracts l'entament, la manif la pousse, d'autant plus fort qu'elle est nombreuse : explorer pour recruter fait passer plus vite.
- **Jamais d'impasse** : même seul, on finit par casser une ligne à coups de tracts. Une nasse est levée au bout de vingt secondes.
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

**La rareté se choisit à la main** (décision de Valentin, 16 novembre 2026 : « Appliquer, bandeaux aussi ») : elle se tirait du texte, au hasard ; désormais une pancarte ou un bandeau est rare pour sa créativité, son originalité et son comique, et les légendaires sont les plus créatives. Elle s'écrit au bout de la ligne, `| rareté: épique` ; sans ce champ, la ligne est commune. Un contributeur peut en proposer une : la relecture la garde ou la change, et ça se voit dans le diff. L'identifiant ne bouge pas, la sauvegarde ne perd rien ; les poids du tirage non plus.

## La fortune, assise

Chaque niveau finit devant un ultra-riche, assis sur sa fortune : un tas de liasses qui remplit son cadre, avec sa légende juste dessous (ce que vaut une liasse). Lequel ? Le hasard le dit à chaque partie.

**Un même ultra-riche, plusieurs noms** (Valentin, 17 novembre 2026 : « Noms sourcés: On peut créer des Alias des mêmes Boss. ») : Arnault est aussi The Terminator, Bolloré le Petit Prince du cash-flow, Besnier l'Empereur du fromage. Chaque nom est un fichier de `content/boss/`, et le tirage se fait par fichier : ces trois-là sortent deux fois plus souvent que les autres. Ce sont des copies : une réplique ou une fortune mise à jour l'est dans chaque fichier.

Puis on le taxe, sur un seul écran en deux temps, une idée chacun :

1. **Avant : sa fortune, à l'échelle de quelqu'un** (« 670 000 ans de revenus d'un chirurgien ») et ce qu'elle rapporte en un an, pour répondre d'avance à « flux et stocks ».
2. **Après « Taxer les riches » : ce que ça paierait** (« 64 000 enseignants »), en aussi gros que l'était la fortune, qui s'efface du récit : on l'a déjà vue, le tas et sa légende la gardent. La part des 2 % quitte le tas. Dessous, en petit, d'où vient l'argent : **2 % par an**, au plus, puisque l'impôt est différentiel. Puis **ce que chacun paie déjà** : autour de 52 % pour presque tout le monde, 27 % pour les milliardaires. Les deux nombres toujours ensemble.

Valentin, le 16 novembre 2026 : « après avoir taxé, on devrait mettre le focus sur ce que 2% qui représente peu pour le boss final, comme on le voit dans l'illustration, mais qui représente beaucoup pour la société ».

Les liasses d'or sont les 2 %, et elles seules paient ce qui suit : un repère « 2 % = 2,4 milliards » se pose sur la caisse où elles se rangent, puis elles filent vers « Ces 2 % paieraient, à eux seuls ». Les étapes qui en parlent portent la couleur de l'or. Valentin, le 17 novembre 2026 : « C'est pas forcément clair à la fin du niveau que c'est les 2% (donc la petite fraction jaune) qui paie tout ça. »

Chaque étape porte ses sources, en petit. Le bouton suivant mène au bilan du niveau avec un slogan scandé en manif, tiré au hasard (« On lâche rien ! »).

L'échelle et l'exemple se tirent au hasard dans un dictionnaire de fiches sourcées (`compare`, `finance`). Un exemple n'est pas tiré quand 2 % de la fortune en paient moins de dix (« 2 Canadair » ne dit rien) ; il reste au tirage des fortunes plus grosses. Choix confirmé par Valentin. Les faits frappants sur les inégalités (`choc`) se comprennent seuls : l'un d'eux, tiré au hasard, passe à l'écran de fin, dans « Et en vrai ? ». Le public visé est autant la classe moyenne que les jeunes : c'est une manif virtuelle, elle doit apprendre quelque chose à chacun.

## Les blessés annoncés, répartis comme en vrai

L'écran de fin donne le nombre de blessés que la partie annonce côté forces de l'ordre, réparti comme les 1 233 CRS blessés en octobre 2026 dans le fichier interne de leur direction : blessés légers, arrêts de travail, où, acouphènes, blessés sans ambiguïté par un tiers parmi ceux dont l'origine est connue. Chaque part est arrondie à l'entier le plus proche, sans décimale (Valentin, le 16 novembre 2026 : « dans le décompte des blessés, arrondi . pas de décimales . ») : 3 blessés donnent « 3 blessés légers, 2 blessures aux jambes ou aux pieds et 1 aux bras ou aux mains ». Une part arrondie à zéro ne s'écrit pas ; les blessés par un tiers ne s'écrivent qu'à partir de 2, pour ne pas lire « 1 sur environ 1 » là où la source dit 12 sur une vingtaine. Aucune part ne dépasse le total ; les parts se recoupent (un blessé léger peut être en arrêt de travail), leur somme n'est donc pas le total, ni dans la source ni à l'écran. La fiche est dans « Et en vrai ? ».

Ce que l'écran en dit change d'une partie à l'autre, tiré de la graine de la partie (Valentin, le 16 novembre 2026 : « randomise le décompte des blessés un peu mieux, mets en avant les blessures les plus ridicules (anecdotiques) notamment celles qu'ils se sont causés eux mêmes ») : les blessés légers, toujours, puis deux autres parts de la répartition ; et, en gras, « Dans leur fichier : » une blessure qu'un agent s'est faite seul (« une cheville tordue dans un trou »), une fois sur deux suivie d'une autre (« ongle majeur droit »). Ce sont les mots de l'article, repris dans la fiche ; l'article n'en donne pas le nombre, l'écran les cite donc telles quelles. La liste est `FROM_FILE` dans `src/client/blesses.js`.

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
- **Les pancartes se débloquent** : toutes se valent, avec ou sans source ; chacune a une rareté, choisie à la main (voir « La Collection »). Une seule façon d'en voir arriver une : une tranche de vingt personnes qui rejoint la manif en apporte une, une fois sur deux, tirée au hasard. Le cortège ne montre que celles qui sont arrivées.
- **Une pile de personnages** : on part avec un seul, tiré au hasard la première fois, choisi ensuite. Chacun encaisse quelques coups : une barre de vie sous la pile, pas de cœurs. Quand il tombe, le précédent prend sa place ; pile vide, niveau perdu. Chaque camarade libéré rejoint la pile, avec son grand carton.
- **Le score, c'est la manif** : sa taille à l'arrivée, avec un record par niveau.
- **Le hasard partout** : le boss, le personnage de départ, les camarades libérés, les pancartes, et dans la scène de taxe l'échelle, l'exemple et le fait choc.
- **Un plan de campagne** : une seule liste d'étapes ; un niveau déposé est une étape comme une autre.
- **PANIQUE TV filme les poubelles** : quand la panique franchit un palier, une poubelle prend feu et une équipe télé vient la filmer, elle, pas la manif. Le bandeau est celui d'une chaîne d'info : logo, trois crans de panique, un fil qui défile.
- **Des écrans courts** : un écran, une idée ; ce qui précise se déplie. Une citation est simplement signée, et sa signature mène à la source.
- **L'Atelier se dessine** : une palette d'images, on peint, on essaie.

## Les commandes au pouce

Valentin, le 16 novembre 2026, après avoir joué sur son téléphone : « also on mobile some cntrols are hard to use. like going up whilst shooting , and sometimes i trigger the special attack without wanting it ».

- **Le manche se lit par secteurs** : poussé vers le haut à 30° près de la verticale, on saute et le tir vise en haut, sans marcher ; en diagonale, on avance et on saute. Le saut part dans l'anneau du manche, avant le bout de sa course.
- **Un pouce qui tremble ne bascule pas** : le saut part à 26 pixels et ne se relâche que sous 16 ; on entre dans le secteur du haut à 30° de la verticale et on n'en sort qu'au-delà de 42°.
- **L'anneau suit le pouce** : sorti du cercle, le pouce garde sa direction et son appui ; la boule reste dans l'anneau.
- **Grimper d'un geste tenu, le pouce penché vers le mur.** Valentin, le 16 novembre 2026 : « Si le pouce penche : l'aide ne joue que si le pouce est en diagonale vers le mur ; pouce tout droit en haut, le héros saute et tire en haut, sans être tiré de côté. » En l'air contre le mur, saut tenu (manche ou SAUT), le héros rebondit chaque fois qu'il redescend. Jamais sous un plafond, jamais contre le bord de la carte, et pas de nouveau rebond si le précédent ne l'a pas fait monter. Un appui sur SAUT contre le mur reste un rebond, comme au clavier. Au clavier et à la manette, rien ne change : la simulation ne change pas, seuls les doigts sont lus autrement.
- **TIR glissé vers le haut vise en haut**, sans sauter : le pouce qui tire n'a pas à lâcher son bouton. Une flèche au-dessus de TIR le montre.
- **SPÉ ne part que d'un appui posé dessus**, jamais d'un pouce qui glisse depuis TIR ou SAUT. Le reste du haut de l'écran, à droite, tire en haut. Le glissement entre SAUT et TIR reste.
- On vise en haut sans avancer, comme au clavier et à la manette : la règle est celle de la simulation, la même partout.
- **Le héros se repère dans la manif** : une petite flèche d'or au-dessus de sa tête, seulement quand le cortège l'entoure.

## Une sauvegarde qui survit aux mises à jour

Tout est sur l'appareil du joueur ; une mise à jour ne lui fait rien perdre.

- **Un numéro de version** dans la sauvegarde. Changer son format, c'est ajouter une fonction de passage dans `src/client/save.js` et une vraie sauvegarde de l'ancienne version dans `tests/fixtures/sauvegardes/`.
- **Un identifiant ne change pas.** Le nom du fichier est l'identifiant, et il dit la personne ou l'étiquette (`melenchon`, `arnault`) ; le nom affiché, lui, peut changer.
- **Une pancarte corrigée garde son déblocage** : l'ancien texte reste au bout de la ligne, après `était:`. Sa rareté, écrite sur la ligne, reste aussi.
- **Rien n'est retiré** : ce qu'une version du jeu ne connaît pas reste dans la sauvegarde.
- **Les brouillons de l'Atelier à part** : leur propre clé et leur propre numéro de version (`src/client/atelier-brouillons.js`). Un stockage refusé ou plein ne bloque ni le dessin ni la partie : l'Atelier le dit.

## Hors-ligne : seulement dans la version construite

`npm run build` ajoute le service worker, les icônes et le contenu assemblé. En développement, aucun cache.

- Tout le jeu est mis en cache d'un bloc, sous un nom tiré de l'empreinte des fichiers : jamais deux versions mélangées.
- Le service worker revalide auprès du serveur (`no-cache`) : ce que la page vient de recevoir n'est pas retéléchargé. L'image des aperçus de lien (`apercu.jpg`) reste en ligne, hors du cache.
- La page demande le contenu dès sa lecture, et le build y annonce les modules du menu, tirés des `import`. L'Atelier se charge à son ouverture.
- Une mise à jour attend le feu vert du joueur, depuis le menu. Jamais en pleine partie.
- Chemins relatifs partout : le jeu marche dans un sous-dossier, comme sur GitHub Pages.
- Le service worker ignore tout ce qui part vers un autre site.
