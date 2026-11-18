# Mesure d'audience

En ligne seulement, et anonyme : PostHog en mode sans cookie, rien d'écrit sur l'appareil, aucun profil, ni clic ni saisie capturés, pas d'enregistrement de session, les adresses sans leurs paramètres. En local (`npm start`) et dans les tests, rien n'est chargé et rien ne part.

Ce qui ne part jamais : un texte écrit par le joueur, le contenu de la sauvegarde, un niveau de l'Atelier (il compte sous le seul nom `atelier`), un identifiant de joueur. Seules les propriétés listées ici passent le filtre d'avant envoi (`KEPT`, dans `tools/mesure-template.js`) ; une propriété ajoutée ailleurs est jetée.

Le code : `src/client/mesure.js` (parties, héros), `src/client/music.js` (Radio Manif), `src/client/main.js` (branchements).

## La visite

| Événement | Quand | Propriétés |
|---|---|---|
| `$pageview` | la page s'ouvre (PostHog) | adresse sans paramètres, navigateur, système |
| `game_ready` | le menu est à l'écran : le jeu a démarré | `touch` (écran tactile) |
| `content_failed` | le contenu du jeu n'a pas pu se charger | `online` |
| `$exception` | une erreur JavaScript (PostHog) | message et pile, adresses sans paramètres |

## Les parties

| Événement | Quand | Propriétés |
|---|---|---|
| `game_started` | « C'est parti » | `level`, `mode`, `hero`, `hero_source`, `input`, `again` |
| `game_ended` | victoire, défaite, abandon | `level`, `mode`, `hero`, `outcome`, `seconds`, `crowd`, `lives`, `progress`, `via` (abandon) |
| `hero_rescued` | un camarade libéré prend la main | `level`, `mode`, `hero_from`, `hero_to` |

- `level` : l'identifiant du niveau (le nom de son fichier), ou `atelier`.
- `mode` : `campagne` (dans `content/campagne.txt`), `hors_campagne` (les autres niveaux de `content/`), `atelier`.
- `hero` : le héros de départ. `hero_source` : `choisi` (sur le carton d'ouverture ou dans la Collection), `aleatoire` (tiré parmi ceux déjà débloqués), `premier` (la toute première partie, tiré parmi tous), `atelier`.
- `input` : `clavier`, `manette` ou `pouce`. `again` : vrai pour « Recommencer » dans la même visite du niveau.
- `outcome` : `won`, `lost`, `abandoned`. `seconds` : la durée de jeu. `crowd` : la taille de la manif. `lives` : les personnages restants dans la pile. `progress` : jusqu'où le héros est allé, en pour cent de la largeur du niveau.
- `via`, pour un abandon : `menu` (« Quitter »), `recommencer`, `autre_niveau`, `fermeture` (la page fermée en pleine partie).

## Radio Manif

| Événement | Quand | Propriétés |
|---|---|---|
| `music_started` | une piste joue pour de bon (une fois par chargement ; une reprise après pause n'en est pas un) | `track`, `slot`, `level`, `cause` |
| `music_skipped` | ⏭ ou N, sur une piste qui a vraiment joué (passer une piste encore en chargement n'envoie rien) | `track`, `slot`, `level`, `seconds`, `percent`, `volume` |
| `music_paused` | ⏸ de la Radio (`via: radio`), ou pause au bouton du lecteur SoundCloud, page à l'écran (`via: lecteur`, comptée après une seconde : la PAUSE que le lecteur envoie juste avant la fin d'une piste ne compte pas) | `track`, `slot`, `level`, `seconds`, `percent`, `volume`, `via` |
| `music_resumed` | ▶ après une pause (de la Radio, ou au bouton du lecteur après une pause comptée) | `track`, `slot`, `level`, `seconds`, `percent`, `via` |
| `music_finished` | la piste est allée jusqu'au bout | `track`, `slot`, `level`, `volume` |
| `music_muted` / `music_unmuted` | Radio Manif coupée ou remise (Options, « ▶ Radio Manif ») | `track`, `slot` ; coupée : `seconds`, `percent` |
| `music_failed` | une piste ne joue pas : une autre la remplace | `track`, `slot`, `level`, `reason` |
| `music_blocked` | le lecteur SoundCloud n'a pas pu se charger : le message du bloqueur s'affiche (une fois par visite) | `online` |
| `music_unreachable` | plus aucune musique ne joue alors qu'elle est demandée (une fois par visite) | `online` |

- `track` : l'identifiant de la piste (le nom de son fichier dans `content/musiques/`).
- `slot` : `menu`, `boss` ou `niveau` ; `level`, en niveau : lequel (`atelier` dans l'Atelier).
- `cause` : pourquoi cette piste : `auto` (le moment du jeu), `suivante` (⏭), `enchainee` (la précédente a fini), `remplacement` (la précédente n'a pas joué), `relance` (le bouton « Relancer »).
- `seconds` : où en était la piste, en secondes depuis son début ; `percent` : en pour cent de sa durée, quand le lecteur la donne.
- `volume` : le volume du lecteur SoundCloud, de 0 à 100 (le jeu le met à 45). Le lecteur n'annonce pas ses changements : il est lu au ⏭, à la pause et à la fin, et manque s'il ne répond pas à temps.
- `reason` : `erreur` (le lecteur l'annonce : retirée, privée), `absente` (aucune piste chargée), `arretee` (chargée, ne part pas, même relancée), `muette` (le lecteur dit qu'il joue, rien n'avance pendant une minute).
