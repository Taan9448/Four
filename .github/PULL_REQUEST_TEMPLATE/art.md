<!-- Codex 아트 PR. 브랜치: art/<이슈번호>-<id>. assets/source/, assets/sprites/ 외의 파일을 바꾸면 CI가 실패한다. -->
## 에셋
- id: `<id>`
- Closes #<이슈번호>

## 결과
- 대체 단계(fallbackLevel): 1 / 2 / 3
- 재생성 횟수: 0
- `npm run assets:validate -- <id>`: 통과 / 실패(이유)
- 콘택트 시트: `assets/sprites/<id>/_contact.png`
- 미리보기: `assets/sprites/<id>/_preview.gif`

## 눈으로 확인한 것
- [ ] 얼굴·머리·의상·색·무기·크기가 모든 프레임에서 같다
- [ ] 기준 시트와 같은 인물이다
- [ ] 동작이 frame_notes 순서대로다
- [ ] 바라보는 방향이 명세의 facing과 같다
- [ ] 잘린 팔다리·무기가 없다

## 발견한 문제
<!-- 코드·스크립트·명세의 문제는 고치지 말고 여기에 적는다 -->
없음
