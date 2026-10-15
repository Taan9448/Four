// 계정·클라우드 저장의 서버(Supabase, 2026-10-15 사용자 제공). 둘 다 공개되어도 되는 값이다 —
// publishable 키는 브라우저용이고, 남의 저장은 DB의 행 보안(docs/CLOUD_SAVE.md의 SQL)이 막는다. 비우면 계정 기능이 숨는다
export const CLOUD = {
  url: 'https://jbrxhycnipzlfbpxytuj.supabase.co',
  key: 'sb_publishable_8hU7FjvsxC14FitGSYSRaw_Wonc-U-V',
  /** 아이디 로그인: 아이디를 안에서만 쓰는 이메일(아이디@idDomain)로 바꾼다. 메일은 보내지 않는다(Supabase Confirm email 끔) */
  idDomain: 'player.cheonoe.app',
  /**
   * 로그인 단추(Supabase 대시보드에서 켠 공급자만 둔다 — docs/CLOUD_SAVE.md 3절). 2026-10-15: 이메일 로그인 링크만 먼저.
   * 켤 때: { id: 'google', label: '구글로 로그인' }, { id: 'kakao', label: '카카오로 로그인' }
   */
  providers: [] as { id: 'google' | 'kakao'; label: string }[],
};
