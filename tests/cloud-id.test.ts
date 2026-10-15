// 아이디·비밀번호 로그인(2026-10-15): 아이디 규칙, 안에서만 쓰는 이메일, 화면 이름, 오류 문구
import { describe, expect, it } from 'vitest';
import { checkId, checkPassword, displayName, idToEmail, loginError } from '../src/ui/cloud-id';
import { CLOUD } from '../src/ui/cloud-config';

describe('아이디 로그인', () => {
  it('아이디는 영문 소문자·숫자·밑줄 3~20자(대문자·앞뒤 빈칸은 다듬는다)', () => {
    expect(checkId('haun_01')).toBeNull();
    expect(checkId('  Haun_01 ')).toBeNull();
    expect(checkId('ab')).toMatch(/3~20자/);
    expect(checkId('하운')).toMatch(/3~20자/);
    expect(checkId('a'.repeat(21))).toMatch(/3~20자/);
    expect(checkId('a b c')).toMatch(/3~20자/);
    expect(checkId('')).toMatch(/넣는다/);
  });

  it('비밀번호는 6자 이상, 가입 때는 확인이 같아야 한다', () => {
    expect(checkPassword('12345')).toMatch(/6자/);
    expect(checkPassword('123456')).toBeNull();
    expect(checkPassword('123456', '123457')).toMatch(/다르다/);
    expect(checkPassword('123456', '123456')).toBeNull();
  });

  it('아이디를 안에서만 쓰는 이메일로 바꾸고, 화면에는 아이디만 보인다', () => {
    expect(idToEmail(' Haun_01 ')).toBe(`haun_01@${CLOUD.idDomain}`);
    expect(displayName(`haun_01@${CLOUD.idDomain}`)).toBe('haun_01');
    expect(displayName('x@y.z', { username: 'born' })).toBe('born');
    expect(displayName('someone@gmail.com')).toBe('someone@gmail.com');
  });

  it('Supabase 오류를 알아듣기 쉬운 문구로', () => {
    expect(loginError('Invalid login credentials', 'login')).toBe('아이디나 비밀번호가 맞지 않다');
    expect(loginError('User already registered', 'signup')).toMatch(/이미 쓰는 아이디/);
    expect(loginError('Password should be at least 6 characters.', 'signup')).toMatch(/6자/);
    expect(loginError('Failed to fetch', 'login')).toMatch(/인터넷/);
    expect(loginError('something odd', 'signup')).toBe('가입하지 못했다 — something odd');
  });
});
