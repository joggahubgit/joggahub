# JoggaHub Mobile — Auditoria técnica e plano (Fase 1)

Data: 2026-10-29 · Branch: `feature/mobile-app` (criada a partir de `master` @ `e13385f`)

Fonte: leitura do código em `master`. Onde a fonte é só migration versionada, está marcado
**(confirmar no banco real)** — este projeto tem colunas/policies criadas direto no SQL Editor
sem migration.

---

## 1. Arquitetura e stack atuais

| Camada | Tecnologia | Observação |
|---|---|---|
| Web (jogador) | React 18.3 + TypeScript + Vite 6 + Tailwind 4, React Router 7 | `index.html` → `src/main.tsx` → `src/app/App.tsx` |
| Web (gestor) | Mesmo bundle Vite, entrada `gestor.html` | `src/gestor/` — painel do clube |
| UI | Tailwind + lucide-react; Radix/MUI no package.json mas pouco usados | Layout já é mobile-first (coluna `max-w-md`) |
| Backend | Supabase: Postgres + RLS, Auth, Storage (`avatars`), Realtime, 13 Edge Functions (Deno) | Deploy das functions **só pelo Dashboard** |
| Pagamento | Stripe **Checkout hospedado** (redirect), live mode, só cartão, BRL | Holds (captura manual) + cron `process-game-transitions` |
| Email | Resend (SMTP do Supabase Auth + `send-notification-email`) | |
| Deploy | Vercel (`joggahub.com.br`), `vercel.json` com rewrites | |
| Testes | Vitest — 5 arquivos de regra pura (`src/tests/`) | Sem testes de UI/integração |

Domínio: futebol (society/futsal, 10–18 jogadores) e futevôlei (2v2 fechado, 4 jogadores).
Idioma: pt-BR (existe `LanguageContext` com `en`, usado em só 3 telas).

## 2. Inventário de features (app do jogador)

Legenda: **R1** = primeira versão mobile · **R2** = versão seguinte · **WEB** = só web ·
**MOCK** = tela existe mas não tem backend · **FALTA** = não existe.

| Feature | Estado no web | Mobile |
|---|---|---|
| Cadastro email/senha + confirmação por email | Funciona (`Auth.tsx`, `/auth/callback`) | **R1** |
| Login email/senha | Funciona | **R1** |
| Login Google | Funciona (OAuth redirect) | **R1** (exige Sign in with Apple no iOS — ver §6) |
| Recuperar senha | **FALTA** (nenhum `resetPasswordForEmail` no código) | **R1** — implementar (web também se beneficia) |
| Onboarding / perfil / editar perfil / avatar | Funciona | **R1** |
| Alterar senha | Funciona (`SettingsPage`) | **R1** |
| Excluir conta | Só link `mailto:` | **R1** — obrigatório para as lojas, precisa de backend (§6) |
| Buscar quadras / detalhes / grade de horários | Funciona (`FindCourts`, `CourtDetails`, realtime) | **R1** |
| Reserva privada (full / split) com hold | Funciona | **R1** |
| Criar partida aberta (organizador) | Funciona | **R1** |
| Buscar partidas / entrar / sair / adicionar jogador | Funciona (`FindGames`, `OpenGamePage`, `leave-game`) | **R1** |
| Pagar reserva criada pelo gestor (`pay_reservation`) | Funciona | **R1** |
| Cancelar partida / reserva | Funciona (`cancel-game`, `cancel-booking`) | **R1** |
| Minhas reservas / pagamentos | Funciona (`MyBookings`, `PaymentsPage`) | **R1** |
| Notificações in-app (+ realtime) | Funciona (tabela `notifications`) | **R1** |
| Resultado de partida + rating (futevôlei) | Funciona (`GameResultSubmit`, `submit-game-result`) | **R1** |
| Perfil público, estatísticas, seguir | Funciona | **R1** |
| Comunidade: feed + ranking | Funciona (verificar: `Community.tsx` ainda importa `ComingSoonBanner`) | **R1** |
| Chat por partida (realtime) | Funciona (`GameChat`) | **R1** |
| Push notifications | **FALTA** | **R2** (infra nova — §4) |
| Deep links para partida (compartilhar no WhatsApp) | Web usa URL `/open-game/:id` | **R1** (Universal/App Links) |
| Aulas, Competições, Grupos fixos/recorrentes/assinatura, `CourtManagerDashboard`, `CreateGame` | **MOCK** (sem tabela) | Fora do mobile |
| Planos de mensalidade de clube | Branch `feature/planos-clube`, não em produção | Fora até ir pro master (envolve assinatura — avaliar regras das lojas na época) |
| Painel do gestor | Funciona | **WEB** (continua no navegador) |
| Idioma inglês | Parcial (3 telas) | Fora (só pt-BR) |

