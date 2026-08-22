# Asset Manifest — vídeo cinematográfico "The Descent"

Modelo aprovado: **Cinema Studio Video 3.0** (`cinematic_studio_3_0`, Higgsfield)
em **4K**, sem áudio. Plano revisado pelo cliente em 2026-08-22:

- **Fase 1 ✅ CONCLUÍDA** — 4 keyframes 2K gerados (8 créditos). Aguardando aprovação visual.
- **Fase 2 (após GO)** — **2 segmentos** de 15s em 4K (~30s contínuos), não 3.
- **Fase 3 (opcional)** — 3º segmento só se os 30s não bastarem, após avaliação.
- Mobile 9:16: **adiado** — primeiro testar crop/object-fit do arquivo desktop.
- Master 4K preservado em `masters/` (fora de `public/`); o site serve encode web.

## Keyframes gerados (nano_banana_pro, 2K, 16:9) — para aprovação

| # | Arquivo local (docs/keyframes/) | job_id (referência p/ vídeo) |
| - | ------------------------------- | ---------------------------- |
| KF1 — acima das nuvens, golden hour | `kf1-above-clouds.png` | `1b8beb2b-497c-4de2-b8c6-00116476dbfb` |
| KF2 — dentro da nuvem | `kf2-inside-clouds.png` | `e9c62930-ee37-4f32-a49f-6ddd1e6a90cc` |
| KF3 v2 — vale NEVADO ao entardecer, casa a meia distância (re-roll aprovado; v1 arquivada como `-v1-rejected`) | `kf3-valley-distant-house.png` | `e602af00-eac5-49e2-9264-c61ffe8a18fa` |
| KF4 — casa próxima, blue hour, neve | `kf4-house-close.png` | `aab83333-5bd0-4155-8248-1c56f10fc067` |

Continuidade: ✅ resolvida no re-roll do KF3 (2026-08-22) — vale nevado e casa
vidro+madeira/telhado plano na mesma família do KF4. KF1/KF2/KF4 aprovados
pelo cliente; KF3 v2 aprovado pelo critério "resolve a continuidade da neve".

## Fase 2 — segmentos de vídeo (após GO)

Config: `cinematic_studio_3_0`, `resolution: 4k`, `duration: 15`,
`aspect_ratio: 16:9`, `generate_audio: false`. **360 créditos por segmento.**

### SEG 1 ✅ GERADO 2026-08-22 — `masters/descent-seg-1-master-4k.mp4`
- job_id: `f908572c-1bf8-462e-91bd-a5ce9e83e166` · 3840×2160 · 24fps · 15,04s · 361 frames
- Frame final real (âncora do SEG 2): `masters/seg-1-lastframe.png` (4K)
- Verificado: 0 cortes (scene detection), arco golden hour → whiteout frio ≈ KF2
- `start_image`: KF1 (job_id acima) · `end_image`: KF2 · **aguardando aprovação do cliente**
```
Continuous slow vertical descent from high above an endless sea of clouds at
golden hour down toward and into the cloud layer. The camera drifts gently
forward while sinking at constant speed; the pink-gold cloud tops rise closer,
distant snow peaks slide out of view, light softens, and the frame is fully
swallowed by soft grey-white mist. One single uninterrupted take, no cuts, no
camera shake, no speed ramps, constant descent speed, cinematic and calm.
```

### SEG 2 ✅ GERADO 2026-08-22 — `masters/descent-seg-2-master-4k.mp4`
- job_id: `b73a78b3-bf8d-4efa-b292-36c79c51f100` · 3840×2160 · 24fps · 15,04s · 361 frames · 57,8 MB
- `start_image`: frame final REAL do SEG 1 (media `2c1f445c-b096-4a2c-ae05-a711b83d68e2`)
  · `image` (referência intermediária): KF3 v2 nevado · `end_image`: KF4
- Verificado: 0 cortes (scene detection); **SSIM 0,994** entre último frame do
  SEG 1 e primeiro frame do SEG 2 (emenda invisível); casa consistente na
  aproximação; frames extraídos: `seg-2-firstframe.png`, `seg-2-lastframe.png`
- Nota: a hot tub do complemento NÃO foi renderizada (end_image KF4 sem
  banheira dominou o final — trade-off de prioridade autorizado)
