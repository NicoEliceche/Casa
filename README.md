# Casa 10x10 checklist

To-do list mobile-first para compartir con familia. El frontend es `index.html` y puede ir en GitHub Pages. El backend es un Express chico para Render, con Neon Postgres como base persistente.

## Como probar la interfaz

Abri `index.html` directamente en el navegador. Sin backend queda en modo local y usa `localStorage`.

## Deploy

1. Crea una base en Neon y copia el connection string con `sslmode=require`.
2. Sube este repo a GitHub.
3. En Render, crea un Web Service desde el repo. El dominio esperado por el frontend es:

```text
https://casa-10x10-api.onrender.com
```

Si Render te da otro dominio, cambia `API_BASE_URL` en `index.html`.

4. Usa:
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `DATABASE_URL=postgresql://...neon.tech/...?...sslmode=require...`
   - Environment: `CORS_ORIGIN=https://nicoeliceche.github.io`
5. En GitHub Pages, publica la rama `main` desde la raiz del repo.
6. Abri la URL de Pages:

```text
https://nicoeliceche.github.io/Casa/
```

La URL base usa la lista compartida `casa-10x10-familia`. Si queres crear otra lista, podes abrir:

```text
https://nicoeliceche.github.io/Casa/#otro-id-compartido
```

## Notas

- Cualquiera con el link puede editar la lista.
- Render free puede dormir. Cuando despierta, Neon conserva todos los checks.
- La sincronizacion usa Server-Sent Events y un polling de respaldo cada 20 segundos.
