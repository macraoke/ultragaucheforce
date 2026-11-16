# Ajouter un son

| | Où | Forme |
|---|---|---|
| Bruitage | `content/sons/` | une ligne de texte (son synthétisé) ou un petit fichier audio |
| Voix off | `content/voix/` | un enregistrement au nom du personnage (facultatif) |
| Musique | `content/musiques/` | une fiche avec un lien SoundCloud |

Les bruitages sont dans le dépôt et marchent hors-ligne. La musique passe par le lecteur de SoundCloud.

Pour tout écouter : `npm start`, puis http://localhost:8080/galerie.html.

## Un bruitage synthétisé

Le jeu embarque le synthétiseur [ZzFX](https://github.com/KilledByAPixel/ZzFX) : un son tient en une liste de nombres.

1. Ouvrez https://killedbyapixel.github.io/ZzFX/
2. Cliquez sur Pickup, Jump, Hit, Explosion… ou Random, puis jouez des curseurs.
3. **Copy** donne `zzfx(...[1,.05,220,…])`. Gardez la liste entre crochets.
4. Collez-la dans une fiche :

<!-- fichier: content/sons/klaxon.txt -->
```text
nom: Klaxon de camion-sono
zzfx: 1,.05,330,.02,.2,.15,2,1.2,,,,,,,,,,.8,.02
volume: 0.8
auteur: ton pseudo
licence: CC0-1.0
```

Le nom du fichier est l'identifiant : une arme s'en sert avec `arme.son: klaxon`.

Les sons que le jeu joue de lui-même : `saut`, `tir`, `impact`, `touche` (un coup qui porte), `pare` (un coup arrêté par un bouclier), `explosion`, `degat`, `sauvetage`, `piquet`, `panne`, `greve`, `gaz`, `speciale`, `mort`, `victoire`, `palier`, `boss`, `tambour`, `cuivres`, `clic`, et ceux de la manif et d'en face : `recrue`, `debordement`, `nasse`, `charge`, `visee`, `renfort`, `jet`. Remplacez `content/sons/saut.txt`, vous changez le son du saut.

## Un bruitage enregistré

Une vraie casserole, une vraie fanfare, une vraie foule : un `mp3` mono de quelques secondes, moins de 100 Ko, dans `content/sons/`, avec sa fiche :

```text
nom: Casseroles
fichier: casseroles.mp3
volume: 0.7
auteur: le nom de la personne qui a enregistré
licence: CC-BY-4.0
source: https://adresse-de-la-page-d-origine
```

`zzfx` ou `fichier`, jamais les deux. Licence libre obligatoire : domaine public, CC0, CC BY ou CC BY-SA.

## Une voix off

Le jeu n'a pas de voix off pour l'instant : le carton de déblocage joue un roulement de tambour, des cuivres et une cymbale.

Une vraie voix d'annonceur est la bienvenue : masculine, grave, dynamique, façon bande-annonce télé. Déposez-la dans `content/voix/<identifiant-du-personnage>.mp3` (par exemple `content/voix/zucman.mp3`) : le jeu la joue au déblocage du héros, ou à l'entrée du boss.

- Deux à trois secondes, mono, moins de 100 Ko.
- Votre propre voix, sous licence libre, avec votre nom pour les crédits. Pas d'imitation d'une personne réelle.

## Une musique

<!-- fichier: content/musiques/ma-piste.txt -->
```text
titre: Le titre de la piste
artiste: Le nom de l'artiste
url: https://soundcloud.com/compte-de-l-artiste/nom-de-la-piste
ou: menu
licence: CC-BY-4.0
auteur: ton pseudo
```

| Clé | Rôle |
|---|---|
| `titre`, `artiste` | affichés dans « Radio Manif », avec le lien |
| `url` | l'adresse de la piste sur SoundCloud |
| `ou` | `menu`, `jeu` (tous les niveaux), `partout`, ou l'identifiant d'un niveau (`millevaches`) |
| `licence` | celle qu'affiche la page de la piste |

Sur la page de la piste, **Share → Embed** doit proposer un lecteur. Préférez l'instrumental, et le Creative Commons : une piste « tous droits réservés » peut disparaître du lecteur du jour au lendemain.
