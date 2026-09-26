# 공유 저장소(Supabase) 설정 가이드

이 앱은 이제 브라우저 로컬 저장 대신 **Supabase**(무료 Postgres DB + 실시간 동기화 + 로그인)를 씁니다.
아래 순서대로 한 번만 설정하면, 친구들이 각자 다른 기기/브라우저에서 같은 그룹을 실시간으로 공유할 수 있어요.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 무료 회원가입 (GitHub 계정으로 바로 가능해요)
2. "New project" 클릭 → 프로젝트 이름/비밀번호(DB 비밀번호, 아무거나 강력하게)/리전(Northeast Asia (Seoul) 추천) 입력 후 생성
3. 1~2분 정도 프로비저닝을 기다려요

## 2. DB 스키마 적용

1. 왼쪽 메뉴 **SQL Editor** 클릭 → "New query"
2. 이 프로젝트의 `supabase/schema.sql` 파일 내용을 전체 복사해서 붙여넣기
3. 오른쪽 아래 **Run** 클릭
4. 이어서 `supabase/migrations` 폴더의 SQL 파일을 **파일명 순서대로** 하나씩 복사해 실행
5. 모두 에러 없이 끝나면 완료 (테이블, 보안 정책, 실시간 동기화와 최신 기능이 설정돼요)

> 이미 사용 중인 프로젝트라면 `schema.sql`을 다시 실행하지 말고, 아직 적용하지 않은 `supabase/migrations` 파일만 실행하세요. 실행 전에는 Database > Backups에서 백업을 먼저 만들어두는 것을 권장합니다.

## 3. 이메일 + 비밀번호 로그인 설정

1. 왼쪽 메뉴 **Authentication > Sign In / Providers**에서 **Email**이 켜져 있는지 확인합니다.
2. 소규모 친구 그룹이고 Supabase 기본 메일 제한을 피하려면 **Confirm email**을 끕니다. 그러면 메일 발송 없이 앱 안에서 바로 가입됩니다. 이메일 소유 확인이 필요한 서비스라면 켜두세요.
3. **Authentication > URL Configuration**에서:
   - **Site URL**: 배포 주소(예: `https://내프로젝트.vercel.app`)
   - **Redirect URLs**: `http://localhost:5173`과 배포 주소를 모두 추가

> 커스텀 SMTP나 메일 템플릿 수정은 필요하지 않아요. Confirm email을 끔 경우 Supabase 기본 메일은 비밀번호 재설정할 때만 사용합니다.

> 참고: Supabase 무료 플랜은 자체 이메일 발송에 시간당 발송 제한이 있어요. 친구 여러 명이 동시에 테스트하다 "이메일이 안 와요" 하면, 이 제한에 걸렸을 가능성이 커요. 나중에 실제로 여러 명이 쓰게 되면 **Authentication > Providers > Email > SMTP Settings**에서 본인 이메일(Gmail 등)이나 Resend 같은 서비스로 직접 발송 설정을 해주는 게 좋아요.

## 4. 프로젝트 키 복사해서 .env.local 만들기

1. 프로젝트의 **Connect** 버튼 또는 **Settings > API Keys** 메뉴 열기
2. **Project URL** 과 **Publishable key**를 복사
3. 이 프로젝트 루트에서:
   ```bash
   cp .env.example .env.local
   ```
4. `.env.local` 을 열어 값을 채워넣기:
   ```
   VITE_SUPABASE_URL=복사한 Project URL
   VITE_SUPABASE_PUBLISHABLE_KEY=복사한 Publishable key
   ```
   (`.env.local` 은 `.gitignore`에 이미 포함되어 있어서 GitHub에는 올라가지 않아요. Publishable key는 브라우저용 키지만 관례상 커밋하지 않아요.)

## 5. 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 → **처음 가입** → 이메일과 비밀번호 입력 → 로그인 → 그룹 생성/참여! Confirm email을 켜두었다면 처음 가입 중에 확인 메일 단계가 추가됩니다.

친구도 똑같이 이 프로젝트를 받아서 **같은 .env.local 값**(같은 Supabase 프로젝트)으로 실행하면, 서로 다른 기기에서도 같은 그룹을 실시간으로 공유하게 돼요.

## 배포하면서 같이 쓰기 (Vercel 예시)

1. GitHub에 이 프로젝트를 올린다
2. https://vercel.com 에서 GitHub 저장소를 Import
3. **Environment Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 를 똑같이 추가
4. 배포 완료 후 나온 도메인을 Supabase의 **Site URL / Redirect URLs** 에도 추가해줘야 로그인이 정상 작동해요
5. 휴대폰에서 배포 주소를 열면 설치 안내가 나타납니다. iPhone은 Safari 공유 버튼의 **홈 화면에 추가**, Android는 안내의 **홈 화면에 앱 추가**를 누르면 앱 아이콘으로 설치됩니다.

## 문제 해결

- **로그인 메일이 안 와요**: 스팸함 확인 → 그래도 없으면 Supabase 대시보드 Authentication > Users 에 계정이 생겼는지 확인 (생겼으면 발송 제한 문제, 위 SMTP 설정 참고)
- **로그인은 됐는데 그룹이 안 보여요**: `supabase/schema.sql` 이 제대로 실행됐는지, Table Editor에서 `profiles`, `groups` 등 테이블이 생성됐는지 확인
- **"row-level security policy" 에러가 떠요**: schema.sql의 RLS 정책 부분이 다 실행됐는지 확인 (SQL Editor에서 에러 없이 끝까지 실행됐어야 해요)
