# Suivi Vinted

Petite application web pour suivre ses ventes Vinted : stock, ventes, bénéfices, dépenses et seuils fiscaux DAC7.
Elle tourne entièrement dans le navigateur, sans compte, sans serveur et sans dépendance. Les données restent sur l'appareil.

## Lancer l'application

- **Le plus simple** : ouvrir `index.html` dans un navigateur (double-clic).
- **Avec un petit serveur local** : `npm start`, puis ouvrir <http://localhost:8080>.
- **En ligne** : activer GitHub Pages sur ce dépôt (Settings → Pages → branche `main`, dossier `/`). L'application est alors accessible depuis le téléphone.

## Installer comme application de bureau

L'application est une **PWA** : elle s'installe comme un vrai logiciel, avec son icône dans le menu Démarrer ou le Dock et sa propre fenêtre. Une fois installée, elle fonctionne sans connexion.

1. Mettre l'application en ligne avec GitHub Pages (voir plus haut). C'est à faire une seule fois.
2. Ouvrir l'adresse obtenue dans **Chrome** ou **Edge**, puis cliquer sur l'icône d'installation à droite de la barre d'adresse, ou sur le bouton **Installer l'application** de l'onglet *Données*.
   - Sur Mac avec Safari : *Fichier → Ajouter au Dock*.
   - Sur iPhone ou Android : *Partager → Sur l'écran d'accueil*.

Les mises à jour du code sont récupérées automatiquement et s'appliquent au lancement suivant.

> Les données sont propres à chaque adresse. Si vous avez commencé en ouvrant `index.html` directement, exportez une sauvegarde depuis l'onglet *Données*, puis importez-la dans l'application installée.

## Fonctionnalités

**Articles**
- Fiche complète : titre, marque, catégorie, taille, état, provenance, prix d'achat, prix affiché, frais annexes (boost, emballage…), lien de l'annonce, notes.
- Cycle de vie : *En stock → En ligne → Réservé → Vendu (à expédier) → Expédié → Finalisé (payé)*, ou *Annulé / retourné*.
- Changement de statut directement depuis la liste. Les dates de mise en ligne et de vente se remplissent seules.
- Bénéfice et marge calculés en direct dans le formulaire, ainsi que le bénéfice potentiel au prix affiché pour les invendus.
- Recherche, filtres par statut et par catégorie, tri par date, bénéfice, ancienneté ou titre.
- Les articles en ligne depuis plus de 60 jours sont signalés pour vous aider à baisser le prix ou à relancer l'annonce.
- Duplication d'un article et suppression annulable.

**Tableau de bord** (par année ou depuis le début)
- Bénéfice net, chiffre d'affaires, nombre de ventes, panier moyen, délai moyen de vente, rentabilité (bénéfice / prix d'achat).
- Stock actuel : nombre d'articles, valeur d'achat, valeur aux prix affichés.
- Argent en attente (ventes pas encore finalisées).
- Graphique mensuel du chiffre d'affaires et du bénéfice, avec infobulles et tableau de données.
- Bénéfice par catégorie.
- Jauges **DAC7** : au-delà de 30 ventes ou de 2 000 € sur une année civile, Vinted transmet les données de vente à l'administration fiscale.

**Dépenses générales**
- Frais qui ne concernent pas un article précis (emballages, dressing en vitrine, étiquettes…), déduits du bénéfice net.

**Données**
- Sauvegarde et restauration en JSON, au choix en fusionnant ou en remplaçant les données.
- Export CSV des articles, compatible avec Excel en français (séparateur `;`, virgule décimale).
- Données d'exemple pour essayer l'application.
- Thème clair, sombre ou automatique. Interface adaptée au mobile.

## Comment sont faits les calculs

| Indicateur | Formule |
|---|---|
| Bénéfice d'un article | montant reçu − prix d'achat − frais annexes |
| Bénéfice net | Σ bénéfices des articles vendus − dépenses générales |
| Marge nette | bénéfice net / chiffre d'affaires |
| Rentabilité | bénéfice brut / prix d'achat des articles vendus |
| Délai de vente | date de vente − date de mise en ligne (ou d'achat, à défaut) |

Seuls les statuts *Vendu*, *Expédié* et *Finalisé* comptent comme ventes. La période d'une vente est déterminée par sa date de vente.
Sur Vinted, la protection acheteurs et les frais de port sont payés par l'acheteur. Saisissez donc comme montant reçu ce que vous touchez réellement.

> ⚠️ Les données sont enregistrées dans le stockage local du navigateur (`localStorage`). Elles ne sont pas synchronisées entre appareils et peuvent être perdues si vous videz les données du navigateur. Pensez à télécharger une sauvegarde régulièrement (onglet **Données**).

## Structure

```
index.html        Structure de la page
css/style.css     Styles (thèmes clair et sombre, responsive)
js/calc.js        Calculs purs (statistiques, séries, import/export), testés
js/app.js         Interface : rendu, formulaires, graphiques SVG, stockage
manifest.webmanifest, sw.js, icons/   Application installable et mode hors ligne
tests/            Tests unitaires (node --test)
```

## Tests

```
npm test
```

Node.js 18 ou plus récent est nécessaire. Aucune installation de paquet n'est requise.
