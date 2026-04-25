# WidColor v2 — Inbox por Funil — Design

**Data:** 2026-04-25
**Autor:** Andrews Porto + Claude
**Status:** Aprovação pendente

## Objetivo

Pintar o fundo de cada linha do **inbox de chats** da Kommo com uma cor associada ao **funil** do lead. Pintar também o cabeçalho do chat aberto. Permite identificação visual rápida do funil enquanto o operador trabalha no atendimento.

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| 1 | Origem da cor | Manual: usuário escolhe cor por funil nas settings do widget |
| 2 | Intensidade visual | Translúcida (~18% opacidade) — fundo da linha inteiro |
| 3 | Onde aplicar | Inbox (lista de conversas) + cabeçalho do chat aberto |
| 4 | Funil sem cor configurada | Não pinta (fundo permanece padrão da Kommo) |
| 5 | Escopo das settings | Conta inteira (todos os usuários veem as mesmas cores) |
| 6 | Mapear lead → funil | API por lead (`GET /api/v4/leads/{id}`) com cache LRU em memória + `localStorage` (TTL 10min) |

## Arquitetura

Seis módulos isolados em `script.js`:

### `PipelineRegistry`
- **Faz:** carrega lista de funis da conta (`APP.constant('account').pipelines`)
- **Expõe:** `list() → [{id, name}]`
- **Depende de:** objeto global `APP` da Kommo (sem chamadas de API)

### `ColorMap`
- **Faz:** lê configuração de cores das settings do widget
- **Expõe:** `get(pipelineId) → '#hex' | undefined`
- **Depende de:** `self.get_settings()`
- **Formato salvo:** chave `pipeline_colors` é uma string JSON `{"<pipeline_id>": "<#hex>"}`. Funis sem cor estão ausentes do objeto.

### `LeadResolver`
- **Faz:** mapeia `leadId → pipelineId`
- **Expõe:** `resolve(leadId) → Promise<pipelineId|null>`
- **Cache:**
  - In-memory `Map<leadId, {pipelineId, expiresAt}>`
  - `localStorage` mirror sob chave `widcolor:lead:{leadId}` com payload `{p: pipelineId, t: timestamp}`
  - TTL de hit: 10 minutos
  - TTL de miss/erro: 1 minuto (para não martelar em loop em caso de 404)
- **Fetch:** `GET /api/v4/leads/{id}` na origem atual (sessão Kommo já autenticada via cookie)

### `InboxPainter`
- **Faz:** observa o DOM do inbox e pinta cada linha visível com a cor do funil do seu lead
- **Trigger:** `MutationObserver` em `document.body` com filtro de subtree, debounce de 100ms
- **Seletores (a confirmar inspecionando o DOM real):**
  - Container do inbox: `.chats-list, [class*="inbox"]` ou similar
  - Linha de conversa: descoberto na implementação; cada linha precisa expor `lead_id` (via `data-*`, classe ou href)
- **Pintura:** `row.style.backgroundColor = '<#hex>2E'` (alpha 0x2E ≈ 18%). Se cor ausente, `style.backgroundColor = ''` (limpa).

### `ChatHeaderPainter`
- **Faz:** pinta o cabeçalho do chat aberto com a cor do funil
- **Trigger:** mudança de URL detectada via `MutationObserver` + parsing de `/chats/.../leads/detail/{id}`
- **Seletores (a confirmar):** `.feed-compose, .feed-compose__inner` ou equivalente do header
- **Pintura:** mesmo alpha do inbox

### `SettingsUI`
- **Faz:** renderiza página de configuração do widget
- **Conteúdo:**
  - Header explicativo
  - Lista de funis (1 linha por funil): nome + color picker + botão "limpar cor"
  - Preview embutido: 3 linhas fake imitando o inbox, pintadas com as cores escolhidas
- **Persistência:** ao salvar, serializa o mapa em JSON e grava em `pipeline_colors`

## Data flow

```
Página /chats/* carrega
   ↓
init()  → PipelineRegistry.load()
        → ColorMap.load()
   ↓
bind_actions() → MutationObserver(document.body, {subtree: true, childList: true})
   ↓
InboxPainter.tick() (debounced 100ms)
   ├─ querySelectorAll(rowSelector)
   ├─ para cada linha:
   │     leadId = extractLeadId(row)
   │     pipelineId = await LeadResolver.resolve(leadId)
   │     color = ColorMap.get(pipelineId)
   │     if color: row.style.backgroundColor = color + '2E'
   │     else:     row.style.backgroundColor = ''
   ↓
URL muda (lead aberto) → ChatHeaderPainter.tick()
```

## Tratamento de erros

| Cenário | Comportamento |
|---|---|
| API retorna 403/401 | Cacheia `null` por 1 min, linha não pinta, 1 log no console |
| API retorna 404 | Cacheia `null` por 10 min (lead deletado), linha não pinta |
| Erro de rede | Cacheia `null` por 1 min |
| Settings JSON inválido | Trata como `{}` — nada pintado, log no console |
| Pipeline excluída mas com cor configurada | Cor fica órfã nas settings (inerte); SettingsUI só lista funis ativos |
| Kommo muda DOM e seletores quebram | `MutationObserver` segue rodando mas não acha rows; falha silenciosa, log no console |
| `APP.constant('account').pipelines` indisponível | SettingsUI mostra estado vazio com aviso; resto continua funcionando se `pipeline_colors` já tem dados |

## Mudanças em arquivos

| Arquivo | Mudança |
|---|---|
| `manifest.json` | `locations: ["chats", "settings"]`; settings só com `pipeline_colors` (string JSON, default `"{}"`); remove `color_primary/secondary/accent/bg`, `apply_to_*` |
| `script.js` | **Reescrito** — 6 módulos descritos acima |
| `templates/settings.html` | **Reescrito** — lista de funis + color pickers + preview |
| `style.css` | **Simplificado** — apenas estilos da settings UI (pintura do inbox/chat é inline) |
| `i18n/pt.json`, `i18n/en.json` | Atualizar strings (remover labels antigos, adicionar novos) |
| `images/logo.*` | Mantém |
| `README.md` | Atualizar pra refletir o objetivo real |
| `WidColor.zip` | Recompactar no final |

## Testing

Sem framework nativo. Estratégia:

1. **Smoke manual:**
   - Instalar em conta de teste com ≥3 funis distintos
   - Configurar cor diferente para cada funil nas settings
   - Mover leads entre funis e abrir chats — verificar pintura
   - Verificar fallback: funil sem cor → linha não pintada
   - Verificar persistência: refresh → cores mantidas
2. **Console logs** com prefixo `[WIDCOLOR]` em pontos-chave: load, cache hit/miss, resolve success/fail, paint apply.
3. **Checklist no README** para validar antes de subir versão.

## Pontos a descobrir na implementação

(Não bloqueiam o spec — exigem inspeção do DOM real da Kommo)

1. Seletor exato da lista do inbox e de cada linha
2. Como cada linha expõe o `lead_id` (atributo, classe, href)
3. Seletor exato do header do chat aberto
4. Confirmar que `APP.constant('account').pipelines` existe e tem o formato esperado
5. Confirmar formato do JSON de `GET /api/v4/leads/{id}` (chave `pipeline_id`)

## Out of scope (futuro)

- Colorir cards do Kanban de leads
- Colorir lista geral de leads (não-chat)
- Cores por etapa em vez de por funil
- Per-user color overrides
- Auto-paleta de cores (descartado em decisão #4)