## 3. Arquitetura recomendada

**React Native + Expo (SDK 58) + Expo Router, em uma pasta `mobile/` dentro do mesmo repo.**

Por quê:
- O web já é React + TypeScript + Supabase JS — mesma linguagem, mesmo SDK de backend, mesmos tipos.
- Expo resolve build/assinatura/envio às lojas (EAS), push (Expo Push), deep links e OTA sem ejetar.
- Pasta separada, com `package.json` próprio, **não toca** o build do Vite nem a Vercel
  (o `tsconfig.json` do web só inclui `src/`; a Vercel builda a raiz).
- Não vale migrar para monorepo com workspaces agora: mexeria no `package.json` da raiz e no
  pipeline da Vercel sem ganho imediato.

**Descartados:** WebView/Capacitor (o pedido exige experiência nativa; as lojas rejeitam
"site embrulhado"); Flutter/nativo puro (reescreveria tipos e regras em outra linguagem).

### Compartilhamento de código

O Metro (bundler do Expo) é configurado para enxergar `../src/app/lib/`. O mobile importa os
módulos **puros** (zero imports, testados pelo Vitest) direto do web:

- `gameConfig.ts` — min/max por esporte, cutoffs, taxa
- `futevoleiSetRules.ts`, `futevoleiLevels.ts`
- `wallClock.ts` — exibição de horário "de parede" (essencial: ver risco de fuso, §6)
- `profileFields.ts`

Não reaproveitável direto: componentes (DOM/Tailwind), `src/lib/supabase.ts` (usa
`import.meta.env` do Vite), `checkout.ts`/`notify.ts`/`emailTemplates.ts` (importam o client do web).
Os tipos de `src/lib/supabase.ts` serão movidos para um arquivo puro quando necessário
(mudança pequena e compatível no web, a combinar).

## 4. O que precisa ser feito especificamente para o mobile

1. **Cliente Supabase nativo** com sessão em armazenamento seguro (Keychain/Keystore via
   `expo-secure-store` + AsyncStorage criptografado, padrão da documentação do Supabase),
   refresh automático ligado ao ciclo de vida do app (`AppState`).
2. **Auth com deep link**: `joggahub://auth/callback` para confirmação de email, Google e
   recuperação de senha (precisa ser adicionado às Redirect URLs do Supabase).
3. **Pagamento**: abrir o Stripe Checkout num navegador seguro dentro do app
   (`expo-web-browser` / `openAuthSessionAsync`) e voltar por deep link. Reaproveita as
   functions de checkout atuais. **Depende do item 1 de §6** (finalização no servidor).
   Reservas de quadra são serviço físico → **não** usar Apple IAP / Google Play Billing.
4. **Exclusão de conta**: nova edge function `delete-account` (service role), definida a regra
   de retenção (partidas/pagamentos passados ficam anonimizados).
5. **Push (R2)**: tabela `push_tokens` (user_id, token, plataforma), registro após login com
   pedido de permissão contextual, envio via Expo Push a partir das functions que já criam
   notificação in-app.
6. **Universal Links / App Links**: `apple-app-site-association` e `assetlinks.json` em
   `public/.well-known/` do web (arquivos estáticos novos, não alteram o app web).
7. Design system nativo com os tokens do web (§8).

## 5. Riscos — auth, pagamento, banco, produção

