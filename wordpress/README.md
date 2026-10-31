# Integração com o WordPress

Conexão deste projeto com a API REST de dois sites WordPress hospedados na Hostinger,
via **Application Passwords** (nativo do WP ≥ 5.6):

| Chave (`--site`) | Site | URL | Prefixo no `.env` |
|------------------|------|-----|-------------------|
| `vitindoclio` | Vitor Muniz, artista (site oficial) | https://vitindoclio.com.br | `VITINDOCLIO_` |
| `bromelia` | Bromélia Groove | https://bromeliagroove.com.br | `BROMELIA_` |

O mockup do site da Bromélia Groove está em [`bromeliagroove/mockup/`](bromeliagroove/mockup/README.md).

## 1. Gerar a senha de aplicativo (feito por você, uma vez **por site**)

1. Entre no painel: `https://vitindoclio.com.br/wp-admin` ou `https://bromeliagroove.com.br/wp-admin`
   (ou a URL temporária da Hostinger).
2. Menu lateral **Usuários → Perfil** (ou **Usuários → Todos os usuários → seu usuário**).
3. Role até a seção **Senhas de aplicativo** (em inglês: *Application Passwords*).
   - Se a seção **não aparecer**: ou o site não está em HTTPS, ou um plugin de segurança
     desativou o recurso. Me avise antes de continuar.
4. Em **Nome da nova senha de aplicativo**, digite `Claude Code` e clique em
   **Adicionar nova senha de aplicativo**.
5. O WordPress mostra a senha **uma única vez**, no formato `xxxx xxxx xxxx xxxx xxxx xxxx`.
   Copie-a agora (com ou sem espaços, tanto faz).
6. Anote também o seu **nome de usuário de login** (o que você digita para entrar,
   não o e-mail e não o "nome de exibição").

Para revogar depois: na mesma tela, botão **Revogar** ao lado de "Claude Code".

## 2. Guardar as credenciais

```bash
cp .env.example .env      # só na primeira vez
```

Edite o `.env` e preencha o bloco de cada site: `VITINDOCLIO_WP_URL/_WP_USER/_WP_APP_PASSWORD`
e `BROMELIA_WP_URL/_WP_USER/_WP_APP_PASSWORD`.
O `.env` já está no `.gitignore`; nunca é commitado, nunca é impresso no terminal
e não deve ser copiado para nenhum outro arquivo.

## 3. Testar a conexão (somente leitura)

```bash
node wordpress/wp-check.mjs --site vitindoclio   # relatório legível
node wordpress/wp-check.mjs --site bromelia
node wordpress/wp-check.mjs --all                # os dois, em sequência
node wordpress/wp-check.mjs --site bromelia --json   # JSON completo
```

O script exige `https://` na URL do site e aborta se não houver. Ele só faz `GET`:

| Passo | Endpoint | O que confirma |
|-------|----------|----------------|
| 1 | `/wp-json/` | API ativa, nome do site, métodos de autenticação anunciados |
| 2 | `/wp-json/wp/v2/users/me` | Senha de aplicativo aceita, papel do usuário |
| 3 | `/wp-json/wp/v2/pages`, `/posts` | Conteúdo existente (inclui rascunhos se autenticado) |
| 4 | `/wp-json/wp/v2/themes?status=active` | Tema ativo e versão |
| 5 | `/wp-json/wp/v2/plugins` | Plugins instalados/ativos (exige Administrador) |
| 6 | home / `/feed/` | Versão do WordPress (meta `generator`) |

Saída com código `2` = algum bloqueio detectado; a mensagem diz exatamente o que liberar.

## 4. Regras de operação

1. **Nesta etapa**: nada é criado, editado ou apagado.
2. **Sempre**: conteúdo novo nasce como rascunho (`status: "draft"`). Publicar só com
   aprovação explícita do Vitor.
3. **Antes de alterar tema, plugin ou configuração**: pedir backup pelo hPanel da
   Hostinger (**Sites → Gerenciar → Backups → Gerar novo backup**) e esperar confirmação.
4. **Toda chamada que altera algo** é registrada em [`log/wp-changes.md`](../log/wp-changes.md)
   com data, endpoint e o que mudou.

## 5. Bloqueios comuns e como liberar

| Sintoma | Causa provável | Liberar |
|---------|----------------|---------|
| `404` em `/wp-json/` | Permalinks em "Padrão" | Configurações → Links permanentes → "Nome do post" |
| `401 rest_not_logged_in` mesmo com senha | Servidor descarta o header `Authorization` (LiteSpeed/Apache) | No `.htaccess`, dentro do bloco `# BEGIN WordPress`: `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]` |
| `401 incorrect_password` | Senha errada/revogada, ou `WP_USER` é o e-mail | Gerar nova senha; usar o login |
| `403 rest_cannot_access` | Plugin de segurança restringindo a REST API (Solid Security, Disable REST API, Wordfence) | Desativar a restrição ou liberar o namespace `wp/v2` |
| `403` com página HTML | WAF da Hostinger / Cloudflare / mod_security | hPanel → Segurança → adicionar exceção para `/wp-json/` |
| Seção "Senhas de aplicativo" ausente no perfil | Site sem HTTPS ou filtro `wp_is_application_passwords_available` | Ativar SSL (hPanel → SSL) ou remover o filtro |

## 6. SSH e WP-CLI na Hostinger (plano Premium)

O plano **Premium** da Hostinger inclui **acesso SSH** e o **WP-CLI** já vem instalado.
Ative em **hPanel → Avançado → Acesso SSH** (lá aparecem host, porta e usuário; use chave
pública em vez de senha).

Quando vale usar WP-CLI em vez da API REST:

- **Operações administrativas sem endpoint REST**: `wp core update`, `wp plugin install/update`,
  `wp theme activate`, `wp option get/update`, `wp search-replace`, `wp db export`,
  `wp cache flush`, `wp rewrite flush`. A REST API não cobre instalação/atualização de core
  nem a maioria das opções do site.
- **Backup e exportação completos**: `wp db export` + `tar` do `wp-content` é mais rápido
  e confiável do que paginar a REST API.
- **Migrações em massa**: regenerar thumbnails, trocar URLs, importar centenas de posts.
- **Diagnóstico**: `wp plugin list`, `wp cron event list`, `wp doctor` quando a REST API
  está bloqueada ou o site está fora do ar.

Quando a **API REST** é melhor:

- Criar/editar **conteúdo** (posts, páginas, mídia) a partir deste projeto, com rascunhos
  e revisões nativas, sem abrir shell no servidor.
- Integrações contínuas e scripts que rodam fora do servidor.
- Menor superfície de risco: a senha de aplicativo tem o escopo do usuário WP e é revogável;
  SSH dá acesso total ao sistema de arquivos.

Regra prática: **conteúdo → REST API; sistema (core, plugins, tema, DB) → WP-CLI**, sempre
precedido de backup e da confirmação do Vitor.
