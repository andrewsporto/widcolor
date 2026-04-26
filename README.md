# WidColor — Widget Kommo

Widget que pinta o fundo das conversas do inbox da Kommo (e o cabeçalho do chat aberto) com uma cor configurável por funil. Ajuda a identificar visualmente, em segundos, de qual funil cada conversa pertence.

## Funcionalidades

- Cor por funil configurada manualmente nas settings do widget
- Fundo translúcido (~18%) — mantém legibilidade do texto
- Pinta a lista do inbox e o cabeçalho da conversa aberta
- Funis sem cor configurada não recebem pintura
- Cache local de mapeamento `lead → funil` (TTL 10min)
- Configuração da conta inteira (todos os usuários veem as mesmas cores)

## Instalação

1. Compactar todos os arquivos da raiz em `WidColor.zip` (com `manifest.json` na raiz do zip).
2. Na Kommo: **Configurações → Integrações → Criar integração** (privada).
3. Preencher: nome, descrição, redirect URI (qualquer URL HTTPS válida — não é usada), upload do `.zip`, escopo (acesso a leads).
4. Salvar e instalar o widget na conta.
5. Abrir as configurações do widget → escolher uma cor pra cada funil → Salvar.

## Configuração

A página de settings lista todos os funis da sua conta. Para cada funil:
- **Color picker**: escolha uma cor
- **Campo hex**: edite o hex diretamente se preferir
- **Limpar**: remove a cor (funil deixa de ser pintado)

## Estrutura

```
WidColor/
├── manifest.json
├── script.js          # 6 módulos: Registry, ColorMap, Resolver, InboxPainter, ChatHeaderPainter, SettingsUI
├── style.css          # estilos da página de settings
├── images/
├── i18n/
└── templates/
    └── settings.html
```

## Versão

**2.0.0** — Reescrito do zero. Foco na pintura do inbox por funil. Removidas as 4 cores genéricas da v1.

## Smoke checklist (antes de subir nova versão)

- [ ] `node --check script.js` passa
- [ ] `JSON.parse(manifest.json)` passa
- [ ] Após upload e install: `[WIDCOLOR]` logs aparecem no console em `/chats/...`
- [ ] Settings UI lista todos os funis da conta
- [ ] Salvar uma cor → linha do inbox correspondente é pintada
- [ ] Limpar cor → linha volta ao fundo padrão
- [ ] Chat aberto: header pintado com mesma cor do funil
- [ ] Recarregar página: cores persistem
