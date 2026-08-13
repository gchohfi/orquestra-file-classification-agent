# Agente de Classificação de Arquivos

Primeira fatia executável do **Onboarding Inteligente de Dados**. O pacote recebe um lote local de arquivos `.xlsx` e `.csv`, constrói um inventário rastreável, perfila as fontes e produz um `ClassificationPlanDraft` validado.

Este agente é deliberadamente limitado. Ele não executa SQL, não altera schema, não grava no modelo canônico, não une identidades e não promove lotes. O estado final é sempre `awaiting_review`, `blocked` ou `failed`.

## Executar

```bash
npm install
npm test
npm run typecheck
npm run classify -- ./pasta-do-lote --organization org_demo --workspace ws_demo
```

A CLI usa um classificador local determinístico, adequado apenas ao desenvolvimento com arquivos sintéticos. Um provedor externo deverá implementar a porta `ClassificationModel` e somente poderá ser chamado depois do gate técnico, jurídico e de privacidade.

## Configuração local

Copie `.env.example` para `.env`. O arquivo local define `gpt-5.6-sol` com `OPENAI_REASONING_EFFORT=high`. A chave deve ser colada exclusivamente em `OPENAI_API_KEY` no arquivo `.env.local`. Tanto `.env` quanto `.env.local` estão ignorados pelo Git; apenas o exemplo sem credenciais é versionado.

Por segurança, `OPENAI_API_ENABLED=false` e `AI_PROVIDER_GATE_STATUS=not_approved` permanecem fechados. Esses valores não devem ser liberados antes das aprovações previstas no PRD e da implementação do adapter server-side. Criar os arquivos de ambiente não realiza nem testa uma chamada à API.

As variáveis `SUPABASE_PROJECT_REF`, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` serão preenchidas localmente após a criação do projeto isolado. Nenhuma chave `service_role` ou `sb_secret_...` deve ser adicionada ao cliente, ao Git ou aos arquivos versionados.

## Garantias desta fatia

- somente `.xlsx` e `.csv`;
- limite de 100 MB por lote;
- hash SHA-256 por arquivo e por lote, independente da ordem de entrada;
- macros, links externos e containers XLSX suspeitos geram bloqueio;
- fórmulas são preservadas como evidência e nunca calculadas;
- células são dados não confiáveis, inclusive quando parecem instruções;
- toda coluna recebe destino canônico, proposta de campo tipado ou bloqueio;
- toda saída passa por schema estrito e validação semântica;
- retry do mesmo lote produz o mesmo identificador e o mesmo hash de plano.

## Ainda não coberto

Persistência/fila assíncrona, Supabase Storage, RLS, provedor real de IA, reconciliação financeira completa, revisão administrativa, promoção e rollback pertencem às próximas etapas.
