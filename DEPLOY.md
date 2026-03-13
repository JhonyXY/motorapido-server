# Deploy do MotoRapido Server no Railway

## Pré-requisitos
- Conta no [GitHub](https://github.com)
- Conta no [Railway](https://railway.app) (login com GitHub)

---

## PASSO 1 — Subir o código para o GitHub

```bash
# Dentro da pasta motorapido/server
git init
git add .
git commit -m "feat: inicial motorapido server"
```

Crie um repositório público ou privado chamado **motorapido-server** em github.com/new, depois:

```bash
git remote add origin https://github.com/SEU_USUARIO/motorapido-server.git
git branch -M main
git push -u origin main
```

---

## PASSO 2 — Criar o projeto no Railway

1. Acesse [railway.app](https://railway.app) e clique em **New Project**
2. Escolha **Deploy from GitHub repo**
3. Autorize o Railway a acessar seus repositórios
4. Selecione **motorapido-server**
5. O Railway detecta o `Dockerfile` automaticamente e inicia o build

---

## PASSO 3 — Adicionar o banco PostgreSQL

1. Na tela do projeto, clique em **+ New** → **Database** → **PostgreSQL**
2. O Railway provisiona o banco e injeta a variável `DATABASE_URL` automaticamente no serviço
3. As migrations rodam automaticamente na primeira inicialização do servidor

---

## PASSO 4 — Configurar variáveis de ambiente

No painel do serviço (não do banco), vá em **Variables** e adicione:

| Variável       | Valor                                      |
|----------------|--------------------------------------------|
| `JWT_SECRET`   | Uma string longa e aleatória (ex: use `openssl rand -hex 32`) |
| `ADMIN_PASSWORD` | Senha segura para o painel admin         |

> `DATABASE_URL` é gerado automaticamente — não precisa adicionar manualmente.

---

## PASSO 5 — Pegar a URL pública

1. Vá em **Settings** → **Networking** → **Generate Domain**
2. O Railway gera uma URL no formato `motorapido-server-production.up.railway.app`

---

## PASSO 6 — Verificar o deploy

```bash
curl https://SEU_DOMINIO.railway.app/health
# Resposta esperada: {"status":"ok"}
```

Ou abra no browser:
```
https://SEU_DOMINIO.railway.app/health     → {"status":"ok"}
https://SEU_DOMINIO.railway.app/admin      → Painel admin
```

---

## PASSO 7 — Atualizar o app Flutter

Abra `lib/config/app_config.dart` e troque o `serverUrl`:

```dart
class AppConfig {
  static const String serverUrl = 'https://SEU_DOMINIO.railway.app';
}
```

---

## Estrutura de arquivos necessária no repositório

```
motorapido-server/
├── Dockerfile          ← build da imagem
├── railway.json        ← configuração do Railway
├── package.json
├── .gitignore          ← exclui .env e node_modules
├── public/
│   └── admin.html
└── src/
    ├── app.js
    ├── db/
    ├── routes/
    ├── controllers/
    ├── middlewares/
    └── services/
```

> **Nunca commite o arquivo `.env`** — as variáveis são injetadas pelo Railway em produção.

---

## Criar o primeiro motorista via painel admin

1. Acesse `https://SEU_DOMINIO.railway.app/admin`
2. Entre com o `ADMIN_PASSWORD` configurado
3. Clique em **Novo Motorista** e preencha os dados
4. O motorista pode fazer login no app com `username` e `password`
