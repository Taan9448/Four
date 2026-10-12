import { describe, expect, it } from "vitest";
import { endTurn, playCard } from "../src/engine/battle";
import { addStatus, dealDamage } from "../src/engine/effects";
import { createRng } from "../src/engine/rng";
import { resolveCard } from "../src/engine/state";
import { battle, data, give } from "./helpers";

const bal = data.balance;

describe("속성 상성(화염·냉기·번개)", () => {
  it("약점 속성은 더, 내성 속성은 덜 들어가고, 내성이면 속성 상태가 붙지 않는다", () => {
    const s = battle({ enemies: ["test_ember", "test_ember"] });
    const haun = s.party[0];
    const [a, b] = s.enemies;
    dealDamage(s, haun, a, 100, { source: haun }, "ice");
    dealDamage(s, haun, b, 100, { source: haun }, "fire");
    expect(a.maxHp - a.hp).toBe(Math.floor(100 * bal.elements.weakMultiplier));
    expect(b.maxHp - b.hp).toBe(Math.floor(100 * bal.elements.resistMultiplier));
    expect(a.statuses.chill).toBe(1);
    expect(b.statuses.burn).toBeUndefined();
  });

  it("화염 공격은 화상을 붙이고, 화상은 차례 시작마다 피해를 준다", () => {
    const s = battle({ enemies: ["test_ember"] });
    const haun = s.party[0];
    s.enemies[0].intent = {
      moveId: "spark",
      name: "불티",
      kind: "attack",
      targetUid: haun.uid,
    };
    const before = haun.hp;
    endTurn(s); // 불티 40 + 화상 1 → 다음 차례 시작에 화상 피해 20
    expect(before - haun.hp).toBe(40 + 20);
  });

  it(`냉기가 ${bal.elements.ice.threshold!.at} 쌓이면 얼어붙고(빙결), 보스는 ${bal.elements.ice.threshold!.bossAt}에서 얼어붙는다`, () => {
    const th = bal.elements.ice.threshold!;
    const s = battle({ enemies: ["test_ember", "test_ember_boss"] });
    const haun = s.party[0];
    const [mob, boss] = s.enemies;
    for (let i = 0; i < th.at; i++)
      dealDamage(s, haun, mob, 1, { source: haun }, "ice");
    expect(mob.statuses[th.into]).toBe(1);
    expect(mob.statuses.chill).toBeUndefined();
    for (let i = 0; i < th.at; i++)
      dealDamage(s, haun, boss, 1, { source: haun }, "ice");
    expect(boss.statuses[th.into]).toBeUndefined();
    for (let i = th.at; i < th.bossAt; i++)
      dealDamage(s, haun, boss, 1, { source: haun }, "ice");
    expect(boss.statuses[th.into]).toBe(1);
  });

  it("상극: 화염은 냉기를 녹이고, 냉기는 화상을 끈다", () => {
    const s = battle({ enemies: ["test_ember_boss"] });
    const haun = s.party[0];
    const e = s.enemies[0];
    dealDamage(s, haun, e, 1, { source: haun }, "ice");
    expect(e.statuses.chill).toBe(1);
    dealDamage(s, haun, e, 1, { source: haun }, "fire");
    expect(e.statuses.chill).toBeUndefined();
    expect(e.statuses.burn).toBe(1);
    dealDamage(s, haun, e, 1, { source: haun }, "ice");
    expect(e.statuses.burn).toBeUndefined();
  });

  it("카드 문구에 속성과 실리는 상태가 나온다", () => {
    const t = resolveCard(data, "elia_cold_breath").def;
    expect(t.effects[0].element).toBe("ice");
  });
});

