# JoggaHub Mobile (iOS + Android)

Expo SDK 58 + Expo Router + TypeScript. Usa o **mesmo** Supabase (auth, banco, RLS,
edge functions) do app web. Auditoria e plano: [`../docs/mobile/AUDIT.md`](../docs/mobile/AUDIT.md).

## Rodar

```bash
cd mobile
cp .env.example .env   # preencher — o app mostra erro se faltar algo
npm install
npx expo start         # Expo Go ou development build
```

> ⚠️ Ainda não existe ambiente de staging. Com o `.env` apontando para o Supabase de
> produção, login e cadastro são reais. Fluxos de pagamento **não** existem no app ainda.

## Checagens

```bash
npm run typecheck
npx expo lint
npx expo-doctor
```

## Estrutura

```
src/app/            rotas (Expo Router) — (auth)/ login e cadastro, (tabs)/ app logado
src/components/     Button, TextField, Screen
src/features/auth/  AuthProvider (sessão), mensagens de erro em pt-BR
src/lib/            env (validação), secureStorage (Keychain/Keystore), supabase, shared
src/theme/          tokens de design (cores/tipografia do web)
```

## Decisões

- **Sessão** fica no Keychain (iOS) / Keystore (Android) via `expo-secure-store`, dividida
  em blocos por causa do limite de tamanho. O guia oficial usa SQLite sem criptografia —
  trocado de propósito.
- **Rotas protegidas** usam `Stack.Protected`: telas logadas não abrem nem por deep link sem sessão.
- **Código compartilhado**: `src/lib/shared.ts` reexporta módulos puros de `../src/app/lib`
  (regras de jogadores, cutoffs, horário de parede, sets de futevôlei). Alterar lá, nunca copiar.
- **Sem fallback de backend**: configuração ausente/ inválida = tela de erro, nunca produção por padrão.
- Bundle ID provisório `com.joggahub.app` (builds não-produção recebem sufixo). **Confirmar antes do 1º build de loja.**
