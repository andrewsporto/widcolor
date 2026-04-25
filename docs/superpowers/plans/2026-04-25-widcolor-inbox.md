# WidColor v2 — Inbox por Funil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever o widget WidColor para pintar o fundo das linhas do inbox de chats da Kommo (e o cabeçalho do chat aberto) com uma cor configurável por funil.

**Architecture:** Widget client-side em `script.js` único (formato AMD `define(['jquery'], ...)`) com 6 módulos internos: `PipelineRegistry`, `ColorMap`, `LeadResolver`, `InboxPainter`, `ChatHeaderPainter`, `SettingsUI`. Sem dependências externas além do que a Kommo já injeta (jQuery, lodash). Pintura via `style.backgroundColor` inline com alpha 0x2E (~18%). Mapeamento `lead → pipeline` por `GET /api/v4/leads/{id}` cacheado em `localStorage` (TTL 10min hit / 1min miss).

**Tech Stack:** Vanilla JS (ES5-safe — Kommo widget ambiente), jQuery, lodash `_.template`, `fetch`, `localStorage`, `MutationObserver`.

**Constraints relevantes:**
- Não é repositório git — sem `git commit` entre tasks
- Sem framework de testes — verificação por smoke manual no Kommo após cada task crítica
- Spec: `docs/superpowers/specs/2026-04-25-widcolor-inbox-design.md`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `manifest.json` | Manifesto: locations, settings (`pipeline_colors`), versão |
| `script.js` | Tudo: 6 módulos + callbacks. Único entry point AMD. |
| `templates/settings.html` | UI de configuração: lista de funis + color picker + preview |
| `style.css` | Estilos da página de settings (a pintura do inbox/chat é inline) |
| `i18n/pt.json`, `i18n/en.json` | Strings traduzidas |
| `images/logo.png`, `images/logo.svg` | Mantém |
| `README.md` | Atualizar pra refletir o objetivo real |
| `WidColor.zip` | Recompactar no fim |

Os 6 módulos do `script.js` ficam em seções claramente separadas (mesmo arquivo). Não fazer split em arquivos separados — Kommo carrega um único `script.js` via AMD.

---

## Task 0: Discovery dos seletores reais da Kommo (manual, no navegador)

**Files:** Nenhum — investigação interativa.

**Por quê:** Os seletores CSS reais do DOM do inbox e do header do chat aberto, e a forma como a Kommo expõe `lead_id` em cada linha do inbox, são desconhecidos. Tentar adivinhar trava as Tasks 7 e 8.

- [ ] **Step 1: Abrir DevTools no Kommo na URL `/chats/...` e colar o script de descoberta no console**

```javascript
// === WIDCOLOR DISCOVERY SCRIPT ===
(function () {
  var report = {};

  // 1. APP.constant pipelines
  try {
    var pipelines = APP.constant('account').pipelines;
    report.pipelines_sample = Object.keys(pipelines).slice(0, 2).map(function (k) {
      return { id: pipelines[k].id, name: pipelines[k].name };
    });
    report.pipelines_count = Object.keys(pipelines).length;
  } catch (e) { report.pipelines_error = String(e); }

  // 2. Inbox container candidates
  var inboxCandidates = [
    '.chats-list', '.ka-inbox', '[class*="inbox"]',
    '.feed-list', '[class*="chat-list"]', '[class*="conversations"]'
  ];
  report.inbox_containers = inboxCandidates.map(function (sel) {
    var el = document.querySelector(sel);
    return { sel: sel, found: !!el, classList: el ? el.className : null };
  }).filter(function (r) { return r.found; });

  // 3. Inbox row + lead_id
  var rowSelectors = [
    '.feed-list-item', '[class*="conversation"]', '[class*="chat-item"]',
    '[data-lead-id]', '[data-id]', 'a[href*="/leads/detail/"]'
  ];
  report.row_candidates = rowSelectors.map(function (sel) {
    var nodes = document.querySelectorAll(sel);
    return { sel: sel, count: nodes.length, sample_outer_html: nodes[0] ? nodes[0].outerHTML.slice(0, 400) : null };
  }).filter(function (r) { return r.count > 0; });

  // 4. Chat header
  var headerCandidates = ['.feed-compose', '.feed-compose__inner', '[class*="chat-header"]', '.feed-head'];
  report.header_candidates = headerCandidates.map(function (sel) {
    var el = document.querySelector(sel);
    return { sel: sel, found: !!el };
  }).filter(function (r) { return r.found; });

  // 5. Sample lead API response
  var leadIdMatch = location.pathname.match(/leads\/detail\/(\d+)/);
  if (leadIdMatch) {
    fetch('/api/v4/leads/' + leadIdMatch[1])
      .then(function (r) { return r.json(); })
      .then(function (data) {
        report.lead_api_keys = Object.keys(data);
        report.lead_api_pipeline_id = data.pipeline_id;
        console.log('=== WIDCOLOR DISCOVERY ===');
        console.log(JSON.stringify(report, null, 2));
      });
  } else {
    console.log('=== WIDCOLOR DISCOVERY (no lead open) ===');
    console.log(JSON.stringify(report, null, 2));
  }
})();
```

