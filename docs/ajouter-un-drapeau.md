# Ajouter un drapeau

Les drapeaux flottent dans le cortège et sur les cartons de héros. Chacun vient avec une à trois ressources pour comprendre la lutte qu'il porte ; on les retrouve dans la Collection, rayon « Luttes ».

Un drapeau = un fichier `content/drapeaux/mon-drapeau.txt`.

<!-- fichier: content/drapeaux/confederation-paysanne.txt -->
```text
nom: Drapeau de la Confédération paysanne (stylisé)
description: Le syndicat de l'agriculture paysanne.
auteur: ton pseudo
ressource.1.titre: Notre histoire — Confédération paysanne
ressource.1.url: https://www.confederationpaysanne.fr/gen_article.php?id=11
ressource.1.nature: militante
--- image
YYYYYYYYYYYYYYYYYY
YYYYYYYYvYYYYYYYYY
YYYYYYYvvvYYYYYYYY
YYYYYYvYvYvYYYYYYY
YYYYYYYvvvYYYYYYYY
YYYYYYvYvYvYYYYYYY
YYYYYYYvvvYYYYYYYY
YYYYYYvYvYvYYYYYYY
YYYYYYYYvYYYYYYYYY
YYYYYYYYvYYYYYYYYY
YYYYYYYYvYYYYYYYYY
YYYYYYYYYYYYYYYYYY
```

| Clé | Rôle |
|---|---|
| `nom` | obligatoire |
| `description` | une phrase |
| `proximite` | `1`, `2` ou `3` (`2` sans le champ) : à quel point la lutte est proche de nous |
| `ressource.1.titre` | le titre, avec son auteur ou son média |
| `ressource.1.url` | l'adresse, en `https://` |
| `ressource.1.nature` | `officielle`, `presse`, `associative`, `militante` ou `createur` |
| `ressource.2.…`, `ressource.3.…` | trois ressources au plus |

## La proximité

Le cortège s'ouvre toujours sur le tricolore, puis LFI. Les autres drapeaux sont tirés au hasard à chaque partie, mais une lutte proche sort plus tôt et plus souvent qu'une lutte lointaine. Le carton du camarade libéré les range dans le même ordre que le cortège de la partie.

- `3` : une lutte d'ici, au cœur du programme insoumis (le social, l'écologie, le féminisme, l'antiracisme, les fiertés, la Palestine, Kanaky…).
- `2` : une lutte que la gauche porte à l'Assemblée ou dans la rue, sans qu'elle soit au cœur du cortège.
- `1` : une lutte lointaine, ou sur laquelle la gauche se divise.

## Le dessin

18 colonnes sur 12 lignes, une lettre de [`content/palette.txt`](../content/palette.txt) par pixel. Le drapeau d'une organisation se dessine stylisé : des couleurs, une forme simple, pas son logo recopié.

## Les ressources

Une vidéo courte ou un texte, en français, en accès libre, que vous avez lu ou regardé. De quoi faire un premier pas quand on ne connaît rien au sujet.
