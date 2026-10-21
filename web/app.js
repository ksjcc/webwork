/* =========================================================
 * 沉星港寻宝记 —— 动画主逻辑
 * 全程用 async / await 组织：await 等待线索、await Promise.all
 * 并行点火把、while 循环重试守卫、await Promise.race 限时机关
 * ========================================================= */

const $ = (id) => document.getElementById(id);

const map = $('map');
const route = $('route');
const nodesLayer = $('nodes');
const hero = $('hero');
const chest = $('chestGroup');
const fogLayer = $('fogLayer');
const sparksLayer = $('sparks');
const mapCard = $('mapCard');
const logBox = $('log');
const stepsBox = $('steps');
const startBtn = $('startBtn');
const caption = $('caption');

const ROUTE_LEN = route.getTotalLength();
route.style.strokeDasharray = ROUTE_LEN;
route.style.strokeDashoffset = ROUTE_LEN;

/* ---------- 关卡配置 ---------- */
const STAGES = [
  { id: 'letter', name: '老船长的遗书', icon: '✉️', at: 0.035, meta: '线索 · 1.0s' },
  { id: 'forest', name: '迷雾森林', icon: '🌲', at: 0.300, meta: '并行点亮双火把 · 0.8s / 1.2s' },
  { id: 'temple', name: '月影神庙', icon: '🏛️', at: 0.545, meta: '守卫事件 50% 失败 · 2.0s' },
  { id: 'puzzle', name: '星象机关', icon: '✨', at: 0.775, meta: '限时 3.0s，race 抢跑' },
  { id: 'chest', name: '宝藏密室', icon: '🎁', at: 0.985, meta: '开宝箱 · 1.0s', noNode: true },
];

/* ---------- 状态 ---------- */
const state = { speed: 1, running: false, runId: 0, stamina: 3, tries: 0, startAt: 0, clockTimer: null };
const URLP = new URLSearchParams(location.search);
if (URLP.get('speed')) state.speed = Number(URLP.get('speed')) || 1;

// 守卫出现序列：?plan=1,0 可复现（1 出现 / 0 不出现），否则 50% 随机
const GUARD_PLAN = (URLP.get('plan') || '').split(',').map((s) => s.trim()).filter((s) => s !== '');
function guardAppears() {
  if (GUARD_PLAN.length) return GUARD_PLAN.shift() === '1';
  return Math.random() < 0.5;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms / state.speed));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* ---------- 初始化界面 ---------- */
function buildNodes() {
  nodesLayer.innerHTML = '';
  STAGES.forEach((s) => {
    const p = route.getPointAtLength(ROUTE_LEN * s.at);
    s.point = p;
    if (s.noNode) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'node');
    g.dataset.id = s.id;
    g.setAttribute('transform', `translate(${p.x} ${p.y})`);
    const labelY = p.y > 400 ? 42 : -30;
    g.innerHTML = `
      <circle class="node-pulse" r="26" />
      <circle class="node-ring" r="21" />
      <text class="node-icon" y="7">${s.icon}</text>
      <text class="node-label" y="${labelY}">${s.name}</text>`;
    nodesLayer.appendChild(g);
  });
  // 宝箱标签
  const cp = route.getPointAtLength(ROUTE_LEN * 0.985);
  const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  lbl.setAttribute('class', 'node-label');
  lbl.setAttribute('x', Math.min(cp.x, 948));
  lbl.setAttribute('y', cp.y + 56);
  lbl.textContent = '宝藏密室';
  nodesLayer.appendChild(lbl);
}

function buildSteps() {
  stepsBox.innerHTML = '';
  STAGES.forEach((s) => {
    const d = document.createElement('div');
    d.className = 'step';
    d.id = 'step-' + s.id;
    d.innerHTML = `
      <span class="step-icon">${s.icon}</span>
      <div class="step-body">
        <div class="step-name">${s.name}</div>
        <div class="step-meta">${s.meta}</div>
      </div>
      <span class="step-flag">等待</span>`;
    stepsBox.appendChild(d);
  });
}

