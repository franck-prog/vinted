/*
 * Configuration de la synchronisation (Supabase).
 * Ces deux valeurs sont publiques par conception : la sécurité repose sur la connexion
 * (e-mail + mot de passe) et sur les règles d'accès de la base (voir supabase/schema.sql).
 * Ne mettez JAMAIS ici la clé « service_role » ou « secret ».
 */
window.SUIVI_VINTED_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
};
