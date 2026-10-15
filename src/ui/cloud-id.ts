// 아이디·비밀번호 로그인(2026-10-15 사용자 결정, GAME_DESIGN '계정·클라우드 저장'): Supabase는 이메일로만 계정을 만드므로
// 아이디를 안에서만 쓰는 이메일(아이디@ID_DOMAIN)로 바꾼다. 화면에는 아이디만 보인다. 메일은 보내지 않는다(Confirm email 끔)
import { CLOUD } from './cloud-config';

export const ID_RULE = '영문 소문자·숫자·밑줄(_) 3~20자';
export const PASSWORD_MIN = 6;

/** 아이디를 다듬는다(앞뒤 빈칸·대문자) */
export const normalizeId = (id: string): string => id.trim().toLowerCase();

/** 아이디가 규칙에 맞는가(맞지 않으면 까닭) */
export function checkId(id: string): string | null {
  const v = normalizeId(id);
  if (!v) return '아이디를 넣는다';
  if (!/^[a-z0-9_]{3,20}$/.test(v)) return `아이디는 ${ID_RULE}`;
  return null;
}

export function checkPassword(pw: string, again?: string): string | null {
  if (pw.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상`;
  if (again !== undefined && pw !== again) return '비밀번호 확인이 다르다';
  return null;
}

export const idToEmail = (id: string): string => `${normalizeId(id)}@${CLOUD.idDomain}`;

/** 계정 이메일 → 화면에 보일 이름(아이디로 만든 계정이면 아이디만) */
export function displayName(email: string | undefined, meta?: { username?: unknown }): string {
  if (typeof meta?.username === 'string' && meta.username) return meta.username;
  if (!email) return '계정';
  const suffix = `@${CLOUD.idDomain}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

/** Supabase 오류 → 화면 문구 */
export function loginError(message: string, mode: 'login' | 'signup'): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return '아이디나 비밀번호가 맞지 않다';
  if (m.includes('already registered') || m.includes('already exists')) return '이미 쓰는 아이디다 — 다른 아이디로';
  if (m.includes('password') && (m.includes('least') || m.includes('weak') || m.includes('short'))) return `비밀번호는 ${PASSWORD_MIN}자 이상(더 길게)`;
  if (m.includes('email not confirmed')) return '가입 확인이 꺼져 있지 않다 — 운영자가 Supabase에서 Confirm email을 끈다';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return '지금은 가입을 받지 않는다';
  if (m.includes('rate limit') || m.includes('too many')) return '잠시 뒤에 다시';
  if (m.includes('failed to fetch') || m.includes('network')) return '서버에 닿지 않는다 — 인터넷 연결을 확인한다';
  return `${mode === 'signup' ? '가입하지' : '로그인하지'} 못했다 — ${message}`;
}