- [ ] **Step 2: Anotar resultados em `docs/superpowers/specs/2026-04-25-widcolor-inbox-design.md` na seção "Pontos a descobrir"**

Substituir cada item pendente pelo seletor real encontrado. Salvar variáveis fixas que serão usadas nas Tasks 7 e 8:
- `INBOX_ROW_SELECTOR`
- `LEAD_ID_EXTRACTOR` (atributo `data-*` ou regex no `href`)
- `CHAT_HEADER_SELECTOR`
- Confirmação de `APP.constant('account').pipelines` retorna `{<id>: {id, name, ...}}`
- Confirmação de `data.pipeline_id` na resposta de `/api/v4/leads/{id}`

- [ ] **Step 3: Verificar manual**

Verificar visualmente no DevTools (Inspect Element) que o seletor escolhido para `INBOX_ROW_SELECTOR` realmente bate em todas as linhas visíveis do inbox.

---

## Task 1: Atualizar manifest.json

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/manifest.json`

- [ ] **Step 1: Substituir todo o conteúdo**

```json
{
  "widget": {
    "name": "widget.name",
    "description": "widget.description",
    "short_description": "widget.short_description",
    "code": "widcolor",
    "version": "2.0.0",
    "icon": "/images/logo.png",
    "settings_page": "/templates/settings.html",
    "support": {
      "link": "https://example.com",
      "email": "suporte@example.com"
    },
    "delivery": 0,
    "is_payment": false
  },
  "locations": [
    "chats",
    "settings"
  ],
  "settings": {
    "pipeline_colors": {
      "name": "settings.pipeline_colors",
      "type": "text",
      "required": false,
      "default": "{}"
    }
  }
}
```

- [ ] **Step 2: Validar JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('D:/Documentos/Aplicativos/WidColor/manifest.json','utf8'))"`
Expected: nenhum output (parse OK).

---

## Task 2: Esqueleto novo do script.js (substitui o atual)

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/script.js` (substituição completa)

- [ ] **Step 1: Substituir todo o conteúdo pelo esqueleto**

```javascript
/**
 * WidColor v2.0.0 — Pintura do inbox da Kommo por funil.
 */
define(['jquery'], function ($) {
  'use strict';

  return function (self, system) {

    var WIDGET_CODE = 'widcolor';
    var ALPHA_HEX = '2E'; // ~18% opacidade
    var CACHE_TTL_HIT_MS = 10 * 60 * 1000;
    var CACHE_TTL_MISS_MS = 1 * 60 * 1000;
    var DEBOUNCE_MS = 100;
    var CACHE_KEY_PREFIX = 'widcolor:lead:';

    function log() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[WIDCOLOR]');
      try { console.log.apply(console, args); } catch (e) {}
    }

    function debounce(fn, ms) {
      var t = null;
      return function () {
        var ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, ms);
      };
    }

    // === MODULES (stubs) ===
    var PipelineRegistry = { load: function () {}, list: function () { return []; } };
    var ColorMap = { load: function () {}, get: function () { return undefined; } };
    var LeadResolver = { resolve: function () { return Promise.resolve(null); } };
    var InboxPainter = { start: function () {}, stop: function () {}, tick: function () {} };
    var ChatHeaderPainter = { start: function () {}, stop: function () {}, tick: function () {} };
    var SettingsUI = { render: function () {} };

    // === CALLBACKS ===
    self.callbacks = {
      render: function () {
        log('render() area=', system.area);
        return true;
      },
      init: function () {
        log('init()');
        return true;
      },
      bind_actions: function () {
        log('bind_actions()');
        return true;
      },
      settings: function () {
        log('settings()');
        return true;
      },
      advancedSettings: function () { return true; },
      destroy: function () {
        log('destroy()');
        return true;
      },
      onSave: function () {
        log('onSave()');
        return true;
      }
    };

    // expose for smoke debugging from console: window._widcolor
    try {
      window._widcolor = {
        PipelineRegistry: PipelineRegistry,
        ColorMap: ColorMap,
        LeadResolver: LeadResolver,
        InboxPainter: InboxPainter,
        ChatHeaderPainter: ChatHeaderPainter
      };
    } catch (e) {}
  };
});
```

- [ ] **Step 2: Smoke check (após repack na Task 13)**

Após upload do widget, abrir uma página da Kommo, abrir DevTools, ver no console:
```
[WIDCOLOR] init()
[WIDCOLOR] bind_actions()
[WIDCOLOR] render() area= ...
```

(Esse smoke é diferido pra Task 14 — agora apenas validar sintaxe.)

- [ ] **Step 3: Validar sintaxe**

Run: `node --check D:/Documentos/Aplicativos/WidColor/script.js`
Expected: nenhum output (sintaxe OK).

---

## Task 3: Implementar PipelineRegistry

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/script.js` — substituir o stub `PipelineRegistry`

