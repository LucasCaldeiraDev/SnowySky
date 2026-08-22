# Animation Plan

## Arquitetura de animação

Um único loop central (`gsap.ticker`) dirige tudo — **zero React state durante
scroll**. O ScrollTrigger só grava `state.raw`; o ticker suaviza
(`smooth += (raw - smooth) * (1 - e^(-dt·k))`, k=5.5) e distribui o progresso
para quatro atualizadores imperativos:

| Atualizador | Alvo | Técnica |
| ----------- | ---- | ------- |
| `video.update(p)` | `<video>.currentTime` | lerp + guarda `seeking` + delta mínimo 1/30s + `fastSeek` quando disponível |
| `updateScenes(p)` | linhas de texto | `gsap.quickSetter` (opacity/y), blur por band, culling por `visibility` |
| `updateHeader(p)` | altímetro | `textContent` só quando o valor muda; micro-fade na troca de label |
| `updateChrome(p)` | progress line + dim final | quickSetter scaleX/opacity com dead-band |

O pin é feito por **CSS `position: sticky`** (sem pin-spacer do GSAP — mais
estável em iOS); o ScrollTrigger apenas mede o progresso do track (650vh
desktop / 520vh mobile / 420vh reduced-motion — valores em `scenes.ts`).

## Vídeo scrubado

- Preload adaptativo (ver `LOADER` em `scenes.ts`), dirigido por um bus sem
  React state (`src/lib/loaderBus.ts`) que conecta preloader → overlay → intro:
  - arquivo **≤ 40 MB** → full-buffer via fetch stream → Blob URL (seek
    instantâneo garantido em toda a timeline; barra = bytes reais);
  - arquivo **maior** → streaming nativo progressivo: a experiência começa com
    ~8s bufferados e o download continua em background (barra = buffer/gate);
  - fallback de segurança: começa após 12s se houver dados reproduzíveis.
- Encode **all-intra (GOP 1)** — cada frame é keyframe; sem isso o scrub "pula"
  (e, no modo progressivo, seeks fora do buffer resolvem rápido via range requests).
- Unlock de seek no iOS: `play().then(pause())` no primeiro touch.
- Sem arquivo de vídeo → modo procedural (gradiente pan) com badge de placeholder.

## Timing das cenas

Declarado em `src/data/scenes.ts` (`SCENES[]`: start/end/fadeIn/fadeOut/stagger/blur).
Curvas: smoothstep; entrada +44px/blur 8px → repouso → saída −36px/blur 6px.
Mobile: +26px, sem blur (filter é caro em GPU mobile).

## Intro (pós-loader)

Timeline única: vídeo fade-in 1.5s → máscara de linha do título (yPercent
112→0, stagger 0.11) → sub/hint → header → chrome. Scroll destravado no
`onComplete`; até lá o updater de cenas fica em standby.

## Microinterações

- Cursor custom (dot instantâneo + ring com trailing exponencial), só `pointer: fine`, `mix-blend-mode: difference`.
- Hover: pill do CTA inverte (bg off-white), underline animada no secundário, ring do cursor escala.
- Grain de filme (SVG turbulence, opacity .05, anim steps desktop-only).
- Hint de scroll com linha vertical em loop suave.

## Reduced motion

Track menor, vídeo substituído pelo poster estático, apenas fades de opacity
(sem y/blur/scrub), scrollTo dos botões instantâneo, cursor sem trailing,
grain/hint sem animação.

## Cleanup

`gsap.context().revert()` + `ticker.remove` + listeners removidos no unmount;
`refreshInit` do ScrollTrigger recalcula constantes de ambiente e altura do
track em resize/orientation change; `ignoreMobileResize` evita jumps da URL bar.
