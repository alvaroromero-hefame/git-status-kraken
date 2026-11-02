# GitStatusKraken

App de escritorio para Windows (Electron + React), con un estilo inspirado en GitKraken. Tiene tres pestañas:

1. **Repo local**: abre una carpeta con git y muestra:
   - el estado del árbol de trabajo (WIP);
   - el gráfico de ramas con los últimos 500 commits;
   - las ramas y los tags;
   - el detalle de cada commit.
2. **Mis commits**: los commits de un usuario de GitHub en un rango de fechas, en **todas** las ramas de las organizaciones elegidas.
3. **Buscar ramas**: las ramas cuyo nombre contiene un texto, indicando si están mergeadas:
   - a **snapshot**: alguna rama cuyo nombre contenga `snapshot`; se muestra cuál;
   - a la **rama principal** del repo (`master` o `main`).

La app es **solo lectura**: no hace commit, push, merge ni checkout.

## Uso

1. Ejecuta `GitStatusKraken <versión>.exe`. Es portable, no se instala.
2. Ve a **Ajustes** y pega un token de GitHub.

### Cómo crear el token

1. En GitHub ve a Settings → Developer settings → Personal access tokens → **Tokens (classic)** → *Generate new token (classic)*.
2. Marca los scopes `repo` y `read:org`, y ponle una caducidad, por ejemplo 90 días.
3. Si la organización usa SSO, pulsa **Configure SSO** junto al token y autorízalo en cada organización.

El token se guarda cifrado con el cifrado de Windows (`safeStorage` de Electron) en la carpeta de datos de la app. Solo se envía a GitHub.

## Desarrollo

```bash
npm install
npm run dev     # app en modo desarrollo con recarga
npm test        # tests (vitest)
npm run dist    # genera dist/GitStatusKraken <versión>.exe (portable)
```

Estructura:

- `src/main/`: proceso principal (Node). Lo único que toca git, el token y GitHub.
  - `git/parse.js`: parsers puros de la salida de git (con tests).
  - `git/repo.js`: ejecuta git con `execFile` (sin shell).
  - `github/commits.js`, `github/branches.js`: búsquedas con la API GraphQL de GitHub.
  - `github/pool.js`: limita las peticiones a 5 en paralelo.
  - `github/errors.js`: traduce errores de GitHub a mensajes en español.
- `src/preload/`: expone `window.api` al renderer. El renderer no tiene acceso a Node.
- `src/renderer/`: interfaz en React.
  - `graph/lanes.js`: algoritmo de calles del gráfico (con tests).

Documentación de diseño: `docs/superpowers/specs/`. Plan de implementación: `docs/superpowers/plans/`.

## Límites conocidos

- "Mis commits" busca por la cuenta de GitHub del usuario. Los commits hechos con un email que no esté vinculado a esa cuenta no aparecen.
- Se leen como máximo 100 commits por rama dentro del rango.
- El gráfico muestra los 500 commits más recientes.
- Cada búsqueda consulta todos los repos de las organizaciones elegidas: unos 10–15 s y unos 100 puntos de la cuota de GitHub (5000/hora).