- [ ] **Step 1: Substituir o stub**

Localizar a linha:
```javascript
var PipelineRegistry = { load: function () {}, list: function () { return []; } };
```

Substituir por:
```javascript
var PipelineRegistry = (function () {
  var _list = [];
  return {
    load: function () {
      try {
        var account = APP.constant('account');
        var pipelinesObj = (account && account.pipelines) || {};
        _list = Object.keys(pipelinesObj).map(function (k) {
          return { id: String(pipelinesObj[k].id), name: pipelinesObj[k].name };
        });
        log('PipelineRegistry loaded', _list.length, 'pipelines');
      } catch (e) {
        log('PipelineRegistry load error', e);
        _list = [];
      }
    },
    list: function () { return _list.slice(); }
  };
})();
```

- [ ] **Step 2: Chamar `PipelineRegistry.load()` em `init`**

Localizar:
```javascript
init: function () {
  log('init()');
  return true;
},
```
Substituir por:
```javascript
init: function () {
  log('init()');
  PipelineRegistry.load();
  return true;
},
```

- [ ] **Step 3: Atualizar a exposição em `window._widcolor`**

A linha `PipelineRegistry: PipelineRegistry` já está lá. Sem mudança.

- [ ] **Step 4: Validar sintaxe**

Run: `node --check D:/Documentos/Aplicativos/WidColor/script.js`

---

## Task 4: Implementar ColorMap

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/script.js` — substituir o stub `ColorMap`

- [ ] **Step 1: Substituir o stub**

```javascript
var ColorMap = (function () {
  var _map = {};
  return {
    load: function () {
      _map = {};
      try {
        var settings = self.get_settings() || {};
        var raw = settings.pipeline_colors;
        if (typeof raw === 'string' && raw.length) {
          _map = JSON.parse(raw) || {};
        } else if (raw && typeof raw === 'object') {
          _map = raw;
        }
        log('ColorMap loaded', Object.keys(_map).length, 'colors');
      } catch (e) {
        log('ColorMap load error', e);
        _map = {};
      }
    },
    get: function (pipelineId) {
      if (pipelineId == null) return undefined;
      return _map[String(pipelineId)] || undefined;
    },
    all: function () {
      var copy = {};
      Object.keys(_map).forEach(function (k) { copy[k] = _map[k]; });
      return copy;
    }
  };
})();
```

- [ ] **Step 2: Chamar `ColorMap.load()` em `init` (após `PipelineRegistry.load()`)**

```javascript
init: function () {
  log('init()');
  PipelineRegistry.load();
  ColorMap.load();
  return true;
},
```

- [ ] **Step 3: Adicionar `ColorMap` à exposição (já presente, confirmar)**

- [ ] **Step 4: Validar sintaxe**

Run: `node --check D:/Documentos/Aplicativos/WidColor/script.js`

---

## Task 5: Implementar LeadResolver com cache

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/script.js` — substituir o stub `LeadResolver`

- [ ] **Step 1: Substituir o stub**

