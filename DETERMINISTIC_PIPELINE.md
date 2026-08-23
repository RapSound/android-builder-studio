# Pipeline déterministe Android Builder Studio

Android Builder Studio ne recourt à **aucun modèle d’IA**. Il applique des règles statiques, reproductibles et traçables afin de transformer une archive ZIP Android en APK lorsque les fichiers nécessaires sont présents ou peuvent être reconstruits sans ambiguïté.

## Chaîne de traitement

| Étape | Action déterministe | Résultat |
|---|---|---|
| Validation ZIP | Refuse les chemins traversants, liens symboliques, archives trop volumineuses et ratios de compression suspects | Extraction sûre dans `project/` |
| Normalisation | Aplatissement d’une racine ZIP parasite, mise en quarantaine des déplacements | Arborescence Android exploitable |
| Analyse | Détection des modules, sources, manifeste, fichiers Gradle, wrapper et ressources | `project-analysis.json` |
| Réparation structurelle | Création ou correction des fichiers Gradle, du manifeste, du namespace, du wrapper et d’`android:exported` | `repair-report.json` |
| Compilation | Exécution Gradle avec jusqu’à huit tours de corrections connues | APK de débogage ou de publication |
| Secours | Si le ZIP ne contient aucun code Android exploitable, génération d’une application Android minimale informative | APK de secours installable et rapport explicite |

## Corrections prises en charge

Le réparateur gère notamment les fichiers Gradle ou manifests manquants, les sources et ressources mal placées, les namespaces absents, `android:exported`, AndroidX, certains imports connus, les dépôts Maven usuels et les incompatibilités Java/Kotlin les plus courantes. Chaque écriture et chaque déplacement est journalisé dans le rapport de réparation.

## Limite essentielle

> Un système déterministe ne peut pas reconstruire une fonctionnalité qui n’existe pas dans l’archive. Si des écrans, bibliothèques métier, clés de service, ressources ou fichiers sources essentiels sont absents, l’outil ne les invente pas.

Dans ce cas, le pipeline produit soit un rapport d’échec exploitable, soit, lorsque le mode secours est actif, un APK minimal intitulé **Android Builder Rescue**. Cet APK confirme que la chaîne Android fonctionne, mais il ne prétend pas reproduire l’application d’origine.

## Configuration

Le dépôt attend une archive `builds/incoming.zip` sur la branche `builds`. La configuration `builds/build-config.json` peut définir `buildType`, `apkName`, `versionName` et `versionCode`.

```json
{
  "buildType": "debug",
  "apkName": "mon-application"
}
```

Les artefacts publiés par GitHub Actions comprennent l’APK, le journal Gradle et le rapport de réparation.
