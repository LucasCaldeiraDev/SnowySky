# Animation Plan

## Arquitetura de animação

Um único loop central (`gsap.ticker`) dirige tudo — **zero React state durante
scroll**. O ScrollTrigger só grava `state.raw`; o ticker passa isso pelo
**scroll governor** (clamp de velocidade, ver seção própria abaixo) para obter
`target`, suaviza (`smooth += (target - smooth) * (1 - e^(-dt·k))`, k=5.5) e
distribui o progresso para quatro atualizadores imperativos:

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
- Unlock de playback **com retry** no primeiro gesto (pointerdown/touchstart/
  keydown): todo engine busca melhor após um `play()`, e no iOS é obrigatório
  para permitir seek programático. Em rede móvel o primeiro toque costuma
  chegar antes do vídeo ter dados — a tentativa falha, e sem retry o vídeo
  ficaria congelado a sessão inteira no Safari real. Por isso o unlock escuta
  gesto E prontidão (`canplay`/`loadeddata`) e tenta de novo a cada evento até
  um `play()` resolver; só então remove os listeners.
- Sem arquivo de vídeo → modo procedural (gradiente pan) com badge de placeholder.

## Os dois governadores

Dois governadores independentes cuidam de lados opostos do mesmo cano —
juntos garantem que nenhum seek pedido seja maior do que o navegador consegue
(ou o olho deveria) perceber como movimento contínuo:

```
raw (scroll bruto)  --[SCROLL_GOVERNOR: teto]-->  target  --[lerp]-->  smooth  --[SEEK_GOVERNOR: piso]-->  video.currentTime
```

### Scroll governor (o usuário não pode "quebrar" o vídeo escrolando rápido demais)

`SCROLL_GOVERNOR` em `scenes.ts` limita a **velocidade de entrada**: por mais
que o usuário dê um fling violento, arraste a scrollbar do SO até o fim, ou
aperte `End`/`Home` (salto instantâneo de scroll, não gradual), o `target`
usado pelo resto do pipeline só pode perseguir o `raw` numa velocidade máxima
— um fast-forward limitado e contínuo, nunca um corte seco.

- **Teto (`maxPlaybackMultiple: 30`):** o `target` nunca avança mais rápido
  que 30× a duração do vídeo. Duration-independente por construção
  (`maxStep_segundos = maxPlaybackMultiple × dt`), então continua válido se o
  vídeo mudar de tamanho no futuro (ex.: SEG 3).
- **Piso defensivo (`maxFrameDeltaMs: 48`):** o `dt` usado nessa conta é
  limitado a 48ms — cobre hiccups normais de frame (GC, paint lento) sem
  depender de um `dt` real gigante (o próprio lag-smoothing do GSAP já
  comprime stalls piores, tipo aba em background, para ~33ms antes disso).
  Isso trava o pior caso possível de salto num único tick em
  `maxPlaybackMultiple × maxFrameDeltaMs` = 30 × 0,048s = **1,44s, sempre**,
  não importa quão violento o input.
- Abaixo dessa velocidade (a imensa maioria do scroll real) o clamp é um
  no-op: `target` segue `raw` 1:1, comportamento idêntico ao de antes.

**Prova (não estimativa):** instrumentação DEV-only (`window.__xpScrollGovernor`,
medida de dentro do próprio `tick`, imune a jitter de um poller externo) +
`node scripts/scroll-governor-probe.mjs`, simulando salto instantâneo 0%→100%
(como `End`), 100%→0% (`Home`) e um salto no meio (drag de scrollbar):

| Cenário | Δ máximo por tick observado | Teto teórico | Tempo até assentar |
| ------- | ---------------------------- | ------------- | ------------------- |
| Salto 0→100% | ≤ 1,44s (nunca excede) | 1,44s | ≥ 1,0s (duration/30) |
| Salto 100→0% | ≤ 1,44s (nunca excede) | 1,44s | ≥ 1,0s |
| Salto 10%→60% | ≤ 1,44s (nunca excede) | 1,44s | — |

4 execuções, 12 cenários, zero violação do teto. RESULT: PASS.

### Seek governor (fecha o gap entre navegadores)

Cada engine cobra um preço diferente por um `currentTime`. Em vez de fixar uma
taxa, o governador (`SEEK_GOVERNOR` em `scenes.ts`) **mede** e se adapta:

- sinal de conclusão: `requestVideoFrameCallback` quando existe (Chrome/Safari
  — mede até o pixel mudar), com o evento `seeked` como fallback (Firefox);
- média móvel do custo real → intervalo mínimo entre seeks
  (`custo × 1,15`, limitado a 16–260ms): navegador rápido scruba a cada frame,
  navegador lento recebe menos seeks e maiores em vez de uma fila que trava o decoder;
- limiar de movimento também escala com o custo (seek caro exige delta maior);
- watchdog de 900ms: se o sinal de conclusão nunca chega, o portão reabre;
- `fastSeek` no Safari, `currentTime` nos demais; pausa total com aba oculta.

Medido com `node scripts/governor-probe.mjs [--cpu N]`:

| Cenário | Custo do seek | Intervalo | Seeks no sweep |
| ------- | ------------- | --------- | -------------- |
| Chrome normal | 1,12 ms | 16 ms (piso) | 262 |
| CPU 6× lenta | 3,60 ms | 16 ms (piso) | 228 |
| CPU 20× lenta | 16,13 ms | **19 ms (back-off)** | 92 |
| WebKit real (motor do Safari/iOS) | 37,11 ms | 43 ms | 13 |

## Mobile — lock de scroll e unlock de vídeo à prova de iOS

Dois ajustes específicos de WebKit, validados com o **WebKit real do
Playwright** (`node scripts/mobile-webkit-probe.mjs` — mesmo motor do Safari/
iOS, não uma emulação de Chromium):

1. **Scroll lock:** `overflow: hidden` sozinho não impede rubber-band scroll
   no iOS Safari (bug conhecido do WebKit). Durante loader+intro (página
   sempre em scrollY 0 nesse momento), `html.is-locked body` agora também
   ganha `position: fixed; inset: 0` — técnica padrão de scroll-lock.
2. **Unlock de vídeo com retry:** ver acima. Testado forçando um toque real
   (`page.touchscreen.tap`, gesto confiável — não `dispatchEvent` sintético)
   antes do vídeo ter qualquer dado (delay de rede artificial de 4s no
   primeiro request) — resultado: `unlocked:false` após o toque cedo demais,
   `unlocked:true` após um segundo toque já com dados prontos. Sem o retry,
   ficaria `false` para sempre.

Resultado do probe (WebKit real, iPhone 13, rede throttled):
`loaderVisibleAtLoad: true` · `bodyPosition(locked): fixed` ·
`earlyTap → unlocked:false` · `bodyPosition(unlocked): static` ·
`secondTap → unlocked:true` · `seeks:13` (frames realmente apresentados,
via fallback `seeked` — este build do WebKit não expõe
`requestVideoFrameCallback`) · `currentTime` acompanhando o scroll ·
zero erros de console · **RESULT: PASS** (5/5 execuções).

> O lock em si (`html.is-locked`) é setado **estaticamente no `index.html`**
> (`<html class="is-locked">`), não via `useEffect` do React — um efeito
> pós-mount deixaria uma janela de alguns milissegundos, bem no primeiro
> paint, onde o touch scroll poderia "vazar" antes do React sequer rodar.
> Descoberto por flake intermitente no probe acima; fechado de vez.

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
