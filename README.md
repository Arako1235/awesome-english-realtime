# Awesome English Realtime

집 웹, 학원 PC, 개인 노트북에서 같은 업무 데이터를 실시간으로 사용하는 Awesome English 업무관리 앱입니다.

## 핵심 차이

이 프로젝트는 로컬 저장 데모가 아니라 Supabase 클라우드 DB를 기본 저장소로 사용합니다.

- 이메일 매직링크 로그인
- Supabase Postgres 저장
- Row Level Security로 로그인 사용자별 데이터 분리
- Supabase Realtime Postgres Changes 구독
- 한 기기에서 업무, 타이머, 아이디어, 리포트를 바꾸면 다른 기기 화면도 자동 갱신
- 설정에서 원장님 이메일을 공유 멤버로 추가하면 그 이메일로 로그인한 사람도 같은 Awesome English 작업공간을 실시간으로 공유
- Supabase 환경변수가 없을 때만 로컬 데모 모드로 실행

## 구현 기능

- 오늘: 핵심업무, 계획/실제/남은 시간, 시간표, 현재 타이머, 업무 추가, 아이디어 빠른 저장
- 이번 주: RUN/GROW/BUILD/IDEA 목표 대비 실제시간, 경고 문장, 초과 업무
- 반복업무: 주간/월간/분기/반기/연간 규칙, 앱 실행 시 누락 업무 자동 생성, 중복 방지
- 아이디어: 칸반 보관함, 과다 실행 경고, 실제 업무 전환
- 대시보드: 주간 성과 숫자와 시간 차트
- 리포트: 경영 기여 리포트 자동 초안, 수정/저장/복사/인쇄
- 설정: 주간 목표시간, 공유 멤버 추가, 예시 데이터 불러오기/삭제, 로그아웃

## Supabase 설정

1. Supabase 프로젝트를 만듭니다.
2. Authentication > Providers에서 Email 로그인을 켭니다.
3. Authentication > URL Configuration에 배포 URL과 로컬 URL을 등록합니다.
   - 로컬: `http://localhost:3000`
   - 현재 이 작업공간에서 실행 중인 로컬 서버: `http://localhost:3001`
   - 배포 후: 실제 배포 URL
4. SQL Editor에서 아래 파일 내용을 실행합니다.

```text
supabase/migrations/20260816000000_initial_schema.sql
```

이 SQL은 테이블, enum, RLS 정책, authenticated 권한 grant, Realtime publication 등록을 포함합니다. 공동 작업공간 공유 기능은 `20260816010000_add_shared_workspaces.sql`도 이어서 실행해야 합니다.

5. `.env.local`을 만듭니다.

```bash
NEXT_PUBLIC_APP_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

`service_role` 키는 절대 브라우저 환경변수에 넣지 마세요.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 터미널에 표시된 Local URL을 엽니다. 현재 작업공간에서는 기존 서버가 3000번을 쓰고 있어 `http://localhost:3001`로 실행됩니다.

## 배포

Vercel, Netlify, Cloudflare Pages 등 Next.js를 지원하는 호스팅에 배포할 수 있습니다.

배포 환경변수에도 아래 세 값을 넣습니다.

```bash
NEXT_PUBLIC_APP_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

배포 후 Supabase Authentication > URL Configuration에 배포 URL을 추가해야 이메일 로그인 링크가 정상 작동합니다.

## 테스트

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## 처음 사용하는 순서

1. Supabase SQL 마이그레이션을 실행합니다.
2. `.env.local`에 Supabase URL과 publishable key를 넣습니다.
3. 앱을 실행하고 이메일 로그인 링크를 받습니다.
4. 설정에서 예시 데이터를 불러옵니다.
5. 설정에서 원장님 이메일을 공유 멤버로 추가합니다.
6. 원장님이 같은 URL에서 그 이메일로 로그인하면 같은 데이터가 보이는지 확인합니다.

## 제한사항

- Supabase 프로젝트 생성과 환경변수 값 입력은 사용자가 직접 해야 합니다. 인증정보가 없으면 앱은 자동으로 로컬 데모 모드로 내려갑니다.
- 실시간 동기화는 Supabase Realtime publication이 켜진 테이블에 대해 작동합니다. 포함된 마이그레이션을 그대로 실행하면 설정됩니다.
- 공유받은 사람은 별도 초대 메일을 받는 방식이 아니라, 설정에 등록된 이메일로 같은 URL에서 로그인하면 자동으로 작업공간에 연결됩니다.
- 정교한 캘린더 드래그 편집기는 MVP 범위에서 가벼운 드래그 배치로 구현했습니다.
