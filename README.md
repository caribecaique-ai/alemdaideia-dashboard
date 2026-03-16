# Alem da Ideia Dashboard

Protótipo visual do dashboard da `Além da Ideia`, separado do projeto `clickup-dashboards`.

## Objetivo

Este repositório existe para evoluir a interface do dashboard sem misturar código, histórico ou remoto com o projeto anterior do ClickUp.

Hoje ele roda com dados mockados.
Depois, a integração real pode ser feita com o backend Ruby consumindo a API do ClickUp e entregando um payload próprio para o frontend.

## Estrutura

- `src/App.tsx`: composição da tela.
- `src/data/mockDashboard.ts`: snapshot mockado usado no protótipo.
- `src/services/dashboardSource.ts`: ponto de troca para a futura fonte de dados real.
- `src/types/dashboard.ts`: contratos do dashboard.

## Rodando localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Próxima etapa de integração

1. Criar um endpoint no backend Ruby para o dashboard.
2. Mapear os dados do ClickUp para o formato definido em `src/types/dashboard.ts`.
3. Trocar `getDashboardSnapshot()` para consumir a API real.

Variável prevista para a integração:

```bash
VITE_API_BASE_URL=http://localhost:3000
```
