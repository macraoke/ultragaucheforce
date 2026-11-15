# Ajouter une source

Les blagues sont inventées. Le reste est vrai : chaque citation et chaque chiffre est exact, daté, relié à une page que quelqu'un a lue.

- Une citation : `content/citations/auteur-sujet.txt`
- Une fiche (chiffre, droit, fait) : `content/fiches/sujet.txt`

## La méthode

1. Ouvrez la source et retrouvez-y les mots ou le chiffre. Un souvenir ou une capture qui circule ne compte pas.
2. Recopiez exactement.
3. Datez votre relecture dans `verifie`.
4. Un doute ? N'ajoutez pas.

Ce qui tient : textes officiels (Insee, service-public.gouv.fr, Légifrance, Conseil d'État, Assemblée nationale, Défenseur des droits), grands médias, agences, recherche. Ce qui ne tient pas : blogs anonymes, agrégateurs, réseaux sociaux.

## Une citation

<!-- fichier: content/citations/exemple-auteur-sujet.txt -->
```text
texte: Je traverse la rue, je vous en trouve.
auteur: Emmanuel Macron
fonction: président de la République
date: 2018-09-15
contexte: Réponse à un jeune horticulteur sans emploi, lors des Journées du patrimoine à l'Élysée.
categorie: puissants
note: Phrase complète et variantes éventuelles, si les sources divergent.
source.titre: Nom du média — titre de l'article
source.url: https://adresse-complete-de-la-page-lue
source.nature: presse
verifie: 2026-11-15
```

| Clé | Rôle |
|---|---|
| `texte` | les mots exacts, sans guillemets, au plus court |
| `auteur`, `fonction` | qui parle, à quel titre au moment des faits |
| `date` | `AAAA-MM-JJ`, `AAAA-MM` ou `AAAA` |
| `contexte` | où, à qui, à propos de quoi |
| `categorie` | `diabolisation`, `puissants` ou `gauche` |
| `mot` | pour `diabolisation` : le mot qu'un automate criera (`ÉCOTERRORISME`) |
| `note` | phrase complète, variantes, réponse de la personne visée |
| `source.titre`, `source.url` | la page lue |
| `source.nature` | `officielle`, `presse`, `associative`, `militante` ou `createur` |
| `verifie` | le jour de la relecture |

Les médias ne rapportent pas les mêmes mots ? Prenez la version la mieux attestée, dites-le dans `note`.

## Une fiche

<!-- fichier: content/fiches/exemple-sujet.txt -->
```text
titre: Le Smic, au centime près
theme: richesses
texte: En novembre 2026, le Smic est de 1 867,02 € brut par mois pour 35 heures par semaine, soit 1 477,93 € net.
portee: Cas général ; le montant net est indicatif.
periode: novembre 2026
source.titre: Service-Public.gouv.fr — Smic (salaire minimum interprofessionnel de croissance)
source.url: https://www.service-public.gouv.fr/particuliers/vosdroits/F2300
source.nature: officielle
verifie: 2026-11-15
```

| Clé | Rôle |
|---|---|
| `titre` | deux à six mots |
| `theme` | `richesses`, `droits`, `ordre`, `democratie`, `programme` ou `luttes` |
| `texte` | une ou deux phrases : le chiffre, son unité, sa date |
| `portee` | la population, la définition, et ce que le chiffre ne dit pas |
| `periode` | la période couverte |
| `valeur` | facultatif : le nombre brut, quand une scène du jeu calcule avec |
| `source.…`, `verifie` | comme pour une citation |

## Pièges

- Patrimoine, revenu, argent disponible : trois choses. Une fortune en actions n'est pas un compte en banque.
- Deux bilans pour un même événement : donnez les deux, et qui donne lequel.
- Une mesure de programme : « Le programme … propose … », page officielle, nature `militante`.
- Un chiffre qui vieillit (Smic, classements) : datez-le dans `periode`, corrigez la fiche quand il change.

Une source morte ou fausse ? Issue « Source à corriger », ou corrigez le fichier.
