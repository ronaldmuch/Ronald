#!/usr/bin/env bash
# Reconstruye el video completo: horneado de filtros → cues → audio → render.
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-audit --no-fund >/dev/null
python3 -c "import numpy, scipy, PIL, imageio_ffmpeg" 2>/dev/null || pip install numpy scipy pillow imageio-ffmpeg
[ -d assets/baked ] || node tools/bake.mjs          # solo si cambian los SVG exportados
node tools/cues.mjs                                  # horario de tomas + cues de sonido → build/cues.json
python3 audio/mix.py                                 # música + efectos → build/audio_mix.wav
node tools/render.mjs --workers="${WORKERS:-3}"      # cuadros → build/video.mp4
