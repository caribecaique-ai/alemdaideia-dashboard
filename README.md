# Alem da Ideia Dashboard

Dashboard front-end em `React + TypeScript + Vite` com backend em `Node + Express + SQLite`, integrado em tempo real ao ClickUp.

## Objetivo

Manter este dashboard isolado do restante do ecossistema e sincronizar apenas o workspace do Alem da Ideia no ClickUp.
Este projeto consome dados somente via API do ClickUp (sem endpoint de webhook proprio).

## Estrutura

- `src/`: frontend do dashboard.
- `server/`: API, persistencia, sincronizacao ClickUp e stream em tempo real.
- `server/src/storage/`: camada de persistencia em SQLite.
- `server/src/services/liveClickupDashboard.ts`: coletor ClickUp com escopo fixo.
- `src/services/dashboardSource.ts`: consumo da API + SSE (sem refresh manual).
- Atualizacao em tempo real: sincronizacao periodica da API + stream SSE para o frontend.

## Configuracao local

1. Instalar dependencias do frontend:

```bash
npm install
```

2. Instalar dependencias do backend:

```bash
npm --prefix server install
```

3. Criar arquivo de ambiente do backend:

```bash
copy server\\.env.example server\\.env
```

4. Ajustar no `server/.env`:

- `CLICKUP_API_TOKEN` (ou `CLICKUP_CLIENTS_BACKUP_PATH` + `CLICKUP_BACKUP_CLIENT_NAME`)
- `CLICKUP_TEAM_ID=90133008409` (workspace Alem da Ideia)
- `CLICKUP_SPACE_NAME=comercial`
- `CLICKUP_FOLDER_NAME=1. area de vendas`
- `CLICKUP_LIST_NAMES=1.1 Canal de Aquisicao - LinkedIn` (nao incluir outras listas)
- `CLICKUP_REFRESH_MS` (ex.: `15000` para sincronizacao API a cada 15s)
- O sync considera somente tarefas principais abertas (sem fechadas e sem subtarefas).

5. Inicializar o banco:

```bash
npm run api:init
```

6. (Opcional) Criar ambiente do frontend:

```bash
copy .env.example .env
```

## Rodando

Terminal 1 (API):

```bash
npm run dev:api
```

Terminal 2 (frontend):

```bash
npm run dev:front
```

## Endpoints principais

- `GET /api/health`
- `GET /api/dashboard/snapshot`
- `POST /api/dashboard/snapshot`
- `GET /api/dashboard/snapshot/history`
- `GET /api/dashboard/status`
- `POST /api/dashboard/refresh`
- `GET /api/dashboard/stream` (SSE realtime)

## Formato esperado para escrita

`POST /api/dashboard/snapshot` aceita:

- o objeto completo do dashboard (payload puro), ou
- um envelope `{ "slug": "alem-da-ideia", "source": "clickup-sync", "snapshot": { ... } }`.

O contrato de `snapshot` segue `src/types/dashboard.ts`.
