// Mesure d'audience anonyme (PostHog). Ce fichier est un MODÈLE : `npm run build` le recopie dans
// `index.html`, seulement quand POSTHOG_PROJECT_TOKEN est donné, en remplaçant les deux valeurs
// marquées « rempli par le build ». En développement (`npm start`), il n'existe pas.
//
// - Le script est celui de PostHog (`array.js`, chargé depuis son hôte) : bloqué ou hors ligne, la
//   page garde la petite file d'attente du chargeur, et le jeu ne s'en aperçoit pas.
// - Le service worker ne touche à aucune requête vers un autre site : ce script n'entre pas dans le cache.
// - Rien n'est écrit sur l'appareil (`memory`), aucun profil n'est créé, aucun clic ni aucune saisie
//   n'est capturé, pas d'enregistrement de session ; les adresses partent sans leurs paramètres.
// - Mode sans cookie (`cookieless_mode: 'always'`, posthog.com/tutorials/cookieless-tracking) : le
//   navigateur envoie un identifiant fixe, `$posthog_cookieless`, et PostHog calcule le visiteur sur ses
//   serveurs, par un hachage du jour, de l'IP, de l'agent utilisateur et du site, avec un sel renouvelé
//   et effacé chaque jour. L'IP et l'agent utilisateur brut sont retirés de l'événement après ce calcul.
//   Il faut aussi « Enable cookieless tracking » dans le projet, sinon PostHog jette les événements.
// - Les seuls événements du jeu sont ceux de `docs/mesure-d-audience.md` (`src/client/mesure.js`, `music.js`), et les erreurs JavaScript.

(function () {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return; // jamais en local

  // Le chargeur officiel de PostHog, tel que le donne sa documentation (posthog.com/docs/libraries/js).
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  // Ce qui pourrait distinguer un appareil d'un autre, au-delà du navigateur, du système et du type d'appareil.
  // `$raw_user_agent`, `$host` et `$timezone` restent : le mode sans cookie en a besoin pour son hachage
  // (sans eux, PostHog jette l'événement), et retire lui-même l'agent utilisateur brut une fois le calcul fait.
  var DROPPED = ['$screen_height', '$screen_width', '$viewport_height', '$viewport_width', '$device_id', '$initial_person_info', '$timezone_offset'];
  // Les seules propriétés sans « $ » : celles des événements du jeu (`src/client/mesure.js`), et ce dont PostHog a besoin.
  // Les paramètres de campagne lus dans l'adresse (utm_…, fbclid…) ne partent pas.
  var KEPT = ['token', 'distinct_id', 'title', 'level', 'outcome', 'seconds', 'input', 'touch', 'online',
    'mode', 'hero', 'hero_source', 'again', 'crowd', 'lives', 'progress', 'via', 'hero_from', 'hero_to',
    'track', 'slot', 'cause', 'percent', 'volume', 'reason'];
  // Ce que PostHog retient de l'entrée dans la visite : l'adresse, pas ses paramètres.
  var ENTRY = /^\$(session_entry|initial)_(?!(url|host|pathname|referrer|referring_domain)$)/;

  // Une adresse dans un texte : ce qui suit son « ? » ou son « # » ne part pas.
  var QUERY = /(https?:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/g;

  /** Toutes les adresses, à toute profondeur (les piles d'appels d'une erreur comprises), sans paramètres ni ancre. */
  function bare(value) {
    if (typeof value === 'string') return value.replace(QUERY, function (all, url) { return url; });
    if (value && typeof value === 'object') for (var key in value) value[key] = bare(value[key]);
    return value;
  }

  /** Avant chaque envoi : les adresses sans paramètres ni ancre, pas de propriété de personne, pas de lieu déduit de l'IP. */
  function clean(event) {
    if (!event) return event;
    var p = bare(event.properties || (event.properties = {}));
    for (var name in p) {
      if (name.charAt(0) === '$' ? ENTRY.test(name) : KEPT.indexOf(name) < 0) delete p[name];
    }
    for (var i = 0; i < DROPPED.length; i++) delete p[DROPPED[i]];
    delete p.$set;
    delete p.$set_once;
    delete event.$set;
    delete event.$set_once;
    p.$geoip_disable = true;
    p.$process_person_profile = false;
    return event;
  }

  window.posthog.init('__TOKEN__', { // rempli par le build
    api_host: '__HOST__', // rempli par le build
    defaults: '2026-08-30',
    cookieless_mode: 'always',
    persistence: 'memory',
    person_profiles: 'never',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    save_campaign_params: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    rageclick: false,
    capture_exceptions: true,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    before_send: clean,
  });
})();