```javascript
var LeadResolver = (function () {
  var _mem = {}; // leadId -> { p: pipelineId|null, expiresAt: ts }
  var _inflight = {}; // leadId -> Promise

  function readLocal(leadId) {
    try {
      var raw = localStorage.getItem(CACHE_KEY_PREFIX + leadId);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.t !== 'number') return null;
      var ttl = parsed.p == null ? CACHE_TTL_MISS_MS : CACHE_TTL_HIT_MS;
      if (Date.now() - parsed.t > ttl) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeLocal(leadId, pipelineId) {
    try {
      localStorage.setItem(
        CACHE_KEY_PREFIX + leadId,
        JSON.stringify({ p: pipelineId == null ? null : String(pipelineId), t: Date.now() })
      );
    } catch (e) {}
  }

  function fetchPipeline(leadId) {
    return fetch('/api/v4/leads/' + encodeURIComponent(leadId), {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    }).then(function (r) {
      if (!r.ok) {
        log('LeadResolver fetch non-OK', leadId, r.status);
        return null;
      }
      return r.json();
    }).then(function (data) {
      if (!data || data.pipeline_id == null) return null;
      return String(data.pipeline_id);
    }).catch(function (e) {
      log('LeadResolver fetch error', leadId, e);
      return null;
    });
  }

  return {
    resolve: function (leadId) {
      if (leadId == null) return Promise.resolve(null);
      leadId = String(leadId);

      // 1. mem cache
      var memHit = _mem[leadId];
      if (memHit && Date.now() < memHit.expiresAt) {
        return Promise.resolve(memHit.p);
      }

      // 2. localStorage cache
      var local = readLocal(leadId);
      if (local) {
        var ttl = local.p == null ? CACHE_TTL_MISS_MS : CACHE_TTL_HIT_MS;
        _mem[leadId] = { p: local.p, expiresAt: local.t + ttl };
        return Promise.resolve(local.p);
      }

      // 3. coalesce inflight
      if (_inflight[leadId]) return _inflight[leadId];

      // 4. fetch
      var promise = fetchPipeline(leadId).then(function (pipelineId) {
        var ttl = pipelineId == null ? CACHE_TTL_MISS_MS : CACHE_TTL_HIT_MS;
        _mem[leadId] = { p: pipelineId, expiresAt: Date.now() + ttl };
        writeLocal(leadId, pipelineId);
        delete _inflight[leadId];
        return pipelineId;
      }).catch(function (e) {
        delete _inflight[leadId];
        return null;
      });

      _inflight[leadId] = promise;
      return promise;
    },

    clearCache: function () {
      _mem = {};
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf(CACHE_KEY_PREFIX) === 0) localStorage.removeItem(k);
        }
      } catch (e) {}
    }
  };
})();
```

- [ ] **Step 2: Validar sintaxe**

Run: `node --check D:/Documentos/Aplicativos/WidColor/script.js`

- [ ] **Step 3: Smoke (diferido até Task 14)**

No DevTools após widget carregado:
```javascript
window._widcolor.LeadResolver.resolve('20310999').then(function(p) { console.log('pipeline:', p); });
```
Expected: imprime o pipeline_id do lead. Segunda chamada deve ser instantânea (cache).

---