- ✅ **APROVADO pelo cliente em 2026-08-22**
```
Continuous slow aerial descent breaking out of the bottom of a cloud layer:
the grey mist thins and reveals a remote alpine valley at dusk far below with
dark pine forest, a pale winding river and patches of snow. One small modern
glass and timber house with warm amber interior light appears in the distance
and grows steadily as the camera keeps descending and gliding toward it,
ending in a close low aerial framing of the same house in the lower right
third at blue hour, snow on its flat roof. Single uninterrupted take, no cuts,
no shake, constant approach speed, cinematic and calm.
```

### Encadeamento por frame real (regra)

```bash
# após aprovar SEG 1: extrair o último frame como âncora do SEG 2
ffmpeg -sseof -0.05 -i masters/descent-seg-1.mp4 -frames:v 1 -q:v 2 masters/seg-1-lastframe.png
# → media_upload(seg-1-lastframe.png) → usar o media_id como start_image do SEG 2
```

### SEG 3 (OPCIONAL — não gerar sem decisão explícita)

Reservado para estender a aproximação caso 30s scrubados fiquem curtos na
prática. Custo: +360 créditos. Prompt será derivado do trecho final real.

## Tabela de créditos (cotações reais)

| Item | Status | Créditos |
| ---- | ------ | -------- |
| 4 keyframes 2K | ✅ gasto | 8 |
| Re-roll KF3 nevado | ✅ gasto | 2 |
| SEG 1 (4K, 15s) | ✅ gasto e aprovado | 360 |
| SEG 2 (4K, 15s) | ✅ gasto — aguardando aprovação | 360 |
| **Total gasto até aqui** | | **730** (saldo: 1.316,8) |
| SEG 3 (opcional) | decisão futura | +360 |
| Mobile 9:16 (adiado) | decisão futura | +150/segmento (1080p) |

## Restrições (todas as gerações)

- Sem texto, legendas, logotipos, marcas d'água, pessoas, animais, aeronaves,
  estradas, outras construções.
- Sem cortes, sem mudanças bruscas de exposição, sem speed ramp.
- Luz coerente: golden hour (alto) → cinza-azulado (nuvem) → blue hour (vale).
- A casa é a MESMA em KF3/KF4 e ao longo do SEG 2.

## Pós-produção ✅ CONCLUÍDA 2026-08-22

- Master contínuo 4K: `masters/descent-master-4k.mp4` (30,08s · 79,8 MB · CRF 16)
- **Servido no site:** `public/assets/cinematic-descent.mp4` = 1920×1080, CRF 22,
  **all-intra (GOP 1)**, 42 MB → loader entra em modo **progressivo** (gate 8s)
- Alternativa 2560w CRF 20 (80 MB) arquivada: `masters/web-2560-crf20-alternative.mp4`
- Poster real: `public/assets/poster.jpg` (149 KB)
- Placeholder sintético arquivado: `masters/placeholder-synthetic-archive.mp4`
- Mobile: teste de crop 9:16 aprovado — a casa permanece visível no canto
  inferior direito no final; **vídeo mobile dedicado desnecessário**
- Validado via Playwright em 390/1440/1920px: scrub proporcional (p=0,33 →
  t=9,89s de 30,08s), 0 erros de console, CTA final ativo

## Comandos de referência da pós-produção

```bash
# 1. master contínuo 4K (preservado, fora de public/)
ffmpeg -i masters/descent-seg-1.mp4 -i masters/descent-seg-2.mp4 \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" -map "[v]" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -an masters/descent-master-4k.mp4

# 2. encode WEB para o site: 1440p, all-intra (obrigatório p/ scrub), faststart
ffmpeg -i masters/descent-master-4k.mp4 -vf scale=2560:-2 \
  -c:v libx264 -preset slow -crf 20 -g 1 -pix_fmt yuv420p -movflags +faststart -an \
  public/assets/cinematic-descent.mp4

# 3. poster
ffmpeg -ss 0.5 -i public/assets/cinematic-descent.mp4 -frames:v 1 -q:v 3 public/assets/poster.jpg
```

O loader do site decide sozinho a estratégia: arquivo ≤40 MB → full-buffer
(blob, seek 100% instantâneo); maior → streaming progressivo com início após
~8s bufferados (`LOADER` em `src/data/scenes.ts`).