### 🔴 Bloqueadores (afetam o web hoje e precisam ser resolvidos antes do pagamento no mobile)

1. **Criação da partida depende do navegador depois do pagamento.**
   Nos modos `organizer` (partida aberta) e `private_game`, quem cria a linha em `games`
   e `game_players` é `PaymentSuccess.tsx`, no cliente, lendo parâmetros da URL de retorno.
   O próprio `stripe-webhook` documenta que não cobre esse caso. Consequências:
   - Se o usuário fechar a aba/app antes da tela de sucesso terminar, o hold existe no Stripe
     mas a partida não é criada (e no modo `organizer` o slot fica livre).
   - No mobile o risco é maior: o retorno do navegador para o app pode falhar ou o sistema
     pode matar o app.
   - Os valores gravados (`price_per_player`, `court_price`, `max_players`, horário) vêm da
     URL e podem ser editados por quem paga. `price_per_player` é depois usado como preço
     dos outros jogadores no `create-checkout-session`.

   **Solução proposta (menor mudança segura):** gravar os dados necessários no `metadata`
   da sessão Stripe no servidor (que já calcula o preço) e fazer o `stripe-webhook` criar a
   partida de forma idempotente (chave = `session.id`). `PaymentSuccess` passa a só **ler** o
   estado (com polling curto) em vez de escrever. Serve igual para web e mobile.
   Mexe em 3 edge functions de pagamento em produção → **precisa da sua aprovação** e de
   teste controlado (valor baixo + estorno, como no plano de clube).

2. **Policy de INSERT em `games` aceita qualquer partida do próprio usuário**
   (`20260417_fix_games_rls.sql`: `auth.uid() = created_by or auth.uid() = organizer_id`)
   **(confirmar no banco real)**. Um usuário logado pode inserir uma partida
   `status='confirmed_booking'` sem pagar. Fecha naturalmente quando o item 1 tirar o insert
   do cliente (aí a policy pode ser removida).

3. **`successUrl`/`cancelUrl` vêm do cliente sem validação** nas duas functions de checkout.
   Para o mobile vamos precisar de uma URL de retorno diferente; o certo é o servidor aceitar
   só uma lista fixa de origens (`https://joggahub.com.br`, `joggahub://`).

### 🟠 Altos

4. **Fuso horário** (achado de 2026-07-17, ainda aberto): horários são gravados sem fuso e
   o Postgres interpreta como UTC. No celular o fuso do aparelho entra em jogo. O mobile vai
   **sempre** exibir com `wallClock.ts` e nunca converter pelo fuso do aparelho; a correção
   de raiz continua pendente e deve vir antes de qualquer lembrete push por horário.
5. **Sign in with Apple** — a App Store exige uma opção de login equivalente e focada em
   privacidade quando o app oferece login de terceiros (Google). Precisa de configuração no
   Apple Developer + provider Apple no Supabase. (Confirmar a regra vigente na diretriz 4.8
   antes do envio.)
6. **Exclusão de conta só por email** — insuficiente para Apple (5.1.1(v)) e Google Play.
7. **Cron `process-game-transitions` sem auth** — conhecido e adiado de propósito; não
   bloqueia o mobile.

### 🟡 Médios

8. `game_players.player_id` e `games.organizer_id` sem foreign key.
9. Listas sem paginação (só 5 `.limit/.range` no app) — ok no volume atual, revisar no mobile.
10. `calcFees` usa `Math.ceil` em float (R$0,01 a mais em alguns valores); o servidor usa
    `Math.round` → o valor exibido antes do checkout pode divergir 1 centavo do cobrado.
11. Ambiente: só existe produção (Supabase + Stripe live). **Não há staging.** Builds de
    desenvolvimento do mobile apontariam para o banco real e cobrança real — ver §9.

## 6. Estrutura de diretórios proposta

