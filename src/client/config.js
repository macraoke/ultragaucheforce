// Réglages du client qui ne sont pas du contenu.

export const REPO = 'https://github.com/macraoke/ultragaucheforce';
export const VERSION = '0.1.0';

/**
 * La mesure d'audience (`mesure.js`) : le projet PostHog où partent les compteurs de parties.
 * Jeton vide : rien n'est mesuré. Ce jeton est public par nature : il ne sert qu'à écrire.
 */
export const ANALYTICS = { host: 'https://eu.i.posthog.com', token: '' };

/** Références assumées du projet, affichées dans « À propos ». */
export const REFERENCES = [
  { titre: 'Fiscal Kombat (2017)', url: 'https://fr.wikipedia.org/wiki/Fiscal_Kombat', note: 'l’ancêtre : un jeu militant fait par des bénévoles.' },
  { titre: 'We Become What We Behold — Nicky Case', url: 'https://ncase.itch.io/wbwwb', note: 'un jeu du domaine public sur la caméra qui fabrique la panique ; notre drone lui doit tout.' },
  { titre: 'Orchestre du Nouveau Monde', url: 'https://www.helloasso.com/associations/orchestre-du-nouveau-monde', note: 'la musique comme manière de penser le monde de demain ; notre fanfare lui fait un clin d’œil.' },
  { titre: 'La Dernière — Radio Nova', url: 'https://www.nova.fr/emissions/la-derniere/', note: 'pour le ton.' },
];
