# Agente OpenAI de classificação

O adapter usa exclusivamente a Responses API oficial com estas invariantes fixas no código:

- modelo `gpt-5.6-sol`;
- raciocínio `high`;
- `store: false` e `background: false`;
- cache implícito desabilitado (`prompt_cache_options.mode: explicit` sem breakpoint);
- Structured Outputs estrito a partir do contrato Zod;
- nenhuma ferramenta, conversa anterior ou fallback de modelo;
- endpoint `https://api.openai.com/v1` sem override.

O modelo não recebe linhas nem valores das células. O payload contém apenas IDs opacos, contagens, perfis de tipo, cabeçalhos normalizados e truncados, catálogo controlado e uma proposta determinística. Nomes de arquivos, nomes de abas e cabeçalhos brutos são omitidos. Cabeçalhos com aparência de instrução ou identificador são redigidos.

Antes e depois da resposta, regras locais mantêm alertas bloqueantes, identidade provisória, ambiguidades financeiras, cobertura e linhagem. A saída continua sendo `ClassificationPlanDraft`; nunca promove ou altera dados automaticamente.

## Ativação server-side

A factory `createOpenAIClassificationRuntime` falha fechada. Ela exige, no processo do servidor:

```dotenv
AI_PROVIDER=openai
OPENAI_API_ENABLED=true
AI_PROVIDER_GATE_STATUS=approved
OPENAI_API_KEY=<chave-rotacionada>
AI_PROVIDER_APPROVAL_ID=<registro-interno-de-aprovacao>
```

A CLI carrega `.env` e depois `.env.local`. O provedor externo só é escolhido explicitamente:

```bash
npm run classify -- ./lote-sintetico --organization org_demo --workspace ws_demo --provider openai
```

No modo OpenAI, a saída da CLI é redigida e contém somente status, hashes, contagens e códigos de revisão. O modo determinístico local mantém a saída detalhada para desenvolvimento sintético.

Se as variáveis opcionais `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT` ou `OPENAI_API_BASE_URL` existirem, elas precisam coincidir exatamente com as invariantes acima. Não há configuração que permita reduzir o raciocínio ou trocar o modelo.

Não habilite a transferência de dados clínicos reais apenas por configurar a chave. `store: false` não equivale, isoladamente, a Zero Data Retention. A ativação exige aprovação técnica, jurídica e de privacidade da organização e validação em projeto OpenAI dedicado com dados sintéticos.
