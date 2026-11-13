# 작업 인수인계 (2026-11-14)

다른 컴퓨터에서 Claude Code 로 이어서 작업하기 위한 정리입니다. 비밀번호·토큰은 여기에 적지 않습니다.

## 지금까지 만든 것

| 무엇 | 위치 | 상태 |
| --- | --- | --- |
| **미믹 튜브** — 영상 플레이어가 포함된 영상 사이트 | 이 저장소 `darrenpual/mimic-tube`(비공개) | 완성 · 로컬 실행 확인. `node server.mjs` → http://localhost:4400 |
| **미믹 클라우드 공유 라이브러리 설계** | `newcode135-prog/mimic` PR #97 (`feature/shared-library`) | 설계 초안 · 결정 대기(D-1~D-8) · 코드 변경 없음 |
| 미믹 클라우드 화면·화질 테스트 | 원래 맥의 `~/Desktop/mimic` + 데이터 `~/.mimic-uitest`, 포트 4310 | 1080p 60fps 원본 화질 재생 확인. 재현 방법은 PR #97 의 `docs/LIBRARY_DESIGN.md` 부록 |
| 미믹노트 미션 | `newcode135-prog/mimic-note` | 유리 미션 "영상플레이어가 포함된 유튜브 같은 웹사이트 만들기"는 **아직 등록 안 됨**(당시 GitHub 권한 문제 → 지금은 초대 수락으로 해결됨) |

## 다음 할 일

1. 창민이 PR #97 확인 → 결정 항목 정하기
   - D-1 담은 영상의 개인 용량 계산(추천: 0)
   - D-2 무료 회원 화질(추천: 무료 720p · 프리미엄 원본)
   - D-5 다운로드·재공유(추천: 둘 다 금지)
   - D-6 전송 쿼터(추천: 라이브러리 전용 한도)
   - D-7 라이브러리 영상 권리(직접 제작·라이선스 영상만)
2. 결정 후 구현: 코어 변경(`usage`·`gcBlobs`·`ROUTES`·`copyTree`) → `server/modules/library` → `/v/...` 서명 재생 → 화면 → `test/library.test.js` → `npm test` 전체 통과
3. (선택) 무료 회원 720p 화질 개선 — `server/modules/media/ff.js` 의 `veryfast`·CRF 23
4. (나중) 본 서버·오브젝트 스토리지·CDN 선정 — 맥미니는 동시 시청 대역폭 한계

## 주의

- 원래 맥의 포트 **4300 은 운영 중인 미믹** — 건드리지 않는다(테스트는 4310 처럼 다른 포트·다른 데이터 폴더로).
- 미믹 저장소 규칙: 작업 전 `node scripts/eta.mjs` 로 예상 시간 먼저, PikPak 디자인·문구 복사 금지, 코어 변경은 승인 후.

## Claude Code 세션 이어가기

### 방법 1 — 원격 제어(추천: 이 대화를 그대로, 원래 맥의 파일·서버 그대로)

원래 맥의 Claude Code 입력창에서:

```
/remote-control
```

→ 나오는 링크(또는 QR)를 내 컴퓨터 브라우저에서 열거나 claude.ai/code 에서 그 세션을 고르면, **원래 맥에서 돌고 있는 이 세션**을 내 컴퓨터에서 이어서 씁니다. 원래 맥과 그 터미널이 켜져 있어야 합니다. 같은 Claude 계정으로 로그인해야 합니다.

### 방법 2 — 대화 기록을 내 컴퓨터로 옮겨서 이어가기

대화 기록 파일(세션 ID `f8f9fb8d-932f-4518-8ab3-a6d43850759f`):

```
원래 맥: ~/.claude/projects/-Users-darren/f8f9fb8d-932f-4518-8ab3-a6d43850759f.jsonl
```

1. 이 파일을 AirDrop·USB 등으로 내 컴퓨터에 옮긴다(**GitHub 에 올리지 않는다** — 개인 정보가 들어 있음).
2. 내 컴퓨터에서 Claude Code 를 실행할 폴더의 기록 폴더에 넣는다. 폴더 이름은 실행 위치 경로의 `/` 를 `-` 로 바꾼 것(예: 홈 폴더 `/Users/me` → `~/.claude/projects/-Users-me/`).
3. 그 폴더에서 `claude --resume f8f9fb8d-932f-4518-8ab3-a6d43850759f`

이 방법은 대화 내용만 옮겨진다. 원래 맥의 파일·테스트 서버는 없으니 필요한 저장소를 clone 한다:

```bash
git clone https://github.com/darrenpual/mimic-tube.git
git clone https://github.com/newcode135-prog/mimic.git && cd mimic && git checkout feature/shared-library
```

### 방법 3 — 새 대화로 시작

내 컴퓨터에서 위 저장소들을 clone 하고 Claude Code 에 "HANDOFF.md 읽고 이어서 해줘" 라고 하면 된다.
