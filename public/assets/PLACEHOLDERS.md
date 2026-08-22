# Status dos assets desta pasta

| Arquivo | Status |
| ------- | ------ |
| `cinematic-descent.mp4` | ✅ **FINAL** — render Cinema Studio 3.0 (SEG 1 + SEG 2 aprovados), encode web 2560w all-intra a partir do master 4K em `masters/descent-master-4k.mp4` |
| `poster.jpg` | ✅ **FINAL** — frame 0,5s do encode web |
| `cinematic-descent-mobile.mp4` | não existe (decisão adiada) — o site usa o arquivo desktop automaticamente |

Placeholder sintético antigo arquivado em `masters/placeholder-synthetic-archive.mp4`.

## Para regenerar o encode web a partir do master

```bash
ffmpeg -y -i masters/descent-master-4k.mp4 -vf scale=2560:-2 \
  -c:v libx264 -preset slow -crf 20 -g 1 -pix_fmt yuv420p -movflags +faststart -an \
  public/assets/cinematic-descent.mp4
ffmpeg -y -ss 0.5 -i public/assets/cinematic-descent.mp4 -frames:v 1 -q:v 3 public/assets/poster.jpg
```

Regra inegociável para scrubbing: **`-g 1` (all-intra)**.
