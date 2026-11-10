# dsh-chat-plus: Chat-Erweiterung

[中文](README.zh.md) · [English](README.md) · [Architektur](ARCHITECTURE.md)

Ergänzt DeepSeek Harness um Regenerierung innerhalb derselben Sitzung, Versionswechsel, Fragenbearbeitung, Rücksprung, weiches Löschen und einen Sitzungs-Papierkorb.

## Funktionen

- Regenerierung des letzten Turns und `< 1/2 >`-Versionswechsel
- Modellname, Erstellungszeit und Navigation mit den Pfeiltasten
- Warnung, wenn Werkzeuge erneut ausgeführt werden können
- Weiches Löschen von Antworten, Denken, Tool-Aufrufen und ganzen Turns
- Bearbeitung jeder Frage mit Erhalt von Anhängen
- Rücksprung und Wiederherstellung der Frage im Eingabefeld
- Papierkorb mit Wiederherstellung, endgültigem Löschen und Leeren
- Kaskadierung auf untergeordnete Subagenten

Das ursprüngliche append-only Protokoll wird nicht umgeschrieben. Endgültiges Löschen ist irreversibel.
