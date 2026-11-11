// 「결」 계정·수련 Lv.(2026-11-11 실제 연결): 로그인 규칙은 「천외귀환」과 같고(서버에 닿기 전에 막는다), 수련은 기록으로 셈한다
import { beforeEach, describe, expect, it } from 'vitest';
import { accountState, chooseGuest, signOut, trainingLevel, xpOf } from '../src/account';
import { signInWithId } from '../src/cloud';
import { emptySave } from '../src/save';

describe('계정', () => {
  beforeEach(() => signOut());

  it('처음에는 로그인도 게스트도 고르지 않았다', () => {
    expect(accountState().kind).toBe('none');
  });

  it('아이디·비밀번호 규칙은 「천외귀환」과 같다(서버에 묻기 전에 막는다)', async () => {
    expect(await signInWithId('ab', 'secret1', 'login')).toMatchObject({ ok: false });
    expect(await signInWithId('haun', '123', 'login')).toMatchObject({ ok: false });
    expect(await signInWithId('haun', 'secret1', 'signup', 'secret2')).toEqual({ ok: false, message: '비밀번호 확인이 다르다' });
    expect(accountState().kind).toBe('none');
  });

  it('게스트와 로그아웃', async () => {
    chooseGuest();
    expect(accountState().kind).toBe('guest');
    await signOut();
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

  it('경험치는 기록(이김·PERFECT·마친 장)에서 나온다 — 기록과 함께 계정에 올라간다', () => {
    const s = emptySave();
    expect(xpOf(s)).toBe(0);
    s.stats.wins = 2;
    s.stats.perfect = 5;
    s.story.cleared = ['prologue'];
    expect(xpOf(s)).toBe(2 * 20 + 5 + 60);
  });
});
