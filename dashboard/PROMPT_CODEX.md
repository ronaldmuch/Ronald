# Prompt para Codex · Rediseño "Urbby Insights"

Copia todo lo que está debajo de la línea y pégalo en Codex. Adjunta también el archivo `urbby-insights.html` (o déjalo dentro del repo del dashboard).

---

## Contexto

Tengo un dashboard de métricas de TikTok (datos de Metricool) que maquetaste antes. Tiene las pestañas **Resumen, Ganadores para escalar, Comparativo, Nueva publicación y Configuración**. Un diseñador hizo un rediseño con la identidad de mi marca **Urbby**. Está en el archivo `urbby-insights.html`: es un prototipo autocontenido (HTML + CSS + JS sin librerías), con datos fijos tomados de una captura del 27/09/2026.

**Tu tarea:** aplicar ese rediseño a mi dashboard real, conectado a los datos reales, sin romper la lógica de métricas que ya existe.

## Paso 0 · Antes de tocar código

1. Revisa el repo e identifica el stack actual (por ejemplo Streamlit + Plotly, React, Flask, etc.), dónde se calculan las métricas y cómo se renderiza cada pestaña.
2. Abre `urbby-insights.html` en un navegador y recorre todas las pestañas e interacciones.
3. Propón en 5 a 10 líneas cuál de estas dos rutas vas a seguir y por qué. Espera mi confirmación.
   - **Ruta A (recomendada si hoy es Streamlit):** conservar el backend y los cálculos. El HTML pasa a ser una plantilla (`templates/urbby_insights.html`) que recibe los datos como JSON (`window.__URBBY_DATA__`) y se muestra con `streamlit.components.v1.html(..., height=..., scrolling=True)` o un servidor estático equivalente. Los controles que cambian datos (actualizar, mes, cuentas) se resuelven en el front con el JSON; "Actualizar datos" dispara la recarga real.
   - **Ruta B:** portar el diseño a componentes nativos del stack actual: tokens de color y tipografía, CSS global, plantilla de gráficos con la misma paleta y animaciones equivalentes.

## Qué conservar del diseño (no negociable)

- **Paleta:** navy `#030b33 / #061550 / #0a1c5e / #0a2073`, azules `#1c47bc / #3068e6 / #5a8cff`, lavanda `#c3ccef`, texto secundario `#98a3d6`, amarillo `#ffd02e` (sombra `#f4be16`), cian del visor `#57d6ff`. Semánticos: bien `#3ddc97`, alerta `#ffb547`, mal `#e5484d`.
- **Colores por cuenta:** Urbby `#ffd02e`, Urbby Office `#3ddc97`, Ronald MUCH `#5a8cff`, somehuck `#ff8a5b`. Si aparece una cuenta nueva, asígnale un color de una lista extendible, no uno al azar.
- **Tipografía:** Fira Sans Condensed 700/800 para títulos y números grandes; Fira Sans 400–700 para el texto. Usa `tabular-nums` en todas las cifras.
- **Fondo de marca:** píldoras diagonales (−24°) que se desplazan lento, dos arcos amarillos girando en las esquinas y cruces "+" amarillas.
- **Componentes:**
  - Pestañas en píldora con indicador amarillo que se desliza.
  - Etiquetas de estado en las tarjetas (p. ej. "Cobertura 29%", "Sesgo por edad").
  - Iconos tipo app en cada indicador.
  - Tarjetas con radio de 28 px y efecto vidrio.
- **Mascota Urbby (SVG en la función `mascotSVG`):**
  - Mira hacia el cursor, parpadea y flota.
  - Al hacerle clic, muestra el siguiente consejo en un globo con efecto de escritura.
  - Estados: `idle`, `happy`, `think` (escáner mientras actualiza), `wow`, `flat`.
- **Animaciones:**
  - Contadores que suben al cargar.
  - La línea del gráfico diario se dibuja sola y aparece la etiqueta "¡Despegue!" en el mayor salto día a día. Calcúlalo con los datos, no lo fijes en el 23 de septiembre.
  - Barras que crecen.
  - Confeti al superar la meta y al terminar una actualización.
  - Inclinación 3D de las tarjetas al pasar el mouse.
