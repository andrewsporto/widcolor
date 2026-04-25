# 🎨 WidColor - Widget Kommo

Widget de personalização de cores para o Kommo (antigo amoCRM).

Permite customizar as cores dos cards de Leads, Contatos e Empresas, criando uma experiência visual única e adaptada ao seu fluxo de trabalho.

## 📋 Funcionalidades

- **4 cores customizáveis**: Primária, Secundária, Destaque e Fundo
- **Aplicação seletiva**: Ative/desative por tipo de entidade (Leads, Contatos, Empresas)
- **Preview em tempo real**: Visualize as cores antes de salvar
- **Botão na sidebar**: Acesse rapidamente pelo card
- **MutationObserver**: Estilos re-aplicados automaticamente ao atualizar o card

## 📁 Estrutura do Projeto

```
WidColor/
├── manifest.json              # Manifesto do widget (Kommo)
├── script.js                  # Lógica principal do widget
├── style.css                  # Estilos base + UI de configurações
├── images/
│   ├── logo.svg               # Logo vetorial
│   └── logo.png               # Logo raster (120x120)
├── i18n/
│   ├── pt.json                # Tradução Português (Brasil)
│   └── en.json                # Tradução Inglês
├── templates/
│   └── settings.html          # Templates de configurações e modal
└── README.md
```

## 🚀 Instalação

### Via Kommo Marketplace
1. Acesse **Configurações** → **Widgets**
2. Busque por **WidColor**
3. Clique em **Instalar**

### Via Upload Manual
1. Compacte todos os arquivos em um `.zip`
2. Acesse **Configurações** → **Widgets** → **Upload Widget**
3. Selecione o arquivo `.zip`
4. Siga as instruções de instalação

### Via Desenvolvimento Local
1. Hospede os arquivos em um servidor HTTPS acessível
2. Registre o widget no Kommo via API
3. Configure a URL do widget no registro

## ⚙️ Configuração

Após instalar, acesse as configurações do widget:

| Configuração | Tipo | Padrão | Descrição |
|---|---|---|---|
| Cor Primária | Color | `#3498db` | Cor principal (bordas, botões) |
| Cor Secundária | Color | `#2ecc71` | Tags e elementos secundários |
| Cor de Destaque | Color | `#e74c3c` | Badges e alertas |
| Cor de Fundo | Color | `#2c3e50` | Fundo de elementos especiais |
| Leads | Checkbox | ✅ | Aplicar nos cards de Leads |
| Contatos | Checkbox | ✅ | Aplicar nos cards de Contatos |
| Empresas | Checkbox | ✅ | Aplicar nos cards de Empresas |

## 🛠️ Desenvolvimento

### Requisitos
- Navegador moderno com suporte a ES6+
- Kommo (conta com acesso a widgets)

### Modificando o Widget
1. Edite os arquivos conforme necessário
2. Teste localmente se possível
3. Faça upload da nova versão no Kommo

### Callbacks do Widget
O widget implementa os seguintes callbacks do ciclo de vida Kommo:

- `render()` — Renderização inicial, aplica cores ao card
- `init()` — Inicialização, carrega configurações
- `bind_actions()` — Liga eventos, inicia MutationObserver
- `settings()` — Página de configurações
- `destroy()` — Limpeza ao remover o widget
- `onSave()` — Após salvar configurações

## 📝 Versão

- **1.0.0** — Versão inicial
  - Personalização de 4 cores
  - Aplicação seletiva por entidade
  - Preview em tempo real
  - Botão na sidebar do card
  - i18n (PT-BR, EN)

## 📄 Licença

Este projeto é proprietário. Todos os direitos reservados.