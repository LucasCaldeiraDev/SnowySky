# Performance Budget

| Recurso | Orçamento | Atual (placeholder) |
| ------- | --------- | ------------------- |
| JS (gzip) | ≤ 130 KB | 114 KB (React 19 + GSAP) |
| CSS (gzip) | ≤ 8 KB | 3.4 KB |
| Fontes | 2 famílias Google Fonts, `display=swap` | Cormorant Garamond + Inter |
| Vídeo desktop | ≤ 60 MB all-intra | **42 MB** (30s, 1920×1080, CRF 22, GOP 1) — FINAL |
| Poster | ≤ 250 KB | 149 KB (frame real 1080p) |
| FPS durante scroll | 60fps (sem re-render React) | loop único gsap.ticker |

## Regras

- Nenhum `setState` em eventos de scroll — todo movimento via refs/quickSetter.
- Writes de DOM só quando o valor muda (dead-bands no altímetro, dim, blur).
- Culling: cena fora da banda fica `visibility: hidden` e não recebe writes.
- Preload adaptativo: ≤40 MB → 100% buffered antes de começar (seek instantâneo);
  acima disso → streaming progressivo com início após ~8s de buffer, download
  continua em background (usuário nunca espera um master inteiro). O resto da
  página pesa < 200 KB e pinta imediatamente.
- `content-type` checado no preload — fallback procedural se o vídeo faltar.
- Blur nunca em mobile; grain sem animação em mobile.

## Ao trocar pelo vídeo final (Cinema 4K)

1. Re-encodar **sempre** com `-g 1` (all-intra) — requisito do scrub.
2. Servir ~2560w (CRF 20) como `cinematic-descent.mp4`; manter o master 4K fora do site.
3. Se o arquivo passar de ~80 MB, avaliar versão mobile dedicada (9:16, 1080p)
   em `cinematic-descent-mobile.mp4` — o loader escolhe sozinho.
