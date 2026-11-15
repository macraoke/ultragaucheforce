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

- **Bruitages et voix off** : dans le dépôt, sous licence libre, joués hors-ligne. Une ligne de texte pour un son synthétisé, quelques kilo-octets pour un enregistrement.
- **Musique** : le lecteur officiel de SoundCloud. Un lien suffit pour proposer un morceau, les artistes gardent la main, le dépôt reste léger.

Le prix : pas de musique hors-ligne, et un lecteur tiers avec ses traceurs. Il n'est chargé que si la musique est activée.

## Hors-ligne : seulement dans la version construite

`npm run build` ajoute le service worker, les icônes et le contenu assemblé. En développement, aucun cache.

- Tout le jeu est mis en cache d'un bloc, sous un nom tiré de l'empreinte des fichiers : jamais deux versions mélangées.
- Une mise à jour attend le feu vert du joueur, depuis le menu. Jamais en pleine partie.
- Chemins relatifs partout : le jeu marche dans un sous-dossier, comme sur GitHub Pages.
- Le service worker ignore tout ce qui part vers un autre site.
