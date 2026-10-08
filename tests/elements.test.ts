import { describe, expect, it } from "vitest";
import { endTurn, playCard } from "../src/engine/battle";
import { dealDamage } from "../src/engine/effects";
import { createRng } from "../src/engine/rng";
import { resolveCard } from "../src/engine/state";
import { battle, data, give } from "./helpers";

const bal = data.balance;

describe("속성 상성(화염·냉기)", () => {
  it("약점 속성은 더, 내성 속성은 덜 들어가고, 내성이면 속성 상태가 붙지 않는다", () => {
    const s = battle({ enemies: ["test_ember", "test_ember"] });
    const haun = s.party[0];
    const [a, b] = s.enemies;
    dealDamage(s, haun, a, 10, { source: haun }, "ice");
    dealDamage(s, haun, b, 10, { source: haun }, "fire");
    expect(a.maxHp - a.hp).toBe(Math.floor(10 * bal.elements.weakMultiplier));
    expect(b.maxHp - b.hp).toBe(Math.floor(10 * bal.elements.resistMultiplier));
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
    endTurn(s); // 불티 4 + 화상 1 → 다음 차례 시작에 화상 피해
    expect(before - haun.hp).toBe(4 + 2);
  });

  it(`냉기가 ${bal.elements.freezeAt} 쌓이면 얼어붙고(빙결), 보스는 ${bal.elements.bossFreezeAt}에서 얼어붙는다`, () => {
    const s = battle({ enemies: ["test_ember", "test_ember_boss"] });
    const haun = s.party[0];
    const [mob, boss] = s.enemies;
    for (let i = 0; i < bal.elements.freezeAt; i++)
      dealDamage(s, haun, mob, 1, { source: haun }, "ice");
    expect(mob.statuses[bal.elements.freezeStatus]).toBe(1);
    expect(mob.statuses.chill).toBeUndefined();
    for (let i = 0; i < bal.elements.freezeAt; i++)
      dealDamage(s, haun, boss, 1, { source: haun }, "ice");
    expect(boss.statuses[bal.elements.freezeStatus]).toBeUndefined();
    for (let i = bal.elements.freezeAt; i < bal.elements.bossFreezeAt; i++)
      dealDamage(s, haun, boss, 1, { source: haun }, "ice");
    expect(boss.statuses[bal.elements.freezeStatus]).toBe(1);
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
    const t = resolveCard(data, "elia_frost_needle").def;
    expect(t.effects[0].element).toBe("ice");
  });
});

describe("치명타", () => {
  it("아군 카드의 피해는 확률로 치명타가 되어 배율만큼 들어가고, 같은 시드면 같은 결과다", () => {
    const run = (seed: string) => {
      const s = battle({ enemies: ["test_wolf"], rng: createRng(seed) });
      s.noCrit = false;
      s.enemies[0].hp = s.enemies[0].maxHp = 9999;
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
    s.enemies[0].hp = s.enemies[0].maxHp = 9999;
    for (let i = 0; i < 40; i++) {
      s.neigong = 9;
      playCard(s, give(s, "haun_chop"), s.enemies[0].uid);
    }
    expect(s.events.some((ev) => ev.type === "damage" && ev.crit)).toBe(false);
  });
});
