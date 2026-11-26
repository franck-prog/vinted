# Activer la synchronisation (et les photos)

La synchronisation s'appuie sur **Supabase**, un service gratuit qui héberge une petite base de données et un espace de stockage pour les photos.
Une fois en place, vos articles, dépenses et photos sont identiques sur le téléphone et l'ordinateur. Chaque appareil garde une copie locale : l'application fonctionne hors connexion et envoie les changements dès que la connexion revient.

Comptez environ 10 minutes, une seule fois.

## 1. Créer le projet Supabase

1. Allez sur <https://supabase.com> → **Start your project**, puis connectez-vous avec votre compte GitHub (le plus simple).
2. **New project** :
   - *Name* : `vinted`
   - *Database password* : cliquez sur **Generate a password**. Vous n'en aurez pas besoin ensuite.
   - *Region* : **Europe (Paris)** ou la région européenne la plus proche.
   - Plan **Free**.
3. Attendez une à deux minutes que le projet soit prêt.

## 2. Préparer la base

1. Dans le menu de gauche : **SQL Editor** → **New query**.
2. Copiez tout le contenu du fichier [`supabase/schema.sql`](../supabase/schema.sql) et collez-le.
3. Cliquez sur **Run**. Le message « Success. No rows returned » doit s'afficher.

Ce script crée la table des données et l'espace « photos ». Il impose aussi que chaque compte ne voie que ses propres données.

## 3. Créer votre compte

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Saisissez votre e-mail et un mot de passe, cochez **Auto Confirm User**, puis validez.
   C'est ce couple e-mail / mot de passe que vous utiliserez dans l'application.
3. Fermez ensuite les inscriptions, pour que personne d'autre ne puisse créer de compte :
   **Authentication** → **Sign In / Providers** → désactivez **Allow new users to sign up** → **Save**.

## 4. Récupérer les deux informations de connexion

Dans **Project Settings** (roue crantée), récupérez :
- **Project URL**, de la forme `https://xxxxxxxx.supabase.co`, dans *Data API* (ou via le bouton **Connect** en haut du projet) ;
- la clé **publishable**, de la forme `sb_publishable_…`, dans *API Keys*. Sur les projets plus anciens, prenez la clé **anon public**.

Ces deux valeurs sont **publiques** : elles peuvent apparaître dans le code sans risque, car vos données sont protégées par votre mot de passe et par les règles de la base.
⚠️ Ne communiquez **jamais** la clé **secret** ni la clé **service_role** : elles donnent un accès total.

Inscrivez ces deux valeurs dans `js/config.js` (ou envoyez-les à Claude, qui s'en chargera) :

```js
window.SUIVI_VINTED_CONFIG = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseKey: 'sb_publishable_xxxxxxxxxxxx',
};
```

## 5. Se connecter sur chaque appareil

Dans l'application : onglet **Données** → **Synchronisation entre appareils** → saisissez votre e-mail et votre mot de passe.
À la première connexion, les données déjà présentes sur l'appareil sont fusionnées avec celles du serveur. Les données d'exemple ne sont jamais envoyées.

Le nuage en haut à droite indique l'état de la synchronisation :
- 🟢 synchronisé ;
- 🔵 en cours ;
- 🟡 hors ligne (les changements partiront au retour de la connexion) ;
- 🔴 erreur (cliquez dessus pour voir le détail).

## Bon à savoir

- **Conflits** : si le même article est modifié sur deux appareils, c'est la modification la plus récente qui l'emporte.
- **Photos** : elles sont réduites (1 600 px maximum, quelques centaines de Ko) avant l'envoi. L'offre gratuite inclut 1 Go de stockage, soit plusieurs milliers de photos. Sur téléphone, le bouton « Ajouter des photos » donne accès à la galerie, à l'appareil photo et à Google Drive.
- **Mise en veille** : Supabase met en pause les projets gratuits inutilisés pendant une semaine environ. Vos données sont conservées. Si cela arrive, l'application continue de fonctionner sur chaque appareil. Rouvrez le projet sur supabase.com et cliquez sur **Restore project** : la synchronisation reprend toute seule.
- **Sauvegarde** : la synchronisation ne remplace pas une sauvegarde. Un « Tout effacer » est lui aussi synchronisé. Téléchargez une sauvegarde de temps en temps (onglet Données).
