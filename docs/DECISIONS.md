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

## Le but : une manif qui grossit

On ne gagne pas en tirant plus, mais en arrivant plus nombreux.

- **Le nombre est la ressource** : chaque recrue ajoute du monde, une assemblée générale multiplie. Plus on est nombreux, plus les tracts font de dégâts.
- **Une ligne cède au nombre**, pas aux coups : barrage, blindé, grille. Explorer pour recruter devient le cœur du niveau.
- **Jamais d'impasse** : devant une ligne qui tient, des passants rejoignent peu à peu. Une nasse est levée au bout de vingt secondes.
- **Disperser, pas éliminer** : une charge ou du gaz dispersent une part de la manif ; une unité finit hors service, un boss s'éjecte.

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

Le boss est assis sur sa fortune, dans le niveau comme dans la scène de fin : un tas de liasses à l'échelle. La scène avance d'un bouton à l'autre, un grand nombre et une phrase à chaque fois :

- **L'échelle, face à quelqu'un de très bien payé** : un chirurgien, pas le Smic. Une liasse vaut mille ans de ses revenus.
- **Ce que la fortune rapporte** : ses dividendes d'une année, pour répondre d'avance à « flux et stocks ».
- **Les 2 %** : moins que ces seuls dividendes.
- **Qui paie combien** : la part des revenus qui part en impôts, pour presque tout le monde et pour les milliardaires.
- **Ce que ça finance** : des postes d'enseignants.

Le public visé est autant la classe moyenne que les jeunes.

## Itération 3

- **Le téléphone d'abord** : l'image remplit l'écran, tout l'écran répond (manche flottant à gauche, trois zones à droite), et le jeu pivote en paysage quand le téléphone est tenu debout.
- **La panique est celle de la chaîne** : sa jauge vit dans le bandeau de PANIQUE TV, à côté de son nom. BFM-TV et CNews sont des unités qui cadrent le héros.
- **Un seul comptage de la manif** : le chiffre de la préfecture est retiré.
- **Les blessés, détaillés** : plus de compteur pendant la partie ; à la fin, le nombre annoncé côté forces de l'ordre, et ce qui le compose.
- **La nasse revient d'elle-même**, sans être annoncée.
- **On choisit son héros** parmi ceux de la Collection ; chaque camarade libéré vaut une vie de plus.
- **La Collection se joue** : cartes à retourner, « Nouveau », progression par rayon, cartes gagnées en fin de niveau.

## Hors-ligne : seulement dans la version construite

`npm run build` ajoute le service worker, les icônes et le contenu assemblé. En développement, aucun cache.

- Tout le jeu est mis en cache d'un bloc, sous un nom tiré de l'empreinte des fichiers : jamais deux versions mélangées.
- Une mise à jour attend le feu vert du joueur, depuis le menu. Jamais en pleine partie.
- Chemins relatifs partout : le jeu marche dans un sous-dossier, comme sur GitHub Pages.
- Le service worker ignore tout ce qui part vers un autre site.
