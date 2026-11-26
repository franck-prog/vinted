/*
 * Suivi Vinted — accès au serveur de synchronisation (Supabase).
 * Expose window.VintedSync. L'interface est volontairement petite pour pouvoir
 * être remplacée par une fausse implémentation dans les tests (window.VintedSyncOverride).
 */
(function () {
  'use strict';

  if (window.VintedSyncOverride) {
    window.VintedSync = window.VintedSyncOverride;
    return;
  }

  const cfg = window.SUIVI_VINTED_CONFIG || {};
  const TABLE = 'vinted_items';
  const BUCKET = 'photos';
  const enabled = Boolean(cfg.supabaseUrl && cfg.supabaseKey && window.supabase && window.supabase.createClient);
  let client = null;
  let user = null;

  function sb() {
    if (!enabled) throw new Error('Synchronisation non configurée');
    if (!client) {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'suivi-vinted:auth' },
      });
    }
    return client;
  }

  function erreur(e) {
    const msg = (e && (e.message || e.error_description || e.error)) || String(e);
    if (/Invalid login credentials/i.test(msg)) return new Error('E-mail ou mot de passe incorrect.');
    if (/Email not confirmed/i.test(msg)) return new Error("Ce compte n'est pas encore confirmé.");
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Serveur injoignable (connexion internet ?).');
    if (/JWT|token/i.test(msg) && /expired/i.test(msg)) return new Error('Session expirée, reconnectez-vous.');
    return new Error(msg);
  }

  async function init(onChange) {
    if (!enabled) return null;
    const { data } = await sb().auth.getSession();
    user = data && data.session ? data.session.user : null;
    sb().auth.onAuthStateChange((_event, session) => {
      const next = session ? session.user : null;
      const changed = (next && next.id) !== (user && user.id);
      user = next;
      if (changed && onChange) onChange(user);
    });
    return user;
  }

  async function signIn(email, password) {
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw erreur(error);
    user = data.user;
    return user;
  }

  async function signOut() {
    if (!enabled) return;
    await sb().auth.signOut({ scope: 'local' });
    user = null;
  }

  /** Toutes les lignes de l'utilisateur (par pages de 1000). */
  async function pull() {
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb().from(TABLE)
        .select('id,kind,data,updated_at,deleted')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw erreur(error);
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  async function push(rows) {
    if (!rows.length) return;
    const uid = user && user.id;
    if (!uid) throw new Error('Non connecté');
    for (let i = 0; i < rows.length; i += 500) {
      const lot = rows.slice(i, i + 500).map((r) => ({ ...r, user_id: uid }));
      const { error } = await sb().from(TABLE).upsert(lot, { onConflict: 'user_id,id' });
      if (error) throw erreur(error);
    }
  }

  async function upload(path, blob) {
    const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (error) throw erreur(error);
  }

  /** { chemin: url signée } valables 1 h. */
  async function signedUrls(paths) {
    if (!paths.length) return {};
    const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(paths, 3600);
    if (error) throw erreur(error);
    const out = {};
    for (const d of data || []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
    return out;
  }

  async function remove(paths) {
    if (!paths.length) return;
    const { error } = await sb().storage.from(BUCKET).remove(paths);
    if (error) throw erreur(error);
  }

  window.VintedSync = {
    enabled,
    init,
    signIn,
    signOut,
    pull,
    push,
    upload,
    signedUrls,
    remove,
    user: () => user,
  };
})();
