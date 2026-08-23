# Android Builder Studio — Générateur ZIP → APK sans IA

Android Builder Studio est une interface web statique associée à un workflow GitHub Actions. Il réceptionne une archive Android, applique des vérifications et réparations **déterministes**, puis publie un APK lorsque le projet est compilable.

## Utilisation rapide

1. Déployez le contenu de ce dépôt dans un dépôt GitHub.
2. Créez ou utilisez la branche `builds`.
3. Déposez l’archive à compiler sous le nom `builds/incoming.zip`.
4. Ajustez si nécessaire `builds/build-config.json`.
5. Poussez la branche `builds` ; le workflow GitHub Actions publie l’APK et les rapports en artefacts.

```json
{
  "buildType": "debug",
  "apkName": "mon-application"
}
```

## Onglet Créer — applications Android mobiles

L’onglet **Créer** ajoute une première expérience no-code exclusivement mobile. Il permet de composer un écran Android vertical en ajoutant, sélectionnant, modifiant et supprimant des **titres**, **textes** et **images**. L’aperçu représente l’écran du téléphone au fur et à mesure de la composition.

Deux sorties sont proposées : le téléchargement d’un **ZIP Android complet** (sources Java, manifest, Gradle Wrapper, ressources et images), ou l’envoi direct de ce ZIP dans le pipeline existant pour publier l’**APK** via GitHub Actions.

Cette première version se limite volontairement à un écran et aux composants de base. Les boutons, formulaires, navigation entre écrans, données locales et intégrations externes seront des étapes ultérieures.

## Ce qui est réparé automatiquement

Le pipeline peut notamment normaliser la racine du ZIP, déplacer des sources ou ressources mal placées, créer des fichiers Gradle et manifests manquants, corriger le namespace, le wrapper Gradle, `android:exported`, AndroidX, des dépôts Maven usuels et certains imports connus.

Si une archive ne contient aucun code Android exploitable, le pipeline peut générer un **APK de secours** installable. Il ne prétend pas reconstituer la logique manquante : l’APK affiche explicitement que le projet d’origine était incomplet.

> Le générateur n’utilise aucun modèle d’IA, aucune clé API et aucun service de génération externe. Les seuls téléchargements réseau nécessaires à la compilation sont les dépendances Android et la distribution Gradle.

Consultez [DETERMINISTIC_PIPELINE.md](DETERMINISTIC_PIPELINE.md) pour le détail du périmètre, des rapports et des limites techniques.
