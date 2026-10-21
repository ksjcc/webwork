/**
 * 寻宝游戏 · 扩展版 1（Promise 链式调用）
 * ---------------------------------------------------------------
 * 在附件原版「图书馆线索 → 解码古文 → 神庙搜索 → 开宝箱」的基础上，
 * 新增 4 段异步寻宝情节：
 *   1. 老船长的遗书（新剧情起点，附赠「体力」道具）
 *   2. 迷雾森林 —— Promise.all 并行点亮左右两支火把
 *   3. 神庙守卫 —— 递归重试 withRetry()，失败后冷却再闯
 *   4. 星象机关 —— Promise.race 实现「限时开门」
 *   5. 反转结局 —— 宝箱夹层里是下一张藏宝图
 * ---------------------------------------------------------------
 * 运行：node treasure-enhanced.js
 *      设置环境变量 GUARD_RATE=1 可让守卫必定出现（方便复现截图）
 */

const T0 = Date.now();

/** 带耗时的日志输出 */
function log(text, tag = '·') {
  const ms = String(Date.now() - T0).padStart(5, ' ');
  console.log(`[${ms}ms] ${tag} ${text}`);
}

/** Promise 版 sleep */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/** 递归重试：fn 返回 Promise，失败后冷却 delay 毫秒再试，最多 times 次 */
function withRetry(fn, times = 3, delay = 600) {
  return fn().catch((err) => {
    if (times <= 1) throw err;
    log(`闯关失败：${err.message}，${delay}ms 后再试一次...`, '!');
    return wait(delay).then(() => withRetry(fn, times - 1, delay));
  });
}

// 模拟宝藏地图 API
class TreasureMap {
  // ---- 情节 1：老船长的遗书 ----
  static getCaptainLetter() {
    return wait(1000).then(() => ({
      text: '老船长遗书：藏宝图余下的一半，沉在沉星港以北的月影神庙里。',
      stamina: 3, // 体力：失败一次消耗 1 点
      hasTorch: true,
    }));
  }

  // ---- 情节 2：破译古代符文 ----
  static decodeRuneScript(clue) {
    return wait(1500).then(() => {
      if (!clue || !clue.text) {
        throw new Error('没有线索可以解码!');
      }
      return {
        location: '沉星港 · 月影神庙',
        runes: ['☾', '✦', '☉', '✧'],
        stamina: clue.stamina,
      };
    });
  }

  // ---- 情节 3：迷雾森林，两支火把必须同时亮着 ----
  static lightTorch(hand, ms) {
    return wait(ms).then(() => ({ hand, lit: true }));
  }

  static lightTorches() {
    // Promise.all：并行启动，总耗时 = 最慢的那支（1.2s），而不是 0.8 + 1.2 = 2.0s
    return Promise.all([
      TreasureMap.lightTorch('左手火把', 800),
      TreasureMap.lightTorch('右手火把', 1200),
    ]).then((torches) => {
      log(`并行结果：${torches.map((t) => t.hand).join(' + ')} 全部点亮`, '✔');
      return torches;
    });
  }

  static crossMistForest(torches) {
    return wait(1200).then(() => {
      if (!torches || torches.length < 2) {
        throw new Error('火把不够，被迷雾困在原地!');
      }
      return '雾散了，庙门上的月影图腾已经看得见。';
    });
  }

  // ---- 情节 4：神庙守卫（保留原版 50% 随机失败）----
  static searchTemple(location) {
    return wait(2000).then(() => {
      if (guardAppears()) {
        throw new Error('糟糕!遇到了神庙守卫!');
      }
      return `${location}：躲过守卫，神像底座露出星象机关。`;
    });
  }

  // ---- 情节 5：星象机关，3 秒内摆对星图 ----
  static solveStarPuzzle() {
    const solve = wait(1500).then(() => '星图对齐，石门缓缓打开。');
    const timeout = wait(3000).then(() => {
      throw new Error('超时!石门重新关闭了。');
    });
    // Promise.race：谁先结束用谁，天然实现"限时操作"
    return Promise.race([solve, timeout]);
  }

  static openTreasureBox() {
    return wait(1000).then(() => '恭喜!你找到了传说中的宝藏!');
  }

  // ---- 反转结局 ----
  static readLastNote() {
    return wait(800).then(
      () => '箱底压着一张更旧的藏宝图 —— 原来真正的宝藏，还在下一座岛上。'
    );
  }
}

// ---------------- 主线：纯 Promise 链 ----------------
function findTreasureWithPromises() {
  const bag = { stamina: 0, guardTries: 0 };

  return TreasureMap.getCaptainLetter()
    .then((letter) => {
      log(letter.text, '①');
      bag.stamina = letter.stamina;
      log(`获得道具：火把 ×2、体力 ${bag.stamina}`, '＋');
      return TreasureMap.decodeRuneScript(letter);
    })
    .then((info) => {
      log(`解码成功!目标锁定：${info.location}（符文 ${info.runes.join(' ')}）`, '②');
      return TreasureMap.lightTorches();
    })
    .then((torches) => TreasureMap.crossMistForest(torches))
    .then((msg) => {
      log(msg, '③');
      return withRetry(() => {
        bag.guardTries += 1;
        log(`第 ${bag.guardTries} 次进入神庙...`, '④');
        return TreasureMap.searchTemple('月影神庙');
      }, bag.stamina);
    })
    .then((msg) => {
      log(msg, '✔');
      return TreasureMap.solveStarPuzzle();
    })
    .then((msg) => {
      log(msg, '⑤');
      return TreasureMap.openTreasureBox();
    })
    .then((treasure) => {
      log(treasure, '★');
      return TreasureMap.readLastNote();
    })
    .then((note) => {
      log(note, '⑥');
      log(`寻宝结束，共尝试 ${bag.guardTries} 次，用时 ${Date.now() - T0}ms`, '=');
    })
    .catch((error) => {
      console.error('任务失败:', error.message || error);
    });
}

findTreasureWithPromises();
