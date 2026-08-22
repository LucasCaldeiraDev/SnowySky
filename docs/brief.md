# Brief — "Immersive Descent"

## Objetivo

Landing page experimental de portfólio que demonstra, na prática, o nível de
experiência web imersiva que o estúdio consegue entregar. O visitante-alvo é um
potencial cliente que, ao rolar a página, deve concluir sozinho: *"é possível
fazer algo muito acima de uma landing page comum."*

- **Produto da página:** a própria experiência de scroll (a cinematografia é o conteúdo).
- **CTA primário:** `START A PROJECT` (mailto — trocar o endereço em `src/data/scenes.ts`).
- **CTA secundário:** `VIEW EXPERIENCE AGAIN` (retorna suavemente ao início).

## Narrativa (controlada pelo scroll)

| Cena | Progresso | Conteúdo |
| ---- | --------- | -------- |
| 01 Hero | 0–20% | `BEYOND THE ORDINARY` + "An immersive digital journey." + hint de scroll |
| 02 Nuvens | 25–42% | `SOME EXPERIENCES / AREN'T MEANT / TO BE WATCHED.` |
| 03 Vale | 43–60% | `THEY'RE MEANT / TO BE FELT.` |
| 04 Casa ao longe | 61–78% | marcador `1,240 M` → `A PLACE / BEYOND / THE INTERFACE.` |
| 05 Aproximação | 79–90.5% | `DIGITAL EXPERIENCE` + hairline + `01 / 01` |
| 06 Final | 92–100% | `IMMERSIVE / WEB EXPERIENCES` + sub + CTAs |

Header fixo com altímetro dinâmico (`ALT. 3,840 M — THE PEAKS` → `ALT. 1,180 M — THE HOUSE`),
interpolado por âncoras piecewise (valores exatos da spec nos limites de cada faixa).

## Direção visual

Cinemático, arquitetural, editorial, minimal, premium. Serif editorial
(Cormorant Garamond 300) para statements gigantes; sans (Inter) para labels
com tracking alto. Paleta monocromática off-white (#F4F1EA) sobre o vídeo;
nenhum gradiente colorido, card, ícone ou estética SaaS. Header e chrome em
`mix-blend-mode: difference` para legibilidade sobre céu claro e vale escuro.

## Estrutura single-page

Uma única seção de 650vh (desktop) com stage sticky fullscreen — não há
outras seções; o final da jornada é o final da página.