describe("번개(감전·마비·전도)", () => {
  const th = bal.elements.lightning.threshold!;
  const mul = bal.elements.lightning.conduct!.multiplier;

  it(`감전 ${th.at}이면 마비 1로 바뀌고 감전은 0, 보스는 ${th.bossAt}`, () => {
    const s = battle({ enemies: ["test_armor", "test_ember_boss"] });
    const haun = s.party[0];
    const [mob, boss] = s.enemies;
    for (let i = 0; i < th.at; i++) dealDamage(s, haun, mob, 1, { source: haun }, "lightning");
    expect(mob.statuses.paralyze).toBe(1);
    expect(mob.statuses.shock).toBeUndefined();
    for (let i = 0; i < th.at; i++) dealDamage(s, haun, boss, 1, { source: haun }, "lightning");
    expect(boss.statuses.paralyze).toBeUndefined();
    for (let i = th.at; i < th.bossAt; i++) dealDamage(s, haun, boss, 1, { source: haun }, "lightning");
    expect(boss.statuses.paralyze).toBe(1);
  });

  it("감전은 적 차례 끝에 1 가라앉고, 냉기는 그대로다", () => {
    const s = battle({ enemies: ["test_armor"] });
    const e = s.enemies[0];
    addStatus(s, e, "shock", 2);
    addStatus(s, e, "chill", 2);
    endTurn(s);
    expect(e.statuses.shock).toBe(1);
    expect(e.statuses.chill).toBe(2);
  });

  it(`전도: 냉기가 붙은 적에게 번개는 ×${mul}이고 냉기는 남는다`, () => {
    const s = battle({ enemies: ["test_wolf", "test_wolf"] });
    const haun = s.party[0];
    const [a, b] = s.enemies;
    a.hp = a.maxHp = b.hp = b.maxHp = 9999;
    addStatus(s, a, "chill", 1);
    dealDamage(s, haun, a, 100, { source: haun }, "lightning");
    dealDamage(s, haun, b, 100, { source: haun }, "lightning");
    expect(a.maxHp - a.hp).toBe(Math.floor(100 * mul));
    expect(b.maxHp - b.hp).toBe(100);
    expect(a.statuses.chill).toBe(1);
    expect(s.events.some((ev) => ev.type === "damage" && ev.targetUid === a.uid && ev.conducted)).toBe(true);
    expect(s.events.some((ev) => ev.type === "damage" && ev.targetUid === b.uid && ev.conducted)).toBe(false);
  });

  it("번개 내성은 감전을 막고 ×0.5(전도와 곱한다), 약점은 ×1.5", () => {
    const s = battle({ enemies: ["test_rock", "test_armor"] });
    const haun = s.party[0];
    const [rock, armor] = s.enemies;
    addStatus(s, rock, "chill", 1);
    dealDamage(s, haun, rock, 100, { source: haun }, "lightning");
    dealDamage(s, haun, armor, 100, { source: haun }, "lightning");
    expect(rock.maxHp - rock.hp).toBe(Math.floor(100 * bal.elements.resistMultiplier * mul));
    expect(rock.statuses.shock).toBeUndefined();
    expect(armor.maxHp - armor.hp).toBe(Math.floor(100 * bal.elements.weakMultiplier));
    expect(armor.statuses.shock).toBe(1);
  });

  it("번개는 화상·냉기를 지우지 않고, 화염은 여전히 냉기를 녹인다", () => {
    const s = battle({ enemies: ["test_wolf"] });
    const haun = s.party[0];
    const e = s.enemies[0];
    e.hp = e.maxHp = 9999;
    addStatus(s, e, "burn", 1);
    addStatus(s, e, "chill", 1);
    dealDamage(s, haun, e, 1, { source: haun }, "lightning");
    expect(e.statuses.burn).toBe(1);
    expect(e.statuses.chill).toBe(1);
    expect(e.statuses.shock).toBe(1);
    dealDamage(s, haun, e, 1, { source: haun }, "fire");
    expect(e.statuses.chill).toBeUndefined();
    expect(e.statuses.shock).toBe(1);
  });

  it("교차 잠금 금지: 빙결 중엔 감전이, 마비 중엔 냉기가 쌓이지 않고, 풀린 뒤엔 쌓인다", () => {
    const s = battle({ enemies: ["test_wolf", "test_wolf"] });
    const [a, b] = s.enemies;
    addStatus(s, a, "bind", 1);
    addStatus(s, a, "shock", 2);
    expect(a.statuses.shock).toBeUndefined();
    addStatus(s, b, "paralyze", 1);
    addStatus(s, b, "chill", 2);
    expect(b.statuses.chill).toBeUndefined();
    endTurn(s); // 빙결·마비가 적 차례 끝에 풀린다
    expect(a.statuses.bind).toBeUndefined();
    addStatus(s, a, "shock", 1);
    expect(a.statuses.shock).toBe(1);
    addStatus(s, b, "chill", 1);
    expect(b.statuses.chill).toBe(1);
  });

  it("마비된 적은 그 차례에 행동하지 않는다", () => {
    const s = battle({ enemies: ["test_spire"] });
    const haun = s.party[0];
    addStatus(s, s.enemies[0], "paralyze", 1);
    const before = haun.hp;
    endTurn(s);
    expect(haun.hp).toBe(before);
  });

  it(`번개 공격을 ${th.at}번 맞은 동료는 마비된다`, () => {
    const s = battle({ enemies: ["test_spire"] });
    const haun = s.party[0];
    for (let i = 0; i < th.at; i++) dealDamage(s, s.enemies[0], haun, 1, { source: s.enemies[0] }, "lightning");
    expect(haun.statuses.paralyze).toBe(1);
    expect(haun.statuses.shock).toBeUndefined();
  });

});

describe("치명타", () => {
  it("아군 카드의 피해는 확률로 치명타가 되어 배율만큼 들어가고, 같은 시드면 같은 결과다", () => {
    const run = (seed: string) => {
      const s = battle({ enemies: ["test_wolf"], rng: createRng(seed) });
      s.noCrit = false;
      s.enemies[0].hp = s.enemies[0].maxHp = 99999;
      const hits: boolean[] = [];
      for (let i = 0; i < 60; i++) {
        s.neigong = 9;
        playCard(s, give(s, "haun_chop"), s.enemies[0].uid);
        for (const ev of s.events.splice(0))
          if (ev.type === "damage") hits.push(!!ev.crit);
      }
      return hits;
    };
    const a = run("CRIT");
    expect(a.some(Boolean)).toBe(true);
    expect(a.every(Boolean)).toBe(false);
    expect(run("CRIT")).toEqual(a);
  });

  it("미리보기·시험 상태(noCrit)에서는 굴리지 않는다", () => {
    const s = battle({ enemies: ["test_wolf"] });
    s.enemies[0].hp = s.enemies[0].maxHp = 99999;
    for (let i = 0; i < 40; i++) {
      s.neigong = 9;
      playCard(s, give(s, "haun_chop"), s.enemies[0].uid);
    }
    expect(s.events.some((ev) => ev.type === "damage" && ev.crit)).toBe(false);
  });
});
