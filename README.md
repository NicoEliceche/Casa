# Casa 10x10 checklist

To-do list mobile-first para compartir con familia. El frontend es `index.html` y puede ir en GitHub Pages. El backend es un Express chico para Render, con Neon Postgres como base persistente.

## Como probar la interfaz

Abri `index.html` directamente en el navegador. Sin backend queda en modo local y usa `localStorage`.

## Deploy

1. Crea una base en Neon y copia el connection string con `sslmode=require`.
2. Sube este repo a GitHub.
3. En Render, crea un Web Service desde el repo.
4. Usa:
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `DATABASE_URL=...`
   - Environment: `CORS_ORIGIN=*`
5. En GitHub Pages, publica la rama `main` desde la raiz del repo.
6. Abri la URL de Pages agregando el backend:

```text
https://TU_USUARIO.github.io/TU_REPO/?api=https://TU-SERVICIO.onrender.com
```

La app genera automaticamente un `#casa-10x10-...` al final. Ese link completo, con `?api=...` y `#...`, es el que hay que compartir.

## Notas

- Cualquiera con el link puede editar la lista.
- Render free puede dormir. Cuando despierta, Neon conserva todos los checks.
- La sincronizacion usa Server-Sent Events y un polling de respaldo cada 20 segundos.
