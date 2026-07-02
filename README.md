# LySinc - Visualizador de Letras Sincronizadas do Spotify

O **LySinc** é um visualizador de letras sincronizadas em tempo real para o Spotify. Ele roda 100% no lado do cliente (Client-Side), sem a necessidade de servidores backend ou bancos de dados adicionais, sendo perfeito para hospedagem gratuita no **GitHub Pages**.

Inspirado no visual imersivo e fluido do **Apple Music**, o aplicativo desfoca a arte do álbum tocado atualmente no plano de fundo, fazendo a rolagem suave das linhas de letras e o realce palavra por palavra de forma precisa.

---

## 🚀 Funcionalidades

- **Autenticação Segura (Spotify OAuth PKCE)**: Fluxo completo de autorização sem expor segredos de cliente (Client Secret), seguro para aplicações estáticas Single Page.
- **Sincronização Palavra por Palavra (Word-by-Word)**: Destaque progressivo de palavras individuais dentro da linha ativa conforme o progresso da música.
- **Design Imersivo (Glassmorphism e Blur)**: Fundo animado que extrai e borra a arte do álbum da música ativa, alterando dinamicamente a atmosfera de cores do site.
- **Provedores de Letras**: Integração redundante de busca em tempo real entre Apple Music, Musixmatch, LRCLIB e NetEase.
- **Fallback Estético**: Mensagem interativa de espera se nenhuma música estiver tocando no momento.

---

## 🛠️ Estrutura do Projeto

O projeto é modular e de fácil manutenção:

- `index.html`: Estrutura HTML5 com Tailwind CSS via CDN e contêineres de tela.
- `style.css`: Estilizações personalizadas, efeitos de vidro, desfoque e transições de cor/opacidade.
- `config.js`: Gerenciador de configurações de Client ID e detecção de URIs.
- `spotify.js`: Integração com o fluxo OAuth 2.0 PKCE do Spotify e chamadas do player.
- `lyrics.js`: Conexão com o Lrclib, parser de arquivos LRC (incluindo enhanced LRC) e fallback de temporização linear de palavras.
- `app.js`: Controlador principal (Polling Loop e Sub-segundo Ticker de alta precisão via `requestAnimationFrame`).

---

## 📋 Como Configurar e Executar

Como este é um aplicativo client-side que utiliza a API do Spotify, cada usuário pode usar o seu próprio **Client ID** do Spotify Developer Dashboard. 

### Passo 1: Registrar a Aplicação no Spotify
1. Acesse o [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) e faça login.
2. Clique em **Create app**.
3. Escolha um nome (ex: `LySinc`) e uma descrição.
4. No campo **Redirect URIs**, adicione as URLs corretas:
   - Se for rodar localmente: `http://localhost:5500/` (ou a porta correspondente ao seu servidor local).
   - Se for usar no GitHub Pages: `https://seu-usuario.github.io/LySinc/` (substituindo pelo seu usuário do GitHub).
5. Salve as alterações.
6. Vá em **Settings** do seu aplicativo no Spotify, copie o **Client ID**.

### Passo 2: Executar Localmente
Como o projeto utiliza módulos ES6 (instruções `import` e `export`), você precisa de um servidor local para rodá-lo (não clique simplesmente duas vezes no arquivo `index.html`).
- Se usa o VS Code, recomendamos a extensão **Live Server** (clique com o botão direito em `index.html` e escolha *Open with Live Server*).
- Ou utilize o terminal com Python: `python -m http.server 8000` (acesse `http://localhost:8000/`).
- Ou com Node.js: `npx serve .`

### Passo 3: Inserir o Client ID no App
1. Ao carregar a página pela primeira vez, o painel de configurações se abrirá automaticamente.
2. Insira o **Client ID** copiado do console do Spotify.
3. Clique em **Salvar Configurações**.
4. Agora clique no botão principal **Conectar com o Spotify**, autorize a aplicação e divirta-se!

---

## 📝 Licença

Este projeto é de código aberto e livre para modificações.