function reset() {
  state.runId += 1;
  state.running = false;
  state.stamina = 3;
  state.tries = 0;
  clearInterval(state.clockTimer);
  $('hudStamina').textContent = '3';
  $('hudTries').textContent = '0';
  $('hudClock').textContent = '0.0s';
  logBox.innerHTML = '';
  nodesLayer.querySelectorAll('.node').forEach((n) => (n.className.baseVal = 'node'));
  chest.setAttribute('class', 'chest');
  fogLayer.classList.remove('on');
  sparksLayer.innerHTML = '';
  document.querySelectorAll('.torch').forEach((t) => t.classList.remove('lit'));
  ['badgeFog', 'badgeTorch', 'badgeStar'].forEach((id) => $(id).classList.remove('on', 'ok'));
  $('badgeFog').textContent = '🌫️ 迷雾未散';
  $('badgeTorch').textContent = '🔥 火把未点燃';
  $('badgeStar').textContent = '✨ 星图未对齐';
  setProgress(0);
  buildSteps();
  hero.setAttribute('class', 'hero');
  hero.setAttribute('transform', `translate(${route.getPointAtLength(0).x} ${route.getPointAtLength(0).y})`);
  route.style.strokeDashoffset = ROUTE_LEN;
  startBtn.disabled = false;
  startBtn.querySelector('span').textContent = '开始寻宝';
  setCaption('点击「开始寻宝」，跟老船长的遗书一起出发');
}