- **Accesibilidad:** respeta `prefers-reduced-motion`, mantén el interruptor "Animaciones" de Configuración, deja el foco visible con el teclado y conserva los `aria-*` de pestañas, globo y botones.
- **Responsive:** tiene que funcionar a 400 px de ancho sin scroll horizontal. Solo la tabla puede desplazarse dentro de su contenedor.

## Datos: reemplazar lo fijo por lo real

En el prototipo, los datos fijos están arriba del `<script>`, en las constantes `ACCOUNTS`, `ALL`, `DAILY`, `MONTHS` y `FOLLOW`. Sustitúyelos por un único objeto con este contrato, generado por el backend:

```json
{
  "periodo": { "desde": "2026-09-01", "hasta": "2026-09-27", "mes_label": "Septiembre 2026" },
  "sincronizado_en": "2026-09-27T23:05:00Z",
  "cuentas": [
    { "id": "urbby", "nombre": "Urbby", "handle": "urbby", "red": "tiktok",
      "videos": 10, "vistas": 378822, "interacciones": 16758,
      "seguidores_netos": null, "d7": { "promedio": null, "con_snapshot": 0, "maduros": 0 },
      "diario": [ { "fecha": "2026-09-01", "vistas_mm7": 120 } ] }
  ],
  "total": {
    "videos_periodo_anterior": 8, "videos_en_maduracion": 25,
    "d7": { "promedio": 1860, "con_snapshot": 15, "maduros": 52 },
    "seguidores_netos": 6990, "cuentas_con_seguidores": 4,
    "diario": [ { "fecha": "2026-09-01", "vistas_mm7": 800 } ]
  },
  "seis_meses": [ { "mes": "2026-04", "vistas": 28000, "videos": 5, "seguidores_netos": null } ],
  "calidad": { "tiempo_visto": 0, "alcance": 0, "para_ti": 0, "videos": 77, "motivo": "Metricool no entrega retención para cuentas TikTok PERSONAL" },
  "meta_mensual": 500000
}
```

Reglas:
- **Nulos:** `null` significa "sin dato" y se muestra como "—", o como "sin datos" en los gráficos. Nunca lo conviertas en 0.
- **Serie diaria filtrada:** si el backend puede dar la serie diaria por cuenta, úsala al filtrar. Así se elimina la estimación proporcional del prototipo y también la nota que la explica (`#dailyEst`).
- **Periodo anterior, D7 y seguidores por cuenta:** si existen, muéstralos con el filtro activo. Si no, deja el comportamiento actual ("—" y el texto que lo aclara).
- **Mes:** el selector debe cargar el mes pedido de verdad. Elimina el aviso "Este prototipo solo tiene septiembre".
- **Meta mensual:** se guarda donde hoy guardas la configuración. `localStorage` solo sirve como respaldo.
- **Consejos de la mascota** (función `tips()`): salen de los datos, no de texto fijo. Por ejemplo, la cuenta con mayor participación en vistas, la de mayor tasa de interacción, el mayor salto diario, el avance de la meta y la cobertura de D7.
- **"Actualizar datos":** llama a la sincronización real con Metricool. Mientras dura, la mascota queda en `think` y avanza la barra superior. El aviso final muestra el resultado real (p. ej. "Actualización ok: N videos de M cuentas") o el error concreto si falla.
- **Borradores de "Nueva publicación":** guárdalos donde corresponda en mi sistema. Si no hay backend para esto, `localStorage` está bien. El botón no publica nada.
- **Etiquetas del prototipo:** quita "Prototipo · datos del 27/09" y la nota del pie sobre valores aproximados cuando los datos ya sean reales.

## Mantén la honestidad de las métricas

Conserva todos los textos de contexto que ya tiene el dashboard:
- Las vistas actuales son acumuladas y cohortes de distinta edad no se comparan.
- D7 se marca como "cobertura insuficiente" cuando cubre menos del 50% de los videos maduros.
- La línea de meta diaria es solo una referencia.
- La retención no se infiere a partir de vistas.

## Entregables

1. El rediseño integrado en el stack actual, con datos reales, en una rama nueva.
2. Una función o endpoint que construya el JSON anterior, con pruebas de los casos con `null`, una sola cuenta y un mes sin videos.
3. Capturas a 1280 px y a 400 px de las 5 pestañas.
4. Un README corto: cómo correrlo, de dónde sale cada métrica y cómo agregar una cuenta nueva.

Si algo del diseño choca con una limitación técnica del stack, avísame con la alternativa antes de simplificarlo.
