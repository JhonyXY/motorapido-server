# MotoRapido — Servidor

Backend Node.js com Express, Socket.io e PostgreSQL.

## Pré-requisitos

- Node.js >= 18
- PostgreSQL >= 14

## Como rodar localmente

### 1. Instale as dependências

```bash
cd motorapido/server
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/motorapido
JWT_SECRET=uma-chave-secreta-forte
ADMIN_PASSWORD=senha-segura-do-admin
```

### 3. Crie o banco de dados

```bash
psql -U postgres -c "CREATE DATABASE motorapido;"
```

### 4. Execute as migrations

```bash
node src/db/migrations.js
```

### 5. Inicie o servidor

Modo desenvolvimento (com hot-reload):
```bash
npm run dev
```

Modo produção:
```bash
npm start
```

## Endpoints principais

| Método | Rota                   | Descrição                  |
|--------|------------------------|----------------------------|
| POST   | /api/auth/register     | Cadastro de usuário        |
| POST   | /api/auth/login        | Login de usuário           |
| POST   | /api/rides             | Solicitar corrida          |
| GET    | /api/rides             | Listar corridas            |
| PATCH  | /api/rides/:id/status  | Atualizar status da corrida|
| GET    | /api/drivers           | Listar motoristas ativos   |
| POST   | /api/drivers/location  | Atualizar localização      |
| POST   | /api/admin/login       | Login do admin             |
| GET    | /api/admin/stats       | Estatísticas gerais        |

## Eventos Socket.io

| Evento (emit)         | Evento (on)               | Descrição                    |
|-----------------------|---------------------------|------------------------------|
| `driver:location`     | `driver:location:update`  | Localização do motorista     |
| `ride:request`        | `ride:new`                | Nova solicitação de corrida  |
| `ride:accept`         | `ride:accepted`           | Corrida aceita pelo motorista|
| `ride:status`         | `ride:status:update`      | Atualização de status        |
