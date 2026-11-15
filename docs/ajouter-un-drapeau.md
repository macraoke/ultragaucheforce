# Ajouter un drapeau

Les drapeaux flottent dans le cortège et sur les cartons de héros. Chacun vient avec une à trois ressources pour comprendre la lutte qu'il porte ; on les retrouve dans la Bibliothèque.

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
| `ressource.1.titre` | le titre, avec son auteur ou son média |
| `ressource.1.url` | l'adresse, en `https://` |
| `ressource.1.nature` | `officielle`, `presse`, `associative`, `militante` ou `createur` |
| `ressource.2.…`, `ressource.3.…` | trois ressources au plus |

## Le dessin

18 colonnes sur 12 lignes, une lettre de [`content/palette.txt`](../content/palette.txt) par pixel. Le drapeau d'une organisation se dessine stylisé : des couleurs, une forme simple, pas son logo recopié.

## Les ressources

Une vidéo courte ou un texte, en français, en accès libre, que vous avez lu ou regardé. De quoi faire un premier pas quand on ne connaît rien au sujet.