```
joggahub/
├─ src/                       # web (inalterado)
├─ supabase/                  # backend compartilhado (inalterado nesta fase)
├─ docs/mobile/AUDIT.md       # este documento
└─ mobile/                    # app Expo (package.json próprio)
   ├─ app.config.ts           # nome, bundle id, scheme, variáveis por ambiente
   ├─ eas.json                # perfis development / preview / production
   ├─ metro.config.js         # enxerga ../src/app/lib (código puro compartilhado)
   ├─ app/                    # Expo Router (rotas = arquivos)
   │  ├─ _layout.tsx          # providers + gate de auth
   │  ├─ (auth)/              # login, cadastro, recuperar senha
   │  └─ (tabs)/              # Início, Quadras, Partidas, Perfil
   └─ src/
      ├─ lib/                 # supabase client, env, storage seguro, api/*
      ├─ theme/               # tokens (cores, tipografia, espaçamento)
      ├─ components/          # Button, Card, Input, Screen, EmptyState…
      └─ features/            # auth, courts, games, bookings, profile…
```

## 7. Plano em fases

| Fase | Entrega | Toca produção? |
|---|---|---|
| **1 — Auditoria** | Este documento | Não |
| **2 — Fundação** ✅ base pronta (2026-10-29) | App Expo, navegação, design system, env, cliente Supabase seguro, login/cadastro/logout/sessão. Typecheck, lint, expo-doctor e export Android/iOS ok; login testado em iPhone real via Expo Go (2026-10-29); Android ainda não testado em aparelho | Não |
| **2b — Backend pré-requisito** | Finalização de pagamento no webhook (§5.1), allowlist de URLs (§5.3), `delete-account`, recuperação de senha | **Sim — com aprovação, teste controlado** |
| **3 — Core** | Quadras → horário → revisão → Stripe → confirmação → Minhas reservas; partidas abertas (entrar/sair/organizar); pagar reserva do gestor; cancelar | Não (usa backend da 2b) |
| **4 — Suporte** | Perfil/edição/avatar, notificações in-app, comunidade, chat, resultados, deep links, push | Push: tabela nova (migration compatível) |
| **5 — Qualidade** | Testes unitários (Jest), fluxos críticos, revisão de segurança, acessibilidade | Não |
| **6 — Release** | EAS Build iOS/Android, TestFlight + teste interno Play, ficha das lojas | Não |

## 8. Design system (tokens extraídos do web)

- Primária: `violet-600` `#7C3AED` (100+ usos); gradiente de marca `purple-600 → purple-700/indigo-800`.
- Superfícies: branco, `gray-50` de fundo; bordas `gray-100`.
- Estados: sucesso `green-600`, alerta `amber`, erro `#D4183D` (`--destructive`).
- Tipografia: Inter (300–900). Raio: cards `rounded-2xl/3xl` (16–24px), botões `rounded-2xl`.
- Ícones: lucide (existe `lucide-react-native` com os mesmos nomes).
- Logo: `public/logo.png` (precisa de versão em alta resolução/vetor para ícone e splash).

## 9. Credenciais, contas e configurações que serão necessárias

| Item | Para quê | Quem |
|---|---|---|
| Apple Developer Program (US$ 99/ano) | Build iOS, TestFlight, App Store, Sign in with Apple | Você |
| Google Play Console (US$ 25 único) | Publicação Android | Você |
| Conta Expo / EAS | Builds na nuvem, credenciais de assinatura, push | Você (grátis para começar) |
| Bundle ID / package name | Ex.: `com.joggahub.app` — **definir antes do 1º build, não muda depois** | Você decide |
| Redirect URL `joggahub://auth/callback` no Supabase Auth | Login/recuperação no app | Você (Dashboard) |
| Client OAuth Google para iOS/Android (ou reaproveitar o web via browser) | Login Google nativo | Você (Google Cloud) |
| Provider Apple no Supabase + Service ID/Key | Sign in with Apple | Você |
| **Ambiente de teste**: projeto Supabase de staging + chaves Stripe de teste | Não cobrar cliente real nem sujar produção durante o desenvolvimento | Você (recomendo fortemente) |
| APNs key (iOS) e FCM (Android) | Push (R2) — o EAS gerencia | Você |
| Ícone 1024×1024 e splash em alta | Lojas | Você / design |
| URL da política de privacidade e termos públicos | Lojas — hoje existem `/privacy` e `/terms` no web, confirmar conteúdo | Você |
| Email/URL de suporte | Lojas — `info@joggahub.com` (confirmar) | Você |
| Conta demo para a revisão da Apple | Revisor precisa logar sem pagar | Você |
| CNPJ / dados da empresa | Conta de organização nas lojas (recomendado vs. pessoa física) | Você |

