# Bromélia Groove — Mockup do site (snapshot)

Fonte da verdade (canvas editável, Design): https://claude.ai/artifact/JNnQ92bqGZvAcqPhKG1YdJ

Este diretório é um **snapshot** dos arquivos do canvas (versão de 2026-10-30), guardado no
repositório para que o trabalho continue junto da integração WordPress. Edições de design
acontecem no canvas; quando houver mudança relevante, atualizar esta cópia.

## Artboards

| Arquivo | Título no canvas | Interativo | Notas |
|---------|------------------|------------|-------|
| `project/Main.dc.html` | Início — flor termômetro | sim | Logo-flor giratória como menu (5 folhas: discografia, vídeos, loja, —, contato); pétala amarela escondida abre o mini-jogo "genius" com paleta verde/roxo/amarelo/azul/terracota e recorde em `localStorage`. Props: velocidade de giro, dwell, janela de encaixe, gap do menu. |
| `project/Discografia.dc.html` | Discografia — singles / álbuns | sim | Abas singles/álbuns. Singles já listados: Aldamaro, Querida Cheguei (mt.wav & Vitor Muniz, 2026), Quando eu precisei cê sumiu (Plkeef & Vitor Muniz, 2026), Sonho de Manhã (Vitor Muniz & Whell Beatz, 2026), Ice & Café (Vitor Muniz & Plkeef, 2024). Álbuns: placeholders (JD). |
| `project/Artista.dc.html` | Página de artista — Vitor Muniz | sim | Cor do artista via prop `accent` (azul #2F4FD8 padrão; opções terracota, teal, roxo, magenta). Hero com nome gigante + foto duotone, bloco "Ouvir agora" (ICE&CAFÉ), grade de lançamentos, bio, links (Spotify/YouTube/Instagram/Apple Music), "Mais da Bromélia" (mt.wav, Plkeef, Jornal). |
| `project/Loja.dc.html` | Loja | não | Banner roxo "Camisetas e discos" (em breve, link externo), 3 cards placeholder. |

## Sistema visual

- Fonte: DM Sans. Fundo lavanda `#F4F3FA`, texto `#1E1E1E`.
- Cores da marca: verde `#235B43`, roxo `#8B559D`, amarelo `#F2BC6A`. Cada artista tem sua cor (`accent`).
- Imagens (logo, símbolo da flor) são uploads do canvas (`/_blob/...`) e **não** estão nesta cópia.

## Pendências de conteúdo (placeholders no mockup)

Frase do som do artista, foto do artista, bio, links reais das plataformas, capas, álbuns/EPs,
seção vídeos, produtos e preços da loja, destino da loja externa.

## Próximo passo pensado

Mapear estes artboards para o WordPress de bromeliagroove.com.br: páginas (Início, Discografia,
Loja, Contato), um CPT ou categoria por artista, lançamentos como posts com capa/cor/plataformas.
Decisão de tema/plugins só depois do relatório de conexão (`node wordpress/wp-check.mjs --site bromelia`).
