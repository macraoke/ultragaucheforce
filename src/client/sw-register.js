// Hors-ligne : le service worker n'existe que dans la version construite (`npm run build`).
// En développement (`npm start`), il n'y en a pas : on voit toujours les fichiers du jour.

export function registerServiceWorker() {
  // Le build ajoute une balise <meta name="ugf-build"> : sans elle, on est en développement.
  if (!('serviceWorker' in navigator) || !document.querySelector('meta[name="ugf-build"]')) return;
  navigator.serviceWorker.register('sw.js').catch(() => {
    // contexte non sécurisé ou navigateur qui refuse : le jeu marche sans
  });
}