## 10. Decisões pendentes

1. Aprovar a mudança de backend da Fase 2b (finalização de pagamento no servidor).
2. Criar um ambiente de staging (Supabase + Stripe test) ou aceitar desenvolver contra produção
   só com dados de teste via SQL (padrão atual).
3. Bundle ID / package name definitivo.
4. Conta de organização (CNPJ) ou pessoa física nas lojas.

---

## 11. Status do port (atualizado 2026-10-29)

Decisões do usuário: **pagamento por último** e **visual igual ao web**. As telas usam as
mesmas classes Tailwind do web via NativeWind 4, com a paleta exata do Tailwind v4 do web
(`mobile/scripts/gen-palette.mjs`).

### Telas portadas 1:1 do web

Boas-vindas (Landing), Login/Cadastro, Termos, Privacidade, Início (com faixa "Confirme o
resultado" e banner de boas-vindas), Menu, Notificações, Configurações (alterar senha),
Ajuda, Encontrar Jogos, Encontrar Quadras, Página da quadra, Página da partida (com envio/
confirmação de resultado de futevôlei), Perfil, Editar perfil, Perfil público (seguir),
Comunidade (feed + ranking), Chat da partida, Minhas Reservas, Pagamentos (histórico),
Onboarding (com o mesmo redirecionamento de perfil incompleto). Aulas/Competições → tela
"Em breve", como o banner do web.

### Ficam para a fase de pagamento (abrem o site por enquanto)

Reservar quadra / criar partida privada ou aberta, entrar pagando, pagar reserva do gestor,
sair da partida, remover jogador, adicionar jogador, cancelar partida, cancelar reserva.
A UI e os textos dessas janelas já estão portados; só o botão final abre o site.

### Desvios intencionais em relação ao web

| Onde | Web | App | Por quê |
|---|---|---|---|
| Login | Botões Google e Apple (Apple sem ação) | Só email | Provedores não configurados para o app; Sign in with Apple é obrigatório na App Store junto com Google |
| Boas-vindas | Seletor de idioma | Sem seletor | App só pt-BR |
| Encontrar Jogos | Busca não filtra | Busca filtra | Campo inerte no web |
| Página da quadra | Compartilhar e Favoritar sem ação | Compartilhar funciona; sem Favoritar | Favoritos não existem |
| Comunidade › Mensagens | 3 conversas inventadas + contador falso | Só o aviso "Em breve" | Conteúdo falso |
| Comunidade | Lupa sem ação | Sem lupa | Inerte |
| Horários (pagamentos, datas) | Alguns convertem pelo fuso do navegador | Sempre horário "de parede" | Bug de fuso conhecido |
| Cidade (perfil/onboarding) | Geolocalização do navegador + OpenStreetMap | Localização do aparelho | API nativa |
| Telas | Escrevem "status retroativo" no banco ao abrir | Só leitura | Mudança de status é papel do servidor |

### Textos do web a corrigir (web e app) antes de enviar às lojas

1. Termos e Privacidade: telefone **(11) 4002-8922** (número fictício de propaganda).
2. Privacidade: diz que coleta **CPF e data de nascimento** e usa **"criptografia de ponta a ponta"** — não é verdade hoje.
3. Boas-vindas: **"Mais de 500 quadras"** e **"Competições"** (inexistente).
4. Entrar na partida: **"Taxa de serviço (15%)"** — a real é 8% + R$ 2,50.
5. Painel de divisão (quadra): **"12 horas antes do jogo"** — a regra atual é 2h.
6. Onboarding/Início: **"+20 XP"** — XP não aparece mais em lugar nenhum.
7. Página da partida (futebol): banners de **MVP/XP** de um fluxo que não existe mais.
