# GitStatusKraken — Diseño

Fecha: 2026-11-02 · Autor: Álvaro Romero

## Intención

App de escritorio Windows para consultar, sin salir de un sitio, tres cosas que hoy se miran a mano en terminal y en la web de GitHub:

1. El estado de un repo local y su gráfico de ramas.
2. Los commits de un usuario en una organización de GitHub en un rango de fechas: en qué repo, en qué rama.
3. Qué ramas de la organización contienen un texto en su nombre y si ya están mergeadas a `snapshot` y/o a `master`.

Es una herramienta interna (POC) para uso propio y del equipo. Prima que sea simple de mantener: la va a heredar un becario.

## Objetivos

- Pestaña **Repo local**: elegir una carpeta, ver el `git status` y un gráfico de ramas visual.
- Pestaña **Mis commits**: elegir la organización, el usuario y el rango de fechas, y obtener una lista de commits con repo, rama(s), fecha, mensaje y enlace.
- Pestaña **Buscar ramas**: escribir un texto y obtener una lista de ramas (repo + rama) que lo contienen, con estado de merge a `snapshot` y a `master`.
- Conexión a GitHub mediante un **token personal (PAT) pegado** en la app, guardado cifrado.

## No-objetivos

- No escribe nada: ni commit, ni push, ni merge, ni checkout. Es **solo lectura**, tanto en local como en GitHub.
- No hay login OAuth (descartado a favor del PAT).
- No hay multiusuario, servidor ni sincronización. No hay instalador con autoactualización.
- No soporta GitLab, Azure DevOps ni otros servidores.

## Anti-objetivos (fallaría aunque funcione)

- Que el token se guarde en texto plano o llegue al renderer (la parte web de la app).
- Que una búsqueda en la organización se coma la cuota de la API sin avisar o deje la app congelada.
- Código ingenioso difícil de leer para el becario.

## Restricciones

- Windows 11. Hay Node 22 y git 2.51 instalados. No hay .NET ni Rust.
- La búsqueda de commits de GitHub (`/search/commits`) **solo indexa la rama por defecto**, así que no sirve para "todas las ramas". Hay que recorrer repo → ramas → commits.
- Límite de la API REST: 5000 peticiones/hora por token.
- Si la organización usa SAML SSO (posible en github.com con Enterprise Cloud), el PAT tiene que estar autorizado para esa org. La app debe mostrar un error claro cuando no lo esté.

## Enfoques considerados

| Enfoque | Pros | Contras |
|---|---|---|
| **Electron + React** (elegido) | Es el stack del equipo (React). `git` se usa vía `child_process`. Octokit es la librería oficial. | `.exe` de ~100 MB. |
| Tauri + React | `.exe` de ~10 MB | Necesita Rust; más difícil de mantener. |
| WPF / .NET | Nativo | No hay .NET; fuera del stack. |

Elegido **Electron + React** por mantenibilidad y encaje con el stack. Para la autenticación se eligió **PAT pegado** frente a OAuth device flow: es más simple y no hay que registrar una OAuth App.

## Decisiones tomadas con Álvaro

- Plataforma: GitHub.
- Autenticación: PAT pegado en la app.
- Merge a "snapshot": la rama se llama siempre exactamente `snapshot`.
- Merge a "release": se comprueba contra `master`.
- Integración: **merge normal, sin PR** (no hay squash ni rebase). Por eso "rama con 0 commits por delante de la base" = mergeada es fiable.
- Servidor: **github.com** (no Enterprise Server). Ejemplo de org: `HefameMicroservices`, que tiene **119 repos** (privados).
- Organizaciones: `HefameMicroservices` (119 repos) y `HefamePortalesB2B` (46 repos). En las pestañas 2 y 3 el selector de organización es **multiselección** (casillas): por defecto se marcan las dos y los resultados salen juntos, con la org como columna. Se recuerdan las últimas marcadas.
- La app no usa IA en tiempo de ejecución: habla directamente con la API de GitHub desde Node.

## Cambio respecto al primer borrador: GraphQL en las pestañas 2 y 3

Con 119 repos, la versión REST (una petición por rama) puede costar miles de peticiones. Se usa la API GraphQL (`octokit.graphql`, incluida en `@octokit/rest`). Una consulta paginada por repo trae sus ramas (`refs(refPrefix:"refs/heads/")`) con la fecha de su último commit y, en la pestaña 2, `history(author:{id}, since, until)` de cada rama. Las ramas cuyo último commit es anterior a "desde" se descartan sin coste extra. La pestaña 3 hace `compare` por GraphQL (`Ref.compare(headRef)` → `aheadBy`). Si aun así la estimación supera las 1000 peticiones, la app avisa antes de lanzar la búsqueda.

Esto sustituye a los algoritmos REST descritos más abajo; la lógica (qué se filtra, qué se considera mergeada) no cambia.

## Límites conocidos

- La pestaña 2 filtra por la cuenta GitHub del usuario. Los commits hechos con un email no vinculado a esa cuenta no aparecen.
- Si el token no permite listar organizaciones (`GET /user/orgs` vacío con un PAT fine-grained), el desplegable permite escribir el nombre a mano.

## Diseño

### Arquitectura

- **Proceso main (Node)**: único dueño del token y de las llamadas a `git` y a GitHub. Expone funciones por IPC.
- **Preload**: `contextBridge` con una API mínima (`window.api.*`). `contextIsolation: true` y `nodeIntegration: false`.
- **Renderer (React)**: tres pestañas más una pantalla/diálogo de ajustes con el token.

### Token

