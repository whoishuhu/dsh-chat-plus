# dsh-chat-plus : amélioration du chat

[中文](README.zh.md) · [English](README.md) · [Architecture](ARCHITECTURE.md)

Ajoute à DeepSeek Harness la régénération dans la même session, le changement de version, l'édition des questions, le retour arrière, la suppression douce et la corbeille des sessions.

## Fonctionnalités

- Régénération du dernier tour et navigation `< 1/2 >`
- Modèle, heure de génération et navigation avec les flèches
- Avertissement avant une nouvelle exécution des outils
- Suppression douce des réponses, raisonnements, outils et tours complets
- Édition de toute question avec conservation des pièces jointes
- Retour arrière et restauration de la question dans le compositeur
- Corbeille : restauration, suppression définitive et vidage
- Opérations en cascade sur les sous-agents enfants

Le journal append-only original n'est pas modifié. La suppression définitive est irréversible.
