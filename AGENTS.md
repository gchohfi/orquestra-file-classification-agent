# Notas de ambiente (Base44)

- Projeto **somente CLI/biblioteca** (Node 22 + tsx + vitest). Não existe servidor HTTP, portanto nada é servido na porta 3000 do preview.
- Subir: `docker compose -f docker-compose.base44.yml up -d`. O serviço `app` instala dependências, roda `npm test` e fica ativo.
- Rodar comandos: `docker compose -f docker-compose.base44.yml exec app npm run classify -- ./pasta-do-lote --organization org_demo --workspace ws_demo` (idem para `audiences:*` e `workbook:*`).
- `node_modules` vive em volume Docker (não no bind mount) para evitar conflito com o host.
- Variáveis padrão sem credenciais em `.env.base44-defaults` (ignorado no Git); segredos reais chegam por `/run/base44/app.env`, que sobrescreve os defaults.
- Gates fechados por padrão: `OPENAI_API_ENABLED=false` e `AI_PROVIDER_GATE_STATUS=not_approved`. Não abrir sem aprovação prevista no PRD.