- Se pega en Ajustes y se valida con `GET /user`, que muestra el login conectado.
- Se guarda con `safeStorage.encryptString` (DPAPI de Windows) en un fichero en `app.getPath('userData')`.
- Permisos necesarios, que se documentan en la propia pantalla:
  - PAT clásico: `repo` y `read:org`.
  - PAT fine-grained: Contents (read) y Metadata (read) sobre los repos de la org, y Members (read) en la org.
- Botón "Desconectar" que borra el fichero.

### Pestaña 1 — Repo local

- Botón "Elegir carpeta" (`dialog.showOpenDialog`). Se valida con `git rev-parse --show-toplevel`; si falla, aparece el mensaje "No es un repositorio git".
- **Status**: `git status --porcelain=v2 --branch`, parseado. Muestra la rama actual, el upstream, ahead/behind y listas de staged, modificados, untracked y conflictos.
- **Gráfico**: `git log --all --topo-order --format=%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s -n 500`. Las calles (lanes) se asignan en JS y se pintan en SVG: un círculo por commit, líneas a los padres y etiquetas de ramas y tags. Limitado a los 500 commits más recientes.
- Botón "Refrescar". Sin watcher de ficheros.
- `git` se ejecuta con `execFile` (sin shell) y `cwd` = la carpeta elegida.

### Pestaña 2 — Mis commits

- Entradas:
  - **Organización**: desplegable desde `GET /user/orgs`.
  - **Usuario**: texto con el login del token por defecto.
  - **Desde / Hasta**: fechas; por defecto los últimos 30 días.
- Algoritmo:
  1. Listar los repos de la org (`GET /orgs/{org}/repos`, paginado) y descartar los que tengan `pushed_at < desde`.
  2. Para cada repo, listar sus ramas (paginado).
  3. Para cada rama: `GET /repos/{o}/{r}/commits?sha={rama}&author={usuario}&since&until`.
  4. Deduplicar por SHA; un commit que esté en varias ramas muestra todas.
- Concurrencia limitada (~5 peticiones en paralelo). Progreso visible ("repo 12/80") y botón Cancelar.
- Al terminar se muestra la cuota restante (`x-ratelimit-remaining`).
- Resultado: tabla ordenada por fecha desc. con columnas repo, rama(s), fecha, mensaje (primera línea) y SHA corto con enlace que abre en el navegador (`shell.openExternal`).

### Pestaña 3 — Buscar ramas

- Entradas: organización (mismo desplegable) y texto.
- Algoritmo:
  1. Listar los repos de la org.
  2. Para cada repo, listar sus ramas y filtrar por nombre que contenga el texto (sin distinguir mayúsculas).
  3. Para cada coincidencia, `GET /repos/{o}/{r}/compare/{base}...{rama}` con base = `snapshot` y base = `master`. La rama está **mergeada** si `ahead_by == 0`.
  4. Si en el repo no existe `snapshot` o `master` (la API devuelve 404), se muestra "—", no un error.
- Resultado: tabla con columnas repo, rama, ¿en snapshot? ✅/❌/—, ¿en master? ✅/❌/— y fecha del último commit de la rama.
- Mismo progreso, cancelación y cuota que en la pestaña 2.

### Errores

- 401: token inválido → se manda al usuario a Ajustes.
- 403 con SSO: mensaje "Autoriza el token para la org en GitHub → Settings → Tokens → Configure SSO".
- 403/429 por rate limit: se muestra la hora de reseteo.
- Un repo que falla no aborta la búsqueda: se marca y se sigue.

### Empaquetado

- `electron-builder` con target `portable`: un único `.exe` sin instalador.

### Dependencias nuevas

- `electron`, `electron-builder`, `react`, `react-dom`, `vite` (vía `electron-vite`) y `@octokit/rest`.
- Para tests, `vitest`.
- Sin librerías de UI: CSS propio sencillo.

### Tests

- Unit tests (vitest) para las partes con lógica:
  - parser de `git status --porcelain=v2`;
  - asignación de calles del gráfico;
  - deduplicación de commits por SHA;
  - regla "mergeada si `ahead_by == 0`" y el manejo de 404.
- Las llamadas a GitHub no se testean contra la API real.

### Experiencia de usuario (inspirada en GitKraken)

Álvaro pide una UX parecida a GitKraken. Se toma la *estructura y sensación* (sin copiar logotipo, nombre ni assets):
- Tema oscuro por defecto. Fondo casi negro, paneles gris oscuro y un color de acento.
- Barra lateral izquierda con iconos para las tres pestañas y Ajustes.
- Repo local con tres zonas:
  - izquierda: ramas locales y remotas, y tags;
  - centro: gráfico con calles de colores y, en cada fila, nodo, etiquetas de rama tipo "pill", mensaje, autor y fecha relativa;
  - derecha: panel de detalle del commit seleccionado (SHA, autor, fecha, mensaje completo y ficheros cambiados con `git show --name-status`).
- Bloque fijo arriba del gráfico con el resumen del working tree (WIP): ficheros staged, modificados y untracked.
- Tablas de las pestañas 2 y 3 con filas compactas, cabecera fija y filtro rápido de texto.
- Clic en la etiqueta de una rama del panel izquierdo → el gráfico salta a ese commit.

## Decisiones que he tomado yo (Claude) — revisables

- Gráfico SVG propio en lugar de la salida de texto de `git log --graph`, porque se pidió "gráfico de ramas" al estilo Kraken. Limitado a 500 commits.
- Filtro de repos por `pushed_at` para abaratar la pestaña 2.
- Concurrencia de 5 peticiones.
- Plantilla `electron-vite` para no escribir a mano la configuración de build de Electron.
- Ejecutable portable en lugar de instalador.

## Lo que queda al constructor

- La estructura de carpetas y componentes concretos.
- Los estilos visuales.
- La paleta de colores de las calles del gráfico.
