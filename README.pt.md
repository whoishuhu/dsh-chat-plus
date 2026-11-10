# dsh-chat-plus: melhoria do chat

[中文](README.zh.md) · [English](README.md) · [Arquitetura](ARCHITECTURE.md)

Adiciona ao DeepSeek Harness regeneração na mesma sessão, troca de versões, edição de perguntas, voltar atrás, exclusão suave e lixeira de sessões.

## Recursos

- Regeneração do último turno e troca `< 1/2 >`
- Modelo, horário de geração e navegação pelas setas
- Aviso quando ferramentas podem ser executadas novamente
- Exclusão suave de respostas, raciocínio, ferramentas e turnos completos
- Edição de qualquer pergunta com preservação de anexos
- Voltar atrás e restaurar a pergunta no compositor
- Lixeira com restauração, exclusão permanente e limpeza
- Operações em cascata para subagentes filhos

O log append-only original não é reescrito. A exclusão permanente é irreversível.
