/**
 * 寻宝游戏 · 扩展版 2（async / await 重写）
 * ---------------------------------------------------------------
 * 与 treasure-enhanced.js 完全相同的剧情，改用 async/await 表达：
 *   · 把 .then 链改写为顺序的 await，像同步代码一样直读
 *   · 用 try / catch / finally 统一处理异常与收尾
 *   · 守卫事件用 while 循环重试，体力耗尽即失败
 *   · 并行点火把、限时开门仍由 Promise.all / Promise.race 承担
 * ---------------------------------------------------------------
 * 运行：node treasure-async.js
 */

const T0 = Date.now();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 守卫是否出现：默认 50% 随机；设置 GUARD_PLAN="1,0" 可按顺序复现（1 出现 / 0 不出现） */
const GUARD_PLAN = (process.env.GUARD_PLAN || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s !== '');
const GUARD_RATE = process.env.GUARD_RATE ? Number(process.env.GUARD_RATE) : 0.5;
function guardAppears() {
  if (GUARD_PLAN.length) return GUARD_PLAN.shift() === '1';
  return Math.random() < GUARD_RATE;
}

function log(text, tag = '·') {
  const ms = String(Date.now() - T0).padStart(5, ' ');
  console.log(`[${ms}ms] ${tag} ${text}`);
}

class TreasureMap {
  /** 情节 1：老船长的遗书 */
  static async getCaptainLetter() {
    await wait(1000);
    return {
      text: '老船长遗书：藏宝图余下的一半，沉在沉星港以北的月影神庙里。',
      stamina: 3,
    };
  }

  /** 情节 2：破译古代符文 */
  static async decodeRuneScript(clue) {
    await wait(1500);
    if (!clue || !clue.text) throw new Error('没有线索可以解码!');
    return { location: '沉星港 · 月影神庙', runes: ['☾', '✦', '☉', '✧'], stamina: clue.stamina };
  }

  /** 情节 3：迷雾森林 —— 并行点亮双手火把 */
  static async lightTorch(hand, ms) {
    await wait(ms);
    return { hand, lit: true };
  }

  static async lightTorches() {
    const torches = await Promise.all([
      TreasureMap.lightTorch('左手火把', 800),
      TreasureMap.lightTorch('右手火把', 1200),
    ]);
    log(`并行结果：${torches.map((t) => t.hand).join(' + ')} 全部点亮`, '✔');
    return torches;
  }

  static async crossMistForest(torches) {
    await wait(1200);
    if (!torches || torches.length < 2) throw new Error('火把不够，被迷雾困在原地!');
    return '雾散了，庙门上的月影图腾已经看得见。';
  }

  /** 情节 4：神庙守卫（50% 随机失败） */
  static async searchTemple(location) {
    await wait(2000);
    if (guardAppears()) throw new Error('糟糕!遇到了神庙守卫!');
    return `${location}：躲过守卫，神像底座露出星象机关。`;
  }

  /** 情节 5：星象机关 —— 限时 3 秒 */
  static async solveStarPuzzle() {
    const solve = wait(1500).then(() => '星图对齐，石门缓缓打开。');
    const timeout = wait(3000).then(() => {
      throw new Error('超时!石门重新关闭了。');
    });
    return Promise.race([solve, timeout]);
  }

  static async openTreasureBox() {
    await wait(1000);
    return '恭喜!你找到了传说中的宝藏!';
  }

  static async readLastNote() {
    await wait(800);
    return '箱底压着一张更旧的藏宝图 —— 原来真正的宝藏，还在下一座岛上。';
  }
}

// ---------------- 主线：async / await ----------------
async function findTreasure() {
  let tries = 0;
  log('冒险开始，请整理行囊...', '▶');
  try {
    // ① 线索
    const letter = await TreasureMap.getCaptainLetter();
    log(letter.text, '①');
    let stamina = letter.stamina;
    log(`获得道具：火把 ×2、体力 ${stamina}`, '＋');

    // ② 解码
    const info = await TreasureMap.decodeRuneScript(letter);
    log(`解码成功!目标锁定：${info.location}（符文 ${info.runes.join(' ')}）`, '②');

    // ③ 迷雾森林：并行点火把 → 依次过森林
    const torches = await TreasureMap.lightTorches();
    log(await TreasureMap.crossMistForest(torches), '③');

    // ④ 守卫：while 重试，失败一次扣 1 点体力
    let passed = false;
    while (!passed) {
      tries += 1;
      log(`第 ${tries} 次进入神庙...`, '④');
      try {
        log(await TreasureMap.searchTemple('月影神庙'), '✔');
        passed = true;
      } catch (err) {
        stamina -= 1;
        log(`${err.message} 体力 -1（剩 ${stamina}）`, '!');
        if (stamina <= 0) throw new Error('体力耗尽，这次寻宝失败了...');
        await wait(600); // 冷却后再闯
      }
    }

    // ⑤ 星象机关（内部 Promise.race 限时）
    log(await TreasureMap.solveStarPuzzle(), '⑤');

    // ⑥ 开箱 + 反转结局
    log(await TreasureMap.openTreasureBox(), '★');
    log(await TreasureMap.readLastNote(), '⑥');
  } catch (err) {
    console.error('任务失败:', err.message || err);
  } finally {
    log(`寻宝结束，共尝试 ${tries} 次，总耗时 ${Date.now() - T0}ms`, '=');
  }
}

findTreasure();