## Task 6: Implementar InboxPainter

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/script.js` — substituir o stub `InboxPainter`

**Pré-requisito:** Task 0 concluída — `INBOX_ROW_SELECTOR` e `LEAD_ID_EXTRACTOR` definidos.

> **Nota:** os seletores abaixo (`a[href*="/leads/detail/"]`) são um *placeholder pragmático* baseado em padrão visto no print. Substitua pelos valores reais descobertos na Task 0. O placeholder funciona se cada linha do inbox tiver um link interno pra `/leads/detail/{id}`.

- [ ] **Step 1: Adicionar constantes no topo do `return function (self, system) {` (logo abaixo das constantes existentes)**

```javascript
// === SELETORES (descobertos na Task 0 — substitua se necessário) ===
var INBOX_ROW_SELECTOR = 'a[href*="/leads/detail/"]';
var INBOX_LEAD_ID_REGEX = /\/leads\/detail\/(\d+)/;
var CHAT_HEADER_SELECTOR = '.feed-compose, .feed-compose__inner';
var INBOX_PAINTED_ATTR = 'data-widcolor-painted';
```

- [ ] **Step 2: Substituir o stub `InboxPainter`**

```javascript
var InboxPainter = (function () {
  var _observer = null;

  function extractLeadId(node) {
    if (!node) return null;
    if (node.dataset && node.dataset.leadId) return node.dataset.leadId;
    var href = node.getAttribute && node.getAttribute('href');
    if (href) {
      var m = href.match(INBOX_LEAD_ID_REGEX);
      if (m) return m[1];
    }
    return null;
  }

  function findRowContainer(linkNode) {
    // sobe até encontrar um elemento que pareça ser a "linha" — heurística:
    // o primeiro ancestral que contém múltiplos filhos (avatar, texto, hora)
    var cur = linkNode;
    for (var i = 0; i < 5 && cur && cur !== document.body; i++) {
      if (cur.children && cur.children.length >= 2) return cur;
      cur = cur.parentElement;
    }
    return linkNode;
  }

  function paintRow(linkNode, color) {
    var row = findRowContainer(linkNode);
    if (color) {
      row.style.backgroundColor = color + ALPHA_HEX;
      row.setAttribute(INBOX_PAINTED_ATTR, '1');
    } else if (row.getAttribute(INBOX_PAINTED_ATTR)) {
      row.style.backgroundColor = '';
      row.removeAttribute(INBOX_PAINTED_ATTR);
    }
  }

  var tick = debounce(function () {
    var rows = document.querySelectorAll(INBOX_ROW_SELECTOR);
    if (!rows.length) return;
    rows.forEach(function (linkNode) {
      var leadId = extractLeadId(linkNode);
      if (!leadId) return;
      LeadResolver.resolve(leadId).then(function (pipelineId) {
        var color = ColorMap.get(pipelineId);
        paintRow(linkNode, color);
      });
    });
  }, DEBOUNCE_MS);

  return {
    start: function () {
      if (_observer) return;
      _observer = new MutationObserver(tick);
      _observer.observe(document.body, { subtree: true, childList: true });
      tick();
      log('InboxPainter started');
    },
    stop: function () {
      if (_observer) { _observer.disconnect(); _observer = null; }
      // limpa pintura
      var painted = document.querySelectorAll('[' + INBOX_PAINTED_ATTR + ']');
      painted.forEach(function (el) {
        el.style.backgroundColor = '';
        el.removeAttribute(INBOX_PAINTED_ATTR);
      });
      log('InboxPainter stopped');
    },
    tick: tick
  };
})();
```

- [ ] **Step 3: Validar sintaxe**

Run: `node --check D:/Documentos/Aplicativos/WidColor/script.js`

---

## Task 7: Implementar ChatHeaderPainter

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/script.js` — substituir o stub `ChatHeaderPainter`

- [ ] **Step 1: Substituir o stub**

```javascript
var ChatHeaderPainter = (function () {
  var _lastPaintedLeadId = null;
  var CHAT_HEADER_PAINTED_ATTR = 'data-widcolor-header-painted';

  function getOpenLeadId() {
    var m = location.pathname.match(/\/leads\/detail\/(\d+)/);
    return m ? m[1] : null;
  }

  function clearHeader() {
    var els = document.querySelectorAll('[' + CHAT_HEADER_PAINTED_ATTR + ']');
    els.forEach(function (el) {
      el.style.backgroundColor = '';
      el.removeAttribute(CHAT_HEADER_PAINTED_ATTR);
    });
  }

  var tick = debounce(function () {
    var leadId = getOpenLeadId();
    if (!leadId) {
      clearHeader();
      _lastPaintedLeadId = null;
      return;
    }
    LeadResolver.resolve(leadId).then(function (pipelineId) {
      var color = ColorMap.get(pipelineId);
      var headers = document.querySelectorAll(CHAT_HEADER_SELECTOR);
      if (!headers.length) return;
      if (color) {
        headers.forEach(function (h) {
          h.style.backgroundColor = color + ALPHA_HEX;
          h.setAttribute(CHAT_HEADER_PAINTED_ATTR, '1');
        });
      } else {
        clearHeader();
      }
      _lastPaintedLeadId = leadId;
    });
  }, DEBOUNCE_MS);

  return {
    start: function () { tick(); log('ChatHeaderPainter started'); },
    stop: function () { clearHeader(); _lastPaintedLeadId = null; log('ChatHeaderPainter stopped'); },
    tick: tick
  };
})();
```

- [ ] **Step 2: Validar sintaxe**

Run: `node --check D:/Documentos/Aplicativos/WidColor/script.js`

---

## Task 8: Wire-up dos callbacks

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/script.js` — atualizar `self.callbacks`

- [ ] **Step 1: Substituir todo o bloco `self.callbacks = { ... };`**

```javascript
self.callbacks = {
  render: function () {
    log('render() area=', system.area);
    return true;
  },
  init: function () {
    log('init()');
    PipelineRegistry.load();
    ColorMap.load();
    return true;
  },
  bind_actions: function () {
    log('bind_actions()');
    if (system.area !== 'settings') {
      InboxPainter.start();
      ChatHeaderPainter.start();
    }
    return true;
  },
  settings: function () {
    log('settings()');
    SettingsUI.render();
    return true;
  },
  advancedSettings: function () { return true; },
  destroy: function () {
    log('destroy()');
    InboxPainter.stop();
    ChatHeaderPainter.stop();
    return true;
  },
  onSave: function () {
    log('onSave()');
    ColorMap.load();
    InboxPainter.tick();
    ChatHeaderPainter.tick();
    return true;
  }
};
```

- [ ] **Step 2: Validar sintaxe**

Run: `node --check D:/Documentos/Aplicativos/WidColor/script.js`

---

## Task 9: Implementar SettingsUI (lado JS)

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/script.js` — substituir o stub `SettingsUI`

- [ ] **Step 1: Substituir o stub**

```javascript
var SettingsUI = (function () {
  function paintPreviewRow($row, color) {
    if (color) $row.css('background-color', color + ALPHA_HEX);
    else $row.css('background-color', '');
  }

  function buildRowsHtml(pipelines, colors) {
    if (!pipelines.length) {
      return '<div class="widcolor-empty">Nenhum funil encontrado nesta conta.</div>';
    }
    return pipelines.map(function (p) {
      var c = colors[p.id] || '';
      var pickerVal = c || '#3498db';
      return (
        '<div class="widcolor-pipeline-row" data-pipeline-id="' + p.id + '">' +
          '<div class="widcolor-pipeline-name">' + escapeHtml(p.name) + '</div>' +
          '<input type="color" class="widcolor-pipeline-color" value="' + pickerVal + '" data-has-color="' + (c ? '1' : '0') + '">' +
          '<input type="text" class="widcolor-pipeline-color-text" value="' + (c || '') + '" placeholder="(sem cor)" maxlength="7">' +
          '<button type="button" class="widcolor-pipeline-clear">Limpar</button>' +
        '</div>'
      );
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function readUI() {
    var result = {};
    $('.widcolor-pipeline-row').each(function () {
      var $row = $(this);
      var pid = $row.attr('data-pipeline-id');
      var $picker = $row.find('.widcolor-pipeline-color');
      var hasColor = $picker.attr('data-has-color') === '1';
      if (hasColor) {
        var hex = $row.find('.widcolor-pipeline-color-text').val();
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) result[pid] = hex.toLowerCase();
      }
    });
    return result;
  }

  function bindRowEvents($container) {
    $container.on('input change', '.widcolor-pipeline-color', function () {
      var $row = $(this).closest('.widcolor-pipeline-row');
      var val = $(this).val();
      $(this).attr('data-has-color', '1');
      $row.find('.widcolor-pipeline-color-text').val(val);
      updatePreview();
    });
    $container.on('input', '.widcolor-pipeline-color-text', function () {
      var $row = $(this).closest('.widcolor-pipeline-row');
      var val = $(this).val();
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        $row.find('.widcolor-pipeline-color').val(val).attr('data-has-color', '1');
      }
      updatePreview();
    });
    $container.on('click', '.widcolor-pipeline-clear', function () {
      var $row = $(this).closest('.widcolor-pipeline-row');
      $row.find('.widcolor-pipeline-color').attr('data-has-color', '0');
      $row.find('.widcolor-pipeline-color-text').val('');
      updatePreview();
    });
  }

  function updatePreview() {
    var colors = readUI();
    var pipelines = PipelineRegistry.list();
    $('.widcolor-preview-row').each(function (i) {
      var pipeline = pipelines[i];
      if (!pipeline) return;
      paintPreviewRow($(this), colors[pipeline.id]);
      $(this).find('.widcolor-preview-row__pipeline').text(pipeline.name);
    });
  }

  // Hidden field that the Kommo widget framework picks up on save.
  // We sync our internal state into <input data-setting="pipeline_colors">
  function syncHiddenField() {
    var json = JSON.stringify(readUI());
    $('#widcolor_pipeline_colors').val(json);
  }

  return {
    render: function () {
      var pipelines = PipelineRegistry.list();
      var colors = ColorMap.all();

      // Renderiza no template (settings.html já será renderizado pelo Kommo;
      // aqui populamos as áreas dinâmicas após o render).
      setTimeout(function () {
        var $list = $('#widcolor_pipeline_list');
        if (!$list.length) return;
        $list.html(buildRowsHtml(pipelines, colors));
        bindRowEvents($list);

        // Renderiza preview com até 4 linhas
        var $preview = $('#widcolor_preview');
        if ($preview.length) {
          var previewRows = '';
          for (var i = 0; i < Math.min(4, pipelines.length); i++) {
            previewRows += '<div class="widcolor-preview-row"><span class="widcolor-preview-row__avatar"></span><div class="widcolor-preview-row__body"><div class="widcolor-preview-row__pipeline">' + escapeHtml(pipelines[i].name) + '</div><div class="widcolor-preview-row__msg">Lead exemplo · mensagem...</div></div></div>';
          }
          $preview.html(previewRows);
        }

        // Sync inicial e em cada mudança
        syncHiddenField();
        $list.on('input change click', function () {
          syncHiddenField();
          updatePreview();
        });
        updatePreview();
      }, 100);
    }
  };
})();
```

- [ ] **Step 2: Validar sintaxe**

Run: `node --check D:/Documentos/Aplicativos/WidColor/script.js`

---

## Task 10: Reescrever templates/settings.html

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/templates/settings.html` (substituição completa)

- [ ] **Step 1: Substituir todo o conteúdo**

```html
<div class="widcolor-settings">

  <div class="widcolor-settings__header">
    <h3>WidColor — Cor por Funil</h3>
    <p>Escolha uma cor para cada funil. As linhas do inbox serão pintadas com essa cor (translúcida) para identificação visual rápida. Funis sem cor não recebem pintura.</p>
  </div>

  <div class="widcolor-settings__section">
    <div class="widcolor-settings__section-title">Funis da conta</div>
    <div id="widcolor_pipeline_list" class="widcolor-pipeline-list">
      <div class="widcolor-empty">Carregando funis...</div>
    </div>
  </div>

  <div class="widcolor-settings__section">
    <div class="widcolor-settings__section-title">Pré-visualização</div>
    <div id="widcolor_preview" class="widcolor-preview"></div>
  </div>

  <!-- Campo escondido lido pelo framework do Kommo no save.
       O JS sincroniza o JSON aqui antes do botão Salvar ser clicado. -->
  <input type="hidden" id="widcolor_pipeline_colors" data-setting="pipeline_colors" name="pipeline_colors" value="{}">

</div>
```

- [ ] **Step 2: Validar HTML básico**

Run: `node -e "var fs=require('fs'); var s=fs.readFileSync('D:/Documentos/Aplicativos/WidColor/templates/settings.html','utf8'); if(s.indexOf('widcolor_pipeline_colors')<0) throw 'missing hidden field'; console.log('OK');"`
Expected: `OK`

---

## Task 11: Reescrever style.css

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/style.css` (substituição completa)

- [ ] **Step 1: Substituir todo o conteúdo**

```css
/* WidColor v2 — estilos da página de configuração */

.widcolor-settings {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding: 16px;
  max-width: 720px;
}

.widcolor-settings__header h3 {
  margin: 0 0 4px;
  font-size: 18px;
}
.widcolor-settings__header p {
  margin: 0 0 20px;
  color: #666;
  font-size: 13px;
  line-height: 1.5;
}

.widcolor-settings__section {
  margin-bottom: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 16px;
}

.widcolor-settings__section-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.widcolor-pipeline-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.widcolor-empty {
  color: #6b7280;
  font-size: 13px;
  font-style: italic;
}

.widcolor-pipeline-row {
  display: grid;
  grid-template-columns: 1fr 40px 100px 80px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fafafa;
}

.widcolor-pipeline-name {
  font-size: 14px;
  color: #111827;
}

.widcolor-pipeline-color {
  width: 40px;
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  background: transparent;
}

.widcolor-pipeline-color-text {
  width: 100%;
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 8px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
}

.widcolor-pipeline-clear {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: #6b7280;
}
.widcolor-pipeline-clear:hover {
  background: #f3f4f6;
  color: #111827;
}

.widcolor-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.widcolor-preview-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid #f3f4f6;
}

.widcolor-preview-row__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e5e7eb;
  flex-shrink: 0;
}

.widcolor-preview-row__body {
  flex: 1;
  min-width: 0;
}

.widcolor-preview-row__pipeline {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.widcolor-preview-row__msg {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

---

## Task 12: Atualizar i18n

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/i18n/pt.json`
- Modify: `D:/Documentos/Aplicativos/WidColor/i18n/en.json`

- [ ] **Step 1: Substituir `pt.json`**

```json
{
  "widget": {
    "name": "WidColor — Cor por Funil",
    "description": "Pinta o fundo de cada conversa do inbox com uma cor associada ao funil do lead, para identificação visual rápida.",
    "short_description": "Pinta o inbox com a cor do funil de cada lead."
  },
  "settings": {
    "pipeline_colors": "Cores dos funis"
  }
}
```

- [ ] **Step 2: Substituir `en.json`**

```json
{
  "widget": {
    "name": "WidColor — Pipeline Color",
    "description": "Tints each inbox conversation with a color associated with the lead's pipeline, for quick visual identification.",
    "short_description": "Tint the inbox with each lead's pipeline color."
  },
  "settings": {
    "pipeline_colors": "Pipeline colors"
  }
}
```

- [ ] **Step 3: Validar JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('D:/Documentos/Aplicativos/WidColor/i18n/pt.json','utf8'))" && node -e "JSON.parse(require('fs').readFileSync('D:/Documentos/Aplicativos/WidColor/i18n/en.json','utf8'))"
```
Expected: nenhum output (parse OK).

---

## Task 13: Atualizar README.md

**Files:**
- Modify: `D:/Documentos/Aplicativos/WidColor/README.md` (substituição completa)

- [ ] **Step 1: Substituir todo o conteúdo**

```markdown
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
```

---

## Task 14: Recompactar WidColor.zip

**Files:**
- Delete + recreate: `D:/Documentos/Aplicativos/WidColor/WidColor.zip`

- [ ] **Step 1: Apagar zip antigo**

Run: `rm -f "D:/Documentos/Aplicativos/WidColor/WidColor.zip"`

- [ ] **Step 2: Criar zip novo (sem README, sem docs/, sem o próprio zip)**

```bash
cd "D:/Documentos/Aplicativos/WidColor" && zip -r WidColor.zip manifest.json script.js style.css i18n images templates -x "*.DS_Store"
```
Expected: lista de arquivos adicionados, `manifest.json` no topo (raiz).

- [ ] **Step 3: Verificar conteúdo do zip**

Run: `unzip -l "D:/Documentos/Aplicativos/WidColor/WidColor.zip"`
Expected: arquivos com `manifest.json` na raiz; sem pasta wrapper; sem `docs/`, sem `README.md`, sem `WidColor.zip`.

---

## Task 15: Smoke test no navegador (manual, do usuário)

**Files:** Nenhum.

**Por quê:** Único nível de teste real possível pra widget Kommo. Executa o checklist do README.

- [ ] **Step 1: Subir o `WidColor.zip` na Kommo (Configurações → Integrações → Criar integração)**
- [ ] **Step 2: Instalar o widget na conta**
- [ ] **Step 3: Abrir DevTools no Kommo, ir pra `/chats/...`**
- [ ] **Step 4: Ver no console:**
  ```
  [WIDCOLOR] init()
  [WIDCOLOR] PipelineRegistry loaded N pipelines
  [WIDCOLOR] ColorMap loaded 0 colors
  [WIDCOLOR] bind_actions()
  [WIDCOLOR] InboxPainter started
  [WIDCOLOR] ChatHeaderPainter started
  ```
- [ ] **Step 5: Abrir settings do widget → ver lista de funis**
- [ ] **Step 6: Configurar 2 funis com cores distintas e salvar**
- [ ] **Step 7: Voltar pra `/chats/...` → verificar que linhas dos leads desses funis aparecem pintadas**
- [ ] **Step 8: Abrir uma conversa de um lead daqueles funis → verificar header pintado**
- [ ] **Step 9: Limpar cor de um funil e salvar → linhas voltam ao normal**
- [ ] **Step 10: Refresh F5 → cores persistem**

Se algum step falhar, anotar o erro do console e voltar pra task correspondente:
- Logs `[WIDCOLOR]` ausentes → script.js com erro de sintaxe ou manifest.json com erro
- "0 pipelines" → `APP.constant('account').pipelines` não funciona → revisitar Task 0/3
- Linhas não pintam → seletor `INBOX_ROW_SELECTOR` errado → revisitar Task 0/6
- Header não pinta → `CHAT_HEADER_SELECTOR` errado → revisitar Task 0/7
- Settings UI vazia → erro no template ou `SettingsUI.render()` → revisitar Task 9/10

---

## Self-Review Notes (concluído antes do handoff)

**Spec coverage:** Todas as decisões 1-6 do spec endereçadas:
- D1 (cor manual) → Tasks 9, 10 (Settings UI)
- D2 (alpha 18%) → constante `ALPHA_HEX = '2E'` em Task 2
- D3 (inbox + chat header) → Tasks 6, 7
- D4 (sem cor → não pinta) → lógica em Task 6/7 (`if (color) ... else ...`)
- D5 (settings da conta) → manifest `settings.pipeline_colors` em Task 1
- D6 (API por lead com cache) → Task 5 (LeadResolver)

**Placeholders:** Os seletores DOM são **placeholders pragmáticos** explicitamente sinalizados na Task 6 e dependem da Task 0 (discovery). Isso é aceitável porque a Task 0 é uma investigação genuinamente interativa que não tem como ser pré-resolvida no plano.

**Type consistency:** Verificado:
- `pipelineId` sempre tratado como `String`
- `ColorMap.get()` retorna `'#hex' | undefined`
- `LeadResolver.resolve()` retorna `Promise<String|null>`
- `INBOX_PAINTED_ATTR` e `CHAT_HEADER_PAINTED_ATTR` consistentes entre seus painters
