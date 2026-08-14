# Vercel — Checklist de Deploy e Secrets

Documento de apoio para finalizar a configuração de ambiente do **agro-stock-gps** na Vercel.

> Data de criação: 12/08/2026 · Status: **PARCIAL — falta configurar o SMTP (conta Gmail).**

---

## 1. Acesso rápido

| O que | URL / caminho |
|---|---|
| Tela de Environment Variables do projeto | `https://vercel.com/ees-solucoes/agro-stock-gps/settings/environment-variables` |
| Navegação alternativa | Dashboard → equipe **ees-solucoes** → projeto **agro-stock-gps** → **Settings** → **Environment Variables** |

### Como funciona o formulário (se repete para cada variável)
- **Name** → digite o nome da variável
- **Value** → cole o valor
- **Environments** → marque **Production**
- **Sensitive** → deixa o valor criptografado e imutável (recomendado para chaves e senhas)
- **Save** → salva a variável

---

## 2. Variáveis a configurar

### 2.1 `FIREBASE_SERVICE_ACCOUNT_KEY` ✅ (se já feito, pule)
> Papel: é o que **ativa o cron** `/api/cron/alerts` — sem ela o cron responde 503 e nada é enviado.

1. Console Firebase: `console.firebase.google.com` → seu projeto → ⚙️ **Project settings** → aba **Service accounts** → **Generate new private key** (baixa um arquivo `.json`).
2. Na Vercel: **Name** = `FIREBASE_SERVICE_ACCOUNT_KEY` · no **Value**, cole o **JSON inteiro** (do `{` ao `}` final — aceita várias linhas).
3. Marque **Production** + **Sensitive** → **Save**.
4. Se algum caractere faltar o arquivo fica inválido → apague a variável e recrie.

### 2.2 `SMTP_HOST` ⏳
- Endereço do servidor de e-mail. Exemplos: Gmail → `smtp.gmail.com` · Outlook → `smtp.office365.com` · Hostinger → `smtp.hostinger.com`.
- Consulte na documentação do provedor de e-mail.

### 2.3 `SMTP_PORT` ⏳
- `587` (TLS) ou `465` (SSL). Gmail → `587`. Só o número, sem aspas.

### 2.4 `SMTP_USER` ⏳
- E-mail do remetente usado no login SMTP (endereço completo). Ex: `contato@seuapp.com`.

### 2.5 `SMTP_PASS` ⏳
- Senha do SMTP.
- ⚠️ **Gmail**: não é a senha normal — gere uma **App Password** (conta Google → Segurança → **Senhas de app**). Requer verificação em 2 etapas ativada.
- Marque **Sensitive**.

### 2.6 `SMTP_FROM_EMAIL` ⏳
- E-mail que aparece no campo "De" dos alertas. Normalmente igual ao `SMTP_USER`.

### 2.7 `SMTP_FROM_NAME` ⏳
- Nome exibido como remetente. Ex: `Agro Stock GPS`.

### 2.8 `CRON_SECRET` (opcional) ✅/⏳
- Proteção do endpoint `/api/cron/alerts`. Valor aleatório difícil de adivinhar, ex: `7f3ad9c2210be4db8f19a0c53c`.
- ⚠️ **Se criar**, o `path` do cron em `vercel.json` precisa levar `?secret=<valor>`:
  ```json
  "crons": [{ "path": "/api/cron/alerts?secret=<valor>", "schedule": "0 * * * *" }]
  ```
- Se não criar, pode ignorar esta.

---

## 3. Legenda de status
- ✅ feito · ⏳ pendente · ⭕ não aplicável

### Estado atual (12/08/2026 — parcial)
| Variável | Status | Observação |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | ✅/🔲 | marcar quando confirmado |
| `SMTP_HOST` | ⏳ | depende do Gmail |
| `SMTP_PORT` | ⏳ | 587 (Gmail) |
| `SMTP_USER` | ⏳ | depende do Gmail |
| `SMTP_PASS` | ⏳ | app password do Gmail |
| `SMTP_FROM_EMAIL` | ⏳ | depende do Gmail |
| `SMTP_FROM_NAME` | ⏳ | ex. "Agro Stock GPS" |
| `CRON_SECRET` | ✅/🔲 | se criou, ajustar `vercel.json` |

---

## 4. Próximos passos após configurar tudo

1. **Validar** se as variáveis estão presentes (pelo painel ou via CLI `vercel env ls` na pasta do projeto).
2. **Redeploy** para as variáveis valerem:
   - Dashboard → **Deployments** → ⋮ no último deploy → **Redeploy**.
3. **Testar o cron de hora em hora** (`0 * * * *`) pelos Logs da Vercel (menu **Cron** no projeto).
4. **Confirmar recebimento** de um teste de alerta (Licenças/Campo/Empréstimos → "Enviar teste").

> Lembrete: variáveis salvas só valem em **novos deploys**. Sem redeploy continuará tudo na versão antiga.

---

## 5. Referências
- Docs Vercel — Environment Variables: `https://vercel.com/docs/environment-variables/managing-environment-variables`
- Docs Vercel — Cron Jobs: `https://vercel.com/docs/cron-jobs`
- Key Vars do servidor (origem do código): `server.ts`, `alertEmailTemplates.ts`, `.env.example`