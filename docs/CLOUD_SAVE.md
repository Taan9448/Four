# 계정·클라우드 저장 설정 (Supabase)

게임 쪽 설계는 `docs/GAME_DESIGN.md`의 「계정·클라우드 저장」 항목이 기준이다. 이 문서는 Supabase 대시보드에서 사람이 한 번 해 둘 일이다.
프로젝트 주소와 publishable 키는 `src/ui/cloud-config.ts`에 있다. 둘 다 브라우저에 공개되는 값이고, 남의 저장은 아래 행 보안이 막는다.

## 1. 저장 테이블 만들기 (SQL Editor → New query → 붙여 넣고 Run)

```sql
-- 계정마다 저장 한 행. data = 게임의 저장 묶음(JSON), rev = 올릴 때마다 1씩(두 기기가 서로 덮지 않게)
create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  device text
);

-- 행 보안: 로그인한 사람은 자기 행만 읽고·만들고·고친다(남의 행은 보이지도 않는다)
alter table public.saves enable row level security;

drop policy if exists "saves: read own" on public.saves;
create policy "saves: read own" on public.saves for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "saves: insert own" on public.saves;
create policy "saves: insert own" on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "saves: update own" on public.saves;
create policy "saves: update own" on public.saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

지우기(delete) 정책은 두지 않는다 — 게임은 행을 지우지 않는다. 계정을 지우면 행도 함께 지워진다(`on delete cascade`).

## 2. 돌아올 주소 (Authentication → URL Configuration)

- **Site URL:** `https://taan9448.github.io/Four/`
- **Redirect URLs**에 더하기:
  - `https://taan9448.github.io/Four/`
  - `http://localhost:5173/` (개발용, `npm run dev`)

구글·카카오 로그인을 마치면 이 주소로 `?code=…`를 달고 돌아오고(아이디·비밀번호 로그인은 이 주소를 쓰지 않는다), 게임이 그 코드로 로그인을 마친 뒤 주소를 지운다.

## 3. 로그인 수단 (Authentication → Sign In / Providers)

### 아이디 · 비밀번호 (지금 쓰는 것, 2026-10-15)
- 게임은 아이디를 `아이디@player.cheonoe.app`(안에서만 쓰는 이메일, `cloud-config.ts`의 `idDomain`)으로 바꿔 Supabase의 **Email** 로그인(이메일 + 비밀번호)으로 가입·로그인한다. 메일은 보내지 않는다.
- **Email** 공급자를 켜 두고, 그 안의 **Confirm email**은 **끈다**(켜 두면 가입해도 메일 확인을 기다리며 로그인되지 않는다 — 게임이 "Confirm email을 끈다"고 알려 준다).
  바로 가는 주소: `https://supabase.com/dashboard/project/jbrxhycnipzlfbpxytuj/auth/providers`
- 비밀번호를 잊은 사람은 스스로 찾지 못한다. Authentication → Users에서 그 사람(`아이디@player.cheonoe.app`)을 찾아 비밀번호를 새로 정해 준다.
- 비밀번호 최소 길이는 Supabase 기본 6자(Authentication → Sign In / Providers → Email의 Minimum password length와 게임의 `PASSWORD_MIN`을 같게 둔다).

### 구글 · 카카오 (나중에)
#### 구글
1. Google Cloud Console → API 및 서비스 → OAuth 동의 화면(외부, 앱 이름 「천외귀환」) → 사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션).
2. **승인된 리디렉션 URI**: Supabase의 Google 공급자 화면에 보이는 콜백 주소(`https://jbrxhycnipzlfbpxytuj.supabase.co/auth/v1/callback`).
3. 받은 클라이언트 ID·보안 비밀을 Supabase → Providers → Google에 넣고 켠다.

#### 카카오
1. Kakao Developers → 내 애플리케이션 → 앱 추가.
2. 카카오 로그인 활성화, **Redirect URI**에 `https://jbrxhycnipzlfbpxytuj.supabase.co/auth/v1/callback`.
3. 동의 항목: 닉네임·프로필 사진(필수), **카카오계정(이메일)** — 이메일 동의는 비즈 앱 전환이 필요할 수 있다(개인 개발자도 사업자 없이 비즈 앱 전환 가능).
4. 앱 키의 **REST API 키**(Client ID)와 보안 → **Client Secret**(코드 생성 후 활성화)을 Supabase → Providers → Kakao에 넣고 켠다.

공급자를 켠 뒤 `src/ui/cloud-config.ts`의 `providers`에 그 단추를 넣으면 게임에 나타난다(2026-10-15에는 비어 있어 아이디·비밀번호만 보인다).

## 4. 확인

1. 게임 시작 화면의 로그인 판 → **회원가입** 탭에서 아이디·비밀번호로 가입(또는 **게스트로 시작**).
2. 로그인하면 메뉴 위에 「● 아이디 · 로그아웃」이 보이고, 설정 › 저장 맨 위에 「계정과 맞춤 · 시각」이 보인다.
3. Supabase → Table Editor → `saves`에 행 하나가 생긴다(`rev`가 진행할 때마다 오른다).
4. 다른 기기·브라우저에서 같은 계정으로 로그인하면 그 기록으로 이어진다(둘 다 기록이 있으면 어느 쪽을 쓸지 묻는다).
