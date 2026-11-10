// 「결」 계정 목업·수련 Lv.(2026-11-10): 로그인 규칙은 「천외귀환」과 같고, 수련은 이 기기 기록으로 셈한다
import { beforeEach, describe, expect, it } from 'vitest';
import { accountState, chooseGuest, mockSignIn, signOut, trainingLevel } from '../src/account';

describe('계정 목업', () => {
  beforeEach(() => signOut());

  it('처음에는 로그인도 게스트도 고르지 않았다', () => {
    expect(accountState().kind).toBe('none');
  });

  it('아이디·비밀번호 규칙은 「천외귀환」과 같다', () => {
    expect(mockSignIn('ab', 'secret1', 'login').ok).toBe(false);
    expect(mockSignIn('haun', '123', 'login').ok).toBe(false);
    expect(mockSignIn('haun', 'secret1', 'signup', 'secret2').ok).toBe(false);
    expect(mockSignIn('Haun_01', 'secret1', 'signup', 'secret1').ok).toBe(true);
    expect(accountState()).toEqual({ kind: 'signed-in', name: 'haun_01' });
  });

  it('게스트와 로그아웃', () => {
    chooseGuest();
    expect(accountState().kind).toBe('guest');
    signOut();
    expect(accountState().kind).toBe('none');
  });
});

describe('수련 Lv.', () => {
  it('경험치가 쌓이면 오르고, 다음 레벨까지 필요한 양이 늘어난다', () => {
    const a = trainingLevel(0);
    expect(a).toMatchObject({ level: 1, into: 0 });
    const b = trainingLevel(a.need);
    expect(b.level).toBe(2);
    expect(b.into).toBe(0);
    expect(b.need).toBeGreaterThan(a.need);
    expect(trainingLevel(a.need + b.need - 1)).toMatchObject({ level: 2, into: b.need - 1 });
  });
});
