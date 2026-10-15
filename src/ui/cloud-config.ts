// 계정·클라우드 저장의 서버(Supabase, 2026-10-15 사용자 제공). 둘 다 공개되어도 되는 값이다 —
// publishable 키는 브라우저용이고, 남의 저장은 DB의 행 보안(docs/CLOUD_SAVE.md의 SQL)이 막는다. 비우면 계정 기능이 숨는다
export const CLOUD = {
  url: 'https://jbrxhycnipzlfbpxytuj.supabase.co',
  key: 'sb_publishable_8hU7FjvsxC14FitGSYSRaw_Wonc-U-V',
  /** 로그인 단추(Supabase 대시보드에서 켠 공급자만 둔다) */
  providers: [
    { id: 'google', label: '구글로 로그인' },
    { id: 'kakao', label: '카카오로 로그인' },
  ] as const,
};
