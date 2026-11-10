# dsh-chat-plus: mejora del chat

[中文](README.zh.md) · [English](README.md) · [Arquitectura](ARCHITECTURE.md)

Añade regeneración de respuestas dentro de la misma sesión, cambio entre versiones, edición de preguntas, retroceso, borrado suave y papelera de sesiones a DeepSeek Harness.

## Funciones

- Regeneración del último turno y navegación `< 1/2 >`
- Nombre del modelo, hora de generación y teclas izquierda/derecha
- Aviso cuando una regeneración puede ejecutar herramientas otra vez
- Borrado suave de respuestas, razonamiento, llamadas de herramientas y turnos completos
- Edición de cualquier pregunta con conservación de adjuntos
- Retroceso y restauración de la pregunta en el compositor
- Papelera con restauración, borrado permanente y vaciado
- Operaciones en cascada para subagentes hijos

El registro append-only original no se modifica. El borrado permanente no se puede deshacer.