/* ---------- 小工具 ---------- */
function log(msg, kind = '') {
  const line = document.createElement('div');
  line.className = 'log-line ' + kind;
  const sec = ((performance.now() - state.startAt) / 1000).toFixed(1);
  line.innerHTML = `<span class="t">[${sec.padStart(5, ' ')}s]</span><span class="m"></span>`;
  line.querySelector('.m').textContent = msg;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function setCaption(text) {
  caption.textContent = text;
  caption.classList.remove('flash');
  void caption.offsetWidth;
  caption.classList.add('flash');
}

function setProgress(p) {
  const pct = Math.round(Math.min(1, Math.max(0, p)) * 100);
  $('progressFill').style.width = pct + '%';
  $('progressText').textContent = pct + '%';
}

function markStage(id, cls, flag) {
  const el = $('step-' + id);
  if (el) {
    el.classList.remove('active', 'done', 'fail');
    if (cls) el.classList.add(cls);
    if (flag) el.querySelector('.step-flag').textContent = flag;
  }
  const node = nodesLayer.querySelector(`.node[data-id="${id}"]`);
  if (node) {
    node.classList.remove('active', 'done', 'fail');
    if (cls) node.classList.add(cls);
  }
}

/* ---------- 主角沿航线移动 ---------- */
function moveHero(toFrac, duration) {
  return new Promise((resolve) => {
    const from = Number(hero.dataset.frac || 0);
    const t0 = performance.now();
    const dur = Math.max(1, duration / state.speed);
    function frame(now) {
      const t = Math.min(1, (now - t0) / dur);
      const f = lerp(from, toFrac, easeInOut(t));
      const p = route.getPointAtLength(ROUTE_LEN * f);
      hero.setAttribute('transform', `translate(${p.x} ${p.y})`);
      hero.dataset.frac = f;
      route.style.strokeDashoffset = ROUTE_LEN * (1 - f);
      setProgress(f);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

/* ---------- 模拟后端异步 API ---------- */
class TreasureMap {
  static async getCaptainLetter() {
    await wait(1000);
    return {
      text: '老船长遗书：藏宝图余下的一半，沉在沉星港以北的月影神庙里。',
      stamina: 3,
    };
  }

  static async decodeRuneScript(clue) {
    await wait(1500);
    if (!clue || !clue.text) throw new Error('没有线索可以解码!');
    return { location: '沉星港 · 月影神庙', runes: ['☾', '✦', '☉', '✧'] };
  }

  static async lightTorch(hand, ms) {
    await wait(ms);
    const el = document.querySelector(`.torch[data-hand="${hand}"]`);
    if (el) el.classList.add('lit');
    return { hand, lit: true };
  }

  static async lightTorches() {
    // Promise.all：两支火把同时点火，总耗时 = 最慢的 1.2s
    return Promise.all([
      TreasureMap.lightTorch('左手火把', 800),
      TreasureMap.lightTorch('右手火把', 1200),
    ]);
  }

  static async crossMistForest(torches) {
    await wait(1100);
    if (!torches || torches.length < 2) throw new Error('火把不够，被迷雾困在原地!');
    fogLayer.classList.remove('on');
    return '雾散了，庙门上的月影图腾已经看得见。';
  }

  static async searchTemple() {
    await wait(2000);
    if (guardAppears()) throw new Error('糟糕!遇到了神庙守卫!');
    return '躲过守卫，神像底座露出星象机关。';
  }

  static async solveStarPuzzle() {
    const solve = wait(1500).then(() => '星图对齐，石门缓缓打开。');
    const timeout = wait(3000).then(() => {
      throw new Error('超时!石门重新关闭了。');
    });
    return Promise.race([solve, timeout]); // 限时机关
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

/* ---------- 粒子特效 ---------- */
function burst(count = 30) {
  const cardRect = mapCard.getBoundingClientRect();
  const cr = chest.getBoundingClientRect();
  const cx = cr.left + cr.width / 2 - cardRect.left;
  const cy = cr.top + cr.height / 3 - cardRect.top;
  for (let i = 0; i < count; i += 1) {
    const s = document.createElement('i');
    s.className = 'spark';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 60 + Math.random() * 130;
    s.style.left = cx + 'px';
    s.style.top = cy + 'px';
    s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    s.style.setProperty('--dy', (Math.sin(angle) * dist - 40) + 'px');
    s.style.animationDelay = Math.random() * 0.15 + 's';
    mapCard.appendChild(s);
    setTimeout(() => s.remove(), 1600);
  }
}

/* =========================================================
 * 主线：async / await 重写寻宝流程
 * ========================================================= */
async function findTreasure() {
  const myId = ++state.runId;
  const alive = () => myId === state.runId;

  state.running = true;
  state.startAt = performance.now();
  state.clockTimer = setInterval(() => {
    $('hudClock').textContent = ((performance.now() - state.startAt) / 1000).toFixed(1) + 's';
  }, 100);
  startBtn.disabled = true;
  startBtn.querySelector('span').textContent = '寻宝中...';

  hero.setAttribute('class', 'hero sailing');
  log('冒险开始，整理行囊...', 'gold');
  setCaption('沉星港的旧酒馆里，一封泛黄的老船长遗书正在等你...');

  try {
    /* ① 老船长的遗书 */
    markStage('letter', 'active', '进行中');
    await moveHero(0.035, 2200);
    if (!alive()) return;
    const letter = await TreasureMap.getCaptainLetter();
    if (!alive()) return;
    state.stamina = letter.stamina;
    $('hudStamina').textContent = state.stamina;
    log(letter.text, 'gold');
    log('获得道具：火把 ×2、体力 3', 'ok');
    markStage('letter', 'done', '完成');
    setCaption('破译遗书背面的古代符文...');

    /* ② 破译符文 */
    const info = await TreasureMap.decodeRuneScript(letter);
    if (!alive()) return;
    log(`解码成功!目标锁定：${info.location}`, 'ok');
    log(`古代符文：${info.runes.join('  ')}`, '');

    /* ③ 迷雾森林：并行点亮双火把 */
    markStage('forest', 'active', '进行中');
    setCaption('迷雾森林挡住了去路，需要同时点亮两支火把。');
    await moveHero(0.30, 1600);
    if (!alive()) return;
    fogLayer.classList.add('on');
    $('badgeFog').classList.add('on');
    const t = performance.now();
    const torches = await TreasureMap.lightTorches();
    if (!alive()) return;
    const cost = Math.round(performance.now() - t);
    log(`Promise.all：两支火把同时点亮（≈${(cost / state.speed / 1000).toFixed(2)}s，远快于串行 2.00s）`, 'ok');
    $('badgeTorch').classList.add('ok');
    $('badgeTorch').textContent = '🔥 火把已点燃';
    log(await TreasureMap.crossMistForest(torches), 'ok');
    $('badgeFog').classList.add('ok');
    $('badgeFog').textContent = '🌤️ 迷雾已散';
    markStage('forest', 'done', '完成');

    /* ④ 月影神庙：守卫重试 */
    markStage('temple', 'active', '进行中');
    setCaption('穿过庙门，守卫的脚步声越来越近...');
    await moveHero(0.545, 1800);
    if (!alive()) return;
    let passed = false;
    while (!passed) {
      if (!alive()) return;
      state.tries += 1;
      $('hudTries').textContent = state.tries;
      log(`第 ${state.tries} 次进入神庙...`, '');
      try {
        log(await TreasureMap.searchTemple(), 'ok');
        passed = true;
        markStage('temple', 'done', '完成');
      } catch (err) {
        if (!alive()) return;
        state.stamina -= 1;
        $('hudStamina').textContent = state.stamina;
        log(`${err.message} 体力 -1（剩 ${state.stamina}）`, 'bad');
        markStage('temple', 'fail', '失败');
        setCaption('被守卫发现，退回庙门冷静一下...');
        if (state.stamina <= 0) throw new Error('体力耗尽，这次寻宝失败了...');
        await wait(1200);
        markStage('temple', 'active', '重试');
      }
    }

    /* ⑤ 星象机关：限时 race */
    markStage('puzzle', 'active', '进行中');
    setCaption('神像底座亮起星图，3 秒内必须摆对！');
    await moveHero(0.775, 1700);
    if (!alive()) return;
    $('badgeStar').classList.add('on');
    log(await TreasureMap.solveStarPuzzle(), 'ok');
    $('badgeStar').classList.add('ok');
    $('badgeStar').textContent = '✨ 星图已对齐';
    markStage('puzzle', 'done', '完成');

    /* ⑥ 宝箱与反转结局 */
    markStage('chest', 'active', '进行中');
    setCaption('石门之后，传说中的宝箱正静静等着你...');
    await moveHero(0.952, 2000);
    if (!alive()) return;
    log(await TreasureMap.openTreasureBox(), 'gold');
    hero.classList.add('docked');
    chest.setAttribute('class', 'chest opened');
    burst(34);
    setCaption('🏆 恭喜!你找到了传说中的宝藏!');
    markStage('chest', 'done', '完成');
    log(await TreasureMap.readLastNote(), 'gold');
    await wait(400);
    if (!alive()) return;
    setCaption('🦜 原来真正的宝藏，还在下一座岛上...');
    setProgress(1);
    route.style.strokeDashoffset = 0;
    log(`寻宝结束：尝试 ${state.tries} 次，总耗时 ${((performance.now() - state.startAt) / 1000).toFixed(1)}s`, 'gold');
  } catch (err) {
    if (!alive()) return;
    log(err.message || String(err), 'bad');
    markStage('chest', 'fail', '失败');
    chest.setAttribute('class', 'chest');
    setCaption('💥 任务失败：' + (err.message || err));
  } finally {
    if (alive()) {
      clearInterval(state.clockTimer);
      state.running = false;
      hero.setAttribute('class', 'hero');
      startBtn.disabled = false;
      startBtn.querySelector('span').textContent = '再来一次';
    }
  }
}

/* ---------- 按钮与启动 ---------- */
startBtn.addEventListener('click', () => {
  if (state.running) return;
  reset();
  findTreasure();
});

$('speed').value = String(state.speed);
$('speed').addEventListener('change', (e) => {
  state.speed = Number(e.target.value) || 1;
});

buildNodes();
reset();
