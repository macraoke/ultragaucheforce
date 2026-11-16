# Ajouter une pancarte ou un bandeau

Une ligne de texte, et c'est dans le jeu. Le jeu n'affiche que du vrai : ce qui a été écrit, scandé ou diffusé, avec où, quand et le lien.

- Une **pancarte** vue en manif, un **slogan** scandé : [`content/pancartes/`](../content/pancartes). Le cortège les brandit ; les banderoles et les tags du décor reprennent celles de 24 caractères au plus, la place qu'ils ont.
- Un **bandeau** de chaîne d'info : [`content/manchettes/`](../content/manchettes). PANIQUE TV le diffuse en alerte quand la panique monte.

Chacune se débloque en jouant et se retrouve dans la Collection, rayons « Pancartes » et « Vu à la télé ». Une pancarte se débloque quand elle arrive dans la manif : une tranche de vingt personnes qui rejoint le cortège en apporte une, une fois sur deux, tirée au hasard parmi toutes.

Chaque ligne a une **rareté** : commune, rare, épique ou légendaire. Elle se choisit à la main ([plus bas](#la-rareté)). Les plus rares sortent moins souvent.

## Comment

1. Ouvrez [`content/pancartes/`](../content/pancartes) ou [`content/manchettes/`](../content/manchettes) sur GitHub.
2. **Add file → Create new file**, à votre pseudo : `camille.txt`.
3. Une par ligne. **Commit changes… → Propose changes**.

Votre fichier à vous, pas celui d'un autre : zéro conflit.

## Le format

```text
TEXTE | où et quand — https://adresse-de-la-source
```

Une ligne du jeu :

```text
TU NOUS METS 64 ANS, ON TE MAI 68 | vue à Paris, mars 2023 — https://www.carenews.com/news/reforme-des-retraites-a-la-manifestation-du-7-mars-les-jeunes-interrogent-la-place-du-travail | rareté: légendaire
```

## La rareté

Elle se juge sur trois critères :

- **Créativité** : une image, une forme, un détournement.
- **Originalité** : pas le slogan de toutes les manifs.
- **Comique** : un jeu de mots, de l'ironie, une chute.

Légendaire : les trois au plus haut. Épique : deux nets. Rare : une vraie trouvaille. Commune : un slogan rituel, un constat. Pour un bandeau, on juge la trouvaille de la chaîne.

Sans `rareté:`, la ligne est commune. Vous pouvez en proposer une au bout de la ligne : `commune`, `rare`, `épique` ou `légendaire`.

```text
LE TEXTE EXACT DE LA PANCARTE | vue à Lyon, janv. 2023 — https://adresse-de-l-article | rareté: rare
```

La relecture la garde ou la change.

## Corriger une ligne

Une faute dans un texte déjà dans le jeu : corrigez-la, et gardez l'ancien texte au bout de la ligne.

```text
LE TEXTE CORRIGÉ | vue à Lyon, janv. 2023 — https://adresse-de-l-article | était: LE TEXTE D'AVANT
```

Les joueurs qui l'avaient débloquée la gardent. Laissez `rareté:` où il est, s'il y en a un. S'il y a déjà un `était:` au bout de la ligne, n'y touchez pas : c'est le tout premier texte qui compte.

## Une pancarte, un slogan

<!-- fichier: content/pancartes/camille.txt -->
```text
# Pancartes relevées par Camille
LE TEXTE EXACT DE LA PANCARTE | vue à Lyon, janv. 2023 — https://adresse-de-l-article
LE SLOGAN TEL QU'IL EST SCANDÉ | scandé à Paris, sept. 2025 — https://adresse-de-l-article
```

- En majuscules, mot pour mot, comme la source le rapporte.
- « vue à … » pour une pancarte, « scandé à … » pour un slogan : la ville, le mois, l'année.
- La source : un article ou un reportage que vous avez lu. Pas une image qui circule.

Une recrue peut la reprendre : clé `slogan` de [sa fiche](ajouter-un-personnage.md#une-recrue).

## Un bandeau

<!-- fichier: content/manchettes/camille.txt -->
```text
# Bandeaux relevés par Camille
Le texte exact du bandeau ? | Nom de la chaîne, 24 sept. 2023 — https://adresse-de-la-source
```

- Le texte tel qu'il était à l'écran, ponctuation comprise. Le jeu l'affiche en majuscules.
- La chaîne et le jour.
- La source : un article ou un observatoire des médias qui cite le bandeau. Ceux du jeu viennent des relevés d'[Acrimed](https://www.acrimed.org).

Entre deux alertes, PANIQUE TV fait défiler de vraies déclarations : celles de [`content/citations/`](ajouter-une-source.md).
