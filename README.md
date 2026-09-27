# Ecosistema Urbby — animación con sonido

Video de ~99 s (1920×1080, 24 fps) generado a partir del archivo de Figma **Animaciones**:

- **Arte y keyframes**: página *Producción · Ecosistema Urbby · 97s* (30 tomas, incluidas las nuevas 14b y 19b). Se exportó cada toma como SVG con los id de capa de Figma, junto con sus pistas de keyframes (opacidad, posición, escala, rotación) y las transformaciones exactas de cada capa animada.
- **Dirección**: página *Animática · Plan de animación*. Las cámaras usan los rectángulos *Cámara A/B/C/D* de cada toma, y las transiciones, el acting extra y el sonido siguen las notas del plan.

## Cómo se construye

```
./build.sh
```

| Paso | Archivo | Qué hace |
|---|---|---|
| 1 | `tools/bake.mjs` | "Hornea" los filtros SVG costosos (blur de brillos, sombras, textura de ruido, sombras internas) a PNG una sola vez, y agrega un halo suave de legibilidad a los titulares. El vector sigue nítido y animable. |
| 2 | `tools/cues.mjs` | Exporta el horario de tomas y todos los cues de sonido a `build/cues.json`. |
| 3 | `audio/mix.py` | Sintetiza la música y los ~115 efectos (todo procedural, sin samples) y los mezcla alineados cuadro a cuadro → `build/audio_mix.wav`. |
| 4 | `tools/render.mjs` | Renderiza cada cuadro en Chromium (Playwright) en paralelo y codifica H.264 + AAC → `build/video.mp4`. |

Para revisar cuadros sueltos: `node tools/preview.mjs <carpeta> --shot=12:0,1.5,3` y `python3 tools/sheet.py <carpeta> hoja.png`.
Para ver la mezcla: `python3 tools/audioviz.py audio.png`.

## Estructura

- `src/engine.js` — evalúa los keyframes de Figma (curvas bézier, pivotes exactos), cámaras, utilidades de animación.
- `src/shots.js` — la dirección de cada toma: cámaras del plan, acting, efectos, transiciones y cues de sonido.
- `src/player.js` / `src/player.html` — línea de tiempo por beats (108 BPM: cada toma dura un número entero de beats, así los cortes caen en el beat), transiciones (whip-pan con motion blur, match cut con zoom, fundido a negro, barrido con la estela de la mascota, ripple del tap, puerta que cierra en negro, flashes, disolvencia).
- `audio/` — DSP (`dsp.py`), instrumentos (`instruments.py`), partitura (`music.py`), efectos (`sfx.py`) y mezcla/master (`mix.py`).
- `assets/prod/` — SVG + keyframes exportados de Figma; `assets/baked/` — versión con filtros horneados.

## Música y diseño sonoro

- **Acto 1 · El caos** (0–20 s): pad oscuro en La menor, reloj de pared, vibraciones y notificaciones; en el montaje el tic-tac acelera de 1 a 2 golpes por beat, stabs en cada corte y un riser. En la toma 10 todo se congela: 8 cuadros de silencio seco y golpe grave en el corte a los gastos (cada tarjeta es una caja registradora más grave).
- **Acto 2 · Urbby trabaja** (20–79 s): drop en Do mayor con el motivo de Urbby en marimba; en 14b la música baja un escalón (Ronald duerme). Cada paso del pedido tiene su sonido: tap, respuesta, escaneo del visor, pago, cha-ching, pings del pipeline, paquete de datos a Meta, impresora térmica, camión, timbre, puerta, factura y WhatsApp.
- **Acto 3 · La vida nueva** (79–99 s): medio tiempo, pads abiertos y pájaros; sube en 26, crescendo con pops en cadena en 27 y golpe final + chime de marca en el cierre.

Las voces (bostezo, suspiros, "mm") son síntesis simples; si se quiere voz en off real o frases del cliente ("¡gracias!"), conviene grabarlas y sumarlas a la mezcla.
