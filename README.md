# Immersive Descent

Landing page experimental de portfólio: uma descida cinematográfica contínua —
do céu acima das nuvens até uma casa moderna num vale alpino — controlada
inteiramente pelo scroll.

## Stack

React 19 · TypeScript · Vite 7 · GSAP 3 (ScrollTrigger + ScrollToPlugin) · CSS moderno

## Rodar

```bash
npm install
npm run dev        # http://localhost:4180
npm run build      # typecheck + build de produção
node scripts/test-experience.mjs      # smoke-test Playwright (usa Chrome/Edge do sistema)
node scripts/governor-probe.mjs       # mede o seek governor (--cpu 6 emula device lento)
node scripts/mobile-webkit-probe.mjs  # regressão mobile em WebKit real (motor do Safari/iOS)
node scripts/scroll-governor-probe.mjs  # prova o teto de velocidade do scroll (fling/End/Home)
```

> `mobile-webkit-probe.mjs` precisa do WebKit do Playwright instalado uma vez:
> `npx playwright install webkit`.

## Estrutura

```
src/
  data/scenes.ts        ← TODA a configuração: cenas, copy, altitudes, constantes
  hooks/useScrollVideo.ts, useReducedMotion.ts
  components/
    Experience/         ← orquestrador: ScrollTrigger + loop gsap.ticker
    Header/  SceneText/  FinalCTA/  ProgressIndicator/  Loader/  Cursor/
docs/                   ← brief, asset-manifest (prompts Cinema 4K), animation-plan, perf budget
public/assets/          ← vídeo + poster (PLACEHOLDERS — ver PLACEHOLDERS.md)
```

## Trocar o vídeo placeholder pelo render final

1. Gerar os assets do `docs/asset-manifest.md` (Cinema Studio 3.0, 4K).
2. Concatenar e re-encodar **all-intra** (`-g 1`) — comando no manifest.
3. Sobrescrever `public/assets/cinematic-descent.mp4` e `poster.jpg`. Nada de código muda.

## Pendências conhecidas

- Vídeo mobile 9:16 dedicado: desnecessário por ora — crop 16:9 validado, a casa
  permanece composta no final em 390px.
- Deploy não configurado.
- SEG 3 (extensão da aproximação) permanece opcional, não gerado.
