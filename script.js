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

    // === SELETORES (descobertos na Task 0 — substitua se necessário) ===
    var INBOX_ROW_SELECTOR = 'a[href*="/leads/detail/"]';
    var INBOX_LEAD_ID_REGEX = /\/leads\/detail\/(\d+)/;
    var CHAT_HEADER_SELECTOR = '.feed-compose, .feed-compose__inner';
    var INBOX_PAINTED_ATTR = 'data-widcolor-painted';

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

    // === MODULES ===
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
          var persistedJson = JSON.stringify(colors);

          // Sync persisted colors into the hidden field as soon as it appears,
          // so a fast Save (before the UI is fully rendered) doesn't wipe config.
          function syncPersistedToHidden() {
            var $h = $('#widcolor_pipeline_colors');
            if ($h.length) { $h.val(persistedJson); return true; }
            return false;
          }
          if (!syncPersistedToHidden()) {
            var attempts = 0;
            var iv = setInterval(function () {
              if (syncPersistedToHidden() || ++attempts >= 20) clearInterval(iv);
            }, 25);
          }

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

    // === CALLBACKS ===
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
