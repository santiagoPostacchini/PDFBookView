# Investigación para un generador automático de videos promocionales de álbumes de fotos / fotolibros…

- Fecha: 2026-10-06T23:26:10-03:00
- Agente: Gemini vía agy
- Consulta: Investigación para un generador automático de videos promocionales de álbumes de fotos / fotolibros impresos, renderizados en 3D (three.js) dentro de una app web. El usuario final NO es técnico. Necesito referencias concretas (con URL) y principios accionables sobre: 1. Videos 3D de producto de nivel profesional (estilo Apple, renders de producto, "product reveal"): qué tomas usan (hero shot, macro/detalle, orbit/turntable, dolly in, slider lateral, cenital, revelación con luz), cómo es la ilum…

## Respuesta

Aquí la investigación resumida sobre videos promocionales 3D para fotolibros:

**1. Videos 3D de Producto (Estilo Apple)**
*   **Tomas:** *Macro* (detalles de textura/papel), *Hero shot* (revelación majestuosa) y *Orbit* lento.
*   **Iluminación:** Cicloramas neutros. Luz de estudio suave y *rim light* (contraluz) para separar bordes.
*   **Ritmo y Errores:** Movimiento fluido (*ease-in/out*). *Se ve barato:* sombras duras, rebotes mecánicos y luz plana.

**2. Promociones de Fotolibros (Artifact Uprising, Mixbook)**
*   **Estructura:** Toma de portada $\rightarrow$ hojeo rápido (*flip-through*) $\rightarrow$ pausa en página *lay-flat* $\rightarrow$ cierre.
*   **Escenografía:** Entornos cálidos con texturas naturales (madera, lino) y sombras de ventana (*lifestyle*).
*   **Textos:** Títulos cortos flotantes en espacios negativos, con tono emocional.

**3. Herramientas de Mockups (Usuarios no técnicos)**
*   **Placeit / Previewed:** Web. Plantillas rígidas donde el usuario sube imágenes; luces y cámaras son automáticas.
*   **Rotato:** macOS. Mayor calidad y control (reflejos, lentes), pero requiere que el usuario decida los ángulos.
*   **Book Brush:** Muy automatizado, pero centrado en portadas de libros tradicionales, no en interiores.

**4. Buenas Prácticas 9:16 (Reels/TikTok a 1080x1920)**
*   **Duración y Gancho:** 15 a 30s. Acción visual fuerte en los primeros 3 segundos para detener el *scroll*.
*   **Zonas Seguras:** Mantener lo vital al centro. Evitar 35% inferior (texto UI), 20% derecho (botones) y 10% superior.

**Fuentes:**
*   Principios de render estilo Apple: https://renderedgestudio.com
*   Estética visual (Artifact Uprising): https://www.artifactuprising.com
*   Patrones de anuncios (Mixbook): https://www.facebook.com/mixbook
*   Herramientas: https://rotato.app | https://previewed.app | https://placeit.net
*(Nota: Los videos promocionales exactos de marcas no tienen URL fija al ser anuncios dinámicos; verifiqué sus patrones generales mediante búsquedas en YouTube y redes sociales).*

## Fuentes adicionales (Claude, búsqueda web)

- Movimientos de cámara: una idea por plano, lento y deliberado, sin apilar movimientos que se pelean. https://lumalabs.ai/news/ai-camera-movement-prompts · https://vdci.edu/learn/revit/twinmotion-camera-movement · https://superhivemarket.com/products/hero-shot-production-grade-product-vizualization-director-for-blender/docs
- Herramientas para no técnicos: Rotato (plantillas y presets de animación): https://rotato.app/blog/animated-mockup · Book Brush (videos animados para autores): https://bookbrush.com/animated-mockups-software · Previewed: https://toolradar.com/tools/previewed · Placeit: https://ecommerceguide.com/?p=5981
- Ritmo de anuncios y estructura gancho → cuerpo → llamado a la acción: https://sovran.ai/blog/video-editing-for-social-media · https://biteable.com/blog/marketing-video-length-by-social-platform/
- Zonas seguras de Reels/TikTok (1080×1920): https://houseofmarketers.com/guide-to-safe-zones-tiktok-facebook-instagram-stories-reels/ · https://quso.ai/blog/instagram-reel-dimensions
- Profundidad de campo sin halos en una pasada (Dennis Gustafsson, 2018): http://blog.tuxedolabs.com/2018/05/04/bokeh-depth-of-field-in-single-pass.html
- Proyección de texturas con foco (para "Luz de ventana"): https://threejs.org/docs/pages/SpotLight.html
