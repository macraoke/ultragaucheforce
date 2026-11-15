// Hors-ligne : le service worker n'existe que dans la version construite (`npm run build`).
// En développement (`npm start`), il n'y en a pas : on voit toujours les fichiers du jour.

/**
 * Enregistre le service worker et prévient quand une nouvelle version du jeu est prête.
 *
 * @param {(apply: () => void) => void} [onUpdate]
 *        Appelé quand une mise à jour attend. Le menu peut alors proposer « Mettre à jour » ;
 *        appeler `apply()` l'installe et recharge la page. Rien ne se passe sans cet appel :
 *        une partie en cours n'est jamais interrompue.
 */
export function registerServiceWorker(onUpdate = () => {}) {
  // Le build ajoute une balise <meta name="ugf-build"> : sans elle, on est en développement.
  if (!('serviceWorker' in navigator) || !document.querySelector('meta[name="ugf-build"]')) return;

  const offer = (worker) => {
    // Sans contrôleur, c'est la toute première installation : il n'y a rien à mettre à jour.
    if (!worker || !navigator.serviceWorker.controller) return;
    onUpdate(() => {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      worker.postMessage('SKIP_WAITING');
    });
  };

  navigator.serviceWorker.register('sw.js').then((registration) => {
    if (registration.waiting) offer(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') offer(worker);
      });
    });
  }).catch(() => {
    // contexte non sécurisé ou navigateur qui refuse : le jeu marche sans
  });
}
