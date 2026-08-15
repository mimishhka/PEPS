# FIRONOVA Frontend

React 19 application built with Vite 7. Yarn 1 and `yarn.lock` are the authoritative package manager and lockfile.

## Requirements

- Node.js 20.19 or newer
- Yarn 1.22.22

## Commands

```bash
yarn install --frozen-lockfile --ignore-scripts --non-interactive
yarn start
yarn test
yarn build
```

The development server runs at `http://localhost:5173` and proxies `/api` and `/uploads` to `http://localhost:8001`.

Frontend environment variables may use the existing `REACT_APP_*` names or their `VITE_*` equivalents. Production output is written to `build/`.
