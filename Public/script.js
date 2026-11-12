// ---------- Интерфейс и отрисовка ----------
// k = [К→З, К→С, З→К, З→С, С→К, С→З] — реакция первого цвета на второй; -1 притяжение, +1 отталкивание
const PRESETS = [
  [0, 0, -1, .5, 1, 0.3],
  [0.72, 0.45, 0.26, -0.86, 0.66, -0.80],
  //[-0.36, 0.81, -0.65, 0.32, 0.86, 0.88],
  //[-0.93, 0.17, -0.09, 0.82, 0.66, 0.76],
  //[0.03, 0.78, -0.50, 0.88, 0.98, 0.19],
  //[0.53, 0.82, 0.34, -0.11, 0.97, -0.73],
  [-0.22, 0.84, -0.17, 1.00, 0.06, 0.81],
  //[-0.2, -0.2, 0.2, -0.2, 0.2, 0.2],
  [-0.47, -0.57, -0.36, 0.89, -0.50, 0.28],
  [-0.22, -0.56, 0.71, 0.55, -0.54, 0.42],
  [-0.49, 0.31, -0.76, -0.52, 0.75, -0.67],
];
// Ядро физики
const SIM = {
  N: 200,        // число шаров каждого типа, до которого они рождаются
  SPAWN_RATE: 5, // сколько шаров рождается в секунду (всего, пока не набрано N каждого цвета)
  BIRTH_COOLDOWN: 0.05, // после рождения участники (оба старых шара и новый) не могут участвовать в новом рождении столько секунд
  BIRTH_VCAP: 0.99, // предел скорости новорождённого при ударе относительно центра масс пары, в долях VMAX
  EVENT_SCALE: 0.1, // вероятность того, что при ударе произойдёт рождение или исчезновение (иначе — обычный отскок); сумма spawnProb + deathProb = EVENT_SCALE
  SPAWN_LIMIT: 30, // общее число шаров, начиная с которого они перестают возникать из пустоты (дальше — только при ударах, см. collide)
  // Все размерные константы заданы в долях стороны мира W (квадрат), чтобы модель вела себя одинаково при любом размере экрана:
  // длины — в W, скорости — в W/с, ускорения — в W/с², DRAG — в 1/W. Пиксельные значения для конкретного W даёт scale(W), они лежат в w.c
  R_MIN: 1 / 2000,   // радиус шара на предельной скорости VMAX, доли W
  R_MAX: 1 / 24,     // радиус неподвижного шара, доли W
  R_TAU: 0.5,   // постоянная времени плавного изменения радиуса, с
  // Короткодействующая сила (как в Particle Life). Профиль по расстоянию d между центрами пары:
  //   d0 = ri + rj ≤ d < R_INT  — треугольный «горб» высотой F_MAX·|c| с вершиной посередине, знак — из коэффициента c;
  //   d < d0 (шары перекрылись) и d ≥ R_INT — сила равна нулю (перекрытия разрешают столкновения, см. collide).
  R_INT: 1 / 4,     // радиус взаимодействия, доли W (≥ 2·R_MAX, чтобы сетка годилась и для столкновений; < 1/2, чтобы расстояние по тору было однозначным)
  F_MAX: 1 / 6,     // ускорение на вершине горба при |c| = 1, W/с²
  K_SAME: 0.5,  // отталкивание между шарами одного типа (одно для всех типов; в тех же единицах, что k, > 0 — отталкивание)
  DRAG: 0.05,    // базовое трение на единицу скорости, 1/W: темп затухания = DRAG·v / (1 − (v/VMAX)²)², т.е. при малых v сила торможения ≈ DRAG·v²,
                  // а по мере приближения к VMAX трение растёт без предела (VMAX практически недостижима)
  DRAG_SMAX: 0.7,  // потолок v/VMAX в формуле трения (чтобы знаменатель не обнулялся; при этом темп затухания ≈ 1000/с)
  VMAX: 1 / 6,     // предельная скорость, W/с
  SPARK_MAX: 600,   // размер пула искр (кольцевой буфер, без выделения памяти на лету)
  BIRTH_SPARKS: 14, // число искр во вспышке при рождении шара
  SPARK_LIFE_MIN: 0.08, // время жизни искр при самом слабом ударе, с
  SPARK_LIFE_MAX: 0.5,  // время жизни искр при ударе на SPARK_REF и сильнее, с
  POP_LIFE: 0.4,    // длительность анимации «лопнувшего шарика», с
  POP_SHARDS: 20,   // число осколков лопнувшего шара
  POP_MAX: 200,     // максимум одновременно лопающихся шаров
  SPARK_REF: 5 / 32,   // скорость сближения, при которой искры имеют полную яркость, W/с
  SPARK_V0: 1 / 32,    // минимальная начальная скорость искры, W/с
  SPARK_VD: 7 / 96,    // разброс начальной скорости искры сверх минимальной, W/с
  CONC_SIGMA: 3 / 64,   // масштаб сравнения расстояний в показателе концентрации, доли W (≈ 3 максимальных радиуса)
  // Пиксельные значения размерных констант для мира со стороной W
  scale(W) {
    const c = {};
    for (const key of ['R_MIN', 'R_MAX', 'R_INT', 'F_MAX', 'VMAX', 'SPARK_REF', 'SPARK_V0', 'SPARK_VD', 'CONC_SIGMA']) c[key] = this[key] * W;
    c.DRAG = this.DRAG / W;
    return c;
  },
  create(W, H, k) {
    // шаров в начале нет — они рождаются по ходу дела (см. spawn)
    // k копируем, чтобы не менять исходный пресет
    // sp — пул искр, по 7 чисел на искру: x, y, vx, vy, t (жизнь 1→0), скорость затухания, яркость
    return { W, H, c: this.scale(W), k: k.slice(), ps: [], born: 0,
             sp: new Float32Array(this.SPARK_MAX * 7), sn: 0, pops: [] };
  },
  // Искры в точке удара; яркость и количество растут с силой удара s (0..1)
  emit(w, x, y, vx, vy, s) {
    const cnt = 1 + Math.floor(s * 3), M = this.SPARK_MAX, sp = w.sp;
    for (let n = 0; n < cnt; n++) {
      const o = w.sn * 7; w.sn = (w.sn + 1) % M;
      const a = Math.random() * Math.PI * 2, v = (w.c.SPARK_V0 + Math.random() * w.c.SPARK_VD) * (0.5 + s);
      sp[o] = x; sp[o + 1] = y;
      sp[o + 2] = vx * 0.3 + Math.cos(a) * v; sp[o + 3] = vy * 0.3 + Math.sin(a) * v;
      sp[o + 4] = 1;
      // время жизни растёт с силой удара: слабые искры гаснут быстро, сильные летят дольше (и дальше)
      const life = (this.SPARK_LIFE_MIN + (this.SPARK_LIFE_MAX - this.SPARK_LIFE_MIN) * s) * (0.7 + Math.random() * 0.6);
      sp[o + 5] = 1 / life; sp[o + 6] = s;
    }
  },
  // Вспышка при рождении шара: BIRTH_SPARKS искр веером во все стороны из точки рождения
  burst(w, x, y, vx, vy) {
    const cnt = this.BIRTH_SPARKS, M = this.SPARK_MAX, sp = w.sp, a0 = Math.random() * Math.PI * 2;
    for (let n = 0; n < cnt; n++) {
      const o = w.sn * 7; w.sn = (w.sn + 1) % M;
      const a = a0 + (n + Math.random() * 0.8) / cnt * Math.PI * 2, v = (w.c.SPARK_V0 + Math.random() * w.c.SPARK_VD) * 1.5;
      sp[o] = x; sp[o + 1] = y;
      sp[o + 2] = vx * 0.15 + Math.cos(a) * v; sp[o + 3] = vy * 0.15 + Math.sin(a) * v;
      sp[o + 4] = 1;
      sp[o + 5] = 1 / ((this.SPARK_LIFE_MIN + (this.SPARK_LIFE_MAX - this.SPARK_LIFE_MIN) * 0.7) * (0.7 + Math.random() * 0.6));
      sp[o + 6] = 0.9;
    }
  },
  sparks(w, dt) {
    const { W, H, sp } = w, damp = Math.max(0, 1 - 3 * dt);
    for (let o = 0; o < sp.length; o += 7) {
      if (sp[o + 4] <= 0) continue;
      sp[o + 4] -= sp[o + 5] * dt;
      sp[o] = ((sp[o] + sp[o + 2] * dt) % W + W) % W; sp[o + 1] = ((sp[o + 1] + sp[o + 3] * dt) % H + H) % H;
      sp[o + 2] *= damp; sp[o + 3] *= damp;
    }
  },
  // k =[0→1, 0→2, 1→0, 1→2, 2→0, 2→1]: k[a→b] — реакция типа a на тип b; для одинаковых типов — константа K_SAME
  coef(k, a, b) { return a === b ? this.K_SAME : k[a * 2 + (b < a ? b : b - 1)]; },
  // Рождение шаров: пока шаров цвета меньше N, возникают из ниоткуда в случайной точке,
  // на максимальной скорости и в случайном направлении (не чаще SPAWN_RATE шаров в секунду)
  // Тип нового шара: вероятность пропорциональна числу недостающих до N шаров этого типа
  // (cnt — текущее число шаров каждого типа); -1, если все типы набраны. Тип с need = 0 не выбирается
  pickType(cnt) {
    const need = cnt.map(c => Math.max(0, this.N - c)), total = need[0] + need[1] + need[2];
    if (!total) return -1;
    let t = 0, x = Math.random() * total;
    while (x >= need[t]) x -= need[t++];
    return t;
  },
  // «Заполненность» популяции: 0 при count ≤ SPAWN_LIMIT, линейно до 1 при count = 3N (суммарный максимум)
  crowd(count) { return Math.max(0, Math.min(1, (count - this.SPAWN_LIMIT) / (3 * this.N - this.SPAWN_LIMIT))); },
  // Вероятность рождения шара при ударе: EVENT_SCALE при count ≤ SPAWN_LIMIT, линейно до 0 при count = 3N
  spawnProb(count) { return this.EVENT_SCALE * (1 - this.crowd(count)); },
  // Вероятность исчезновения одного из шаров при ударе: 0 при count ≤ SPAWN_LIMIT, линейно до EVENT_SCALE при count = 3N.
  // Сумма с вероятностью рождения всегда равна EVENT_SCALE, так что вероятность «ничего не произошло» — ровно 1 − EVENT_SCALE
  deathProb(count) { return this.EVENT_SCALE * this.crowd(count); },
  spawn(w, dt) {
    const { W, H, ps } = w, cnt = [0, 0, 0];
    for (const p of ps) cnt[p.t]++;
    w.born = Math.min(w.born + this.SPAWN_RATE * dt, 1 + this.SPAWN_RATE * dt); // накопление не уходит в «запас»
    while (w.born >= 1) {
      const t = this.pickType(cnt);
      if (t < 0 || ps.length >= this.SPAWN_LIMIT) { w.born = 0; return; }
      const a = Math.random() * Math.PI * 2;
      ps.push({ t, x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * w.c.VMAX, vy: Math.sin(a) * w.c.VMAX, r: w.c.R_MIN });
      cnt[t]++; w.born--;
    }
  },
  step(w, dt) {
    this.spawn(w, dt);
    const { W, H, ps, k, c } = w, n = ps.length;
    const ax = new Float64Array(n), ay = new Float64Array(n);
    // матрица m[a*3+b]: как тип a реагирует на тип b (диагональ = K_SAME)
    const m = new Float64Array(9);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) m[a * 3 + b] = this.coef(k, a, b);
    const R = c.R_INT, R2 = R * R;
    this.near(w, (i, j) => {
      const pi = ps[i], pj = ps[j];
      let dx = pj.x - pi.x, dy = pj.y - pi.y;
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R2 || d2 === 0) return;
      const d = Math.sqrt(d2), ux = dx / d, uy = dy / d, d0 = pi.r + pj.r;
      // fi, fj — ускорение i к j и j к i (> 0 — притяжение). Силы несимметричны: i реагирует на j с cij, j на i с cji
      // Массы учитываются по принципу удара, но для сил масса берётся по радиусу (m = r, а не r²): ускорение i = 2·mj/M·h —
      // тяжёлый шар слабее реагирует на лёгкий; лёгкий реагирует как обычно (множитель не больше 1)
      const h = c.F_MAX * Math.max(0, 1 - Math.abs(2 * d - d0 - R) / (R - d0)); // c < 0 — притяжение, c > 0 — отталкивание
      const mi = pi.r, mj = pj.r, M = mi + mj;
      // множитель ограничен единицей: лёгкий (быстрый) шар не усиливается, иначе обратная связь «быстрее → меньше → легче → ещё быстрее»
      const fi = -m[pi.t * 3 + pj.t] * h * Math.min(1, 2 * mj / M), fj = -m[pj.t * 3 + pi.t] * h * Math.min(1, 2 * mi / M);
      ax[i] += fi * ux; ay[i] += fi * uy;
      ax[j] -= fj * ux; ay[j] -= fj * uy;
    });
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      if (p.cd > 0) p.cd -= dt;
      // скорость после действия сил; трение зависит от неё и применяется неявно (деление на 1 + dr·dt), чтобы быть устойчивым при огромном dr
      const ux = p.vx + ax[i] * dt, uy = p.vy + ay[i] * dt, q = Math.min(Math.hypot(ux, uy) / c.VMAX, this.DRAG_SMAX);
      const dr = c.DRAG * q * c.VMAX / ((1 - q * q) * (1 - q * q)), f = 1 / (1 + dr * dt);
      p.vx = ux * f; p.vy = uy * f;
      let v = Math.hypot(p.vx, p.vy);
      // предельная скорость: если шар по какой-то причине (силы, удар, рождение) оказался быстрее VMAX, скорость просто срезается до VMAX
      if (v > c.VMAX) { const s = c.VMAX / v; p.vx *= s; p.vy *= s; v = c.VMAX; }
      // радиус линейно убывает со скоростью: R_MAX при v = 0, R_MIN при v = VMAX (v уже ограничена выше)
      p.r += (c.R_MAX - (c.R_MAX - c.R_MIN) * v / c.VMAX - p.r) * Math.min(1, dt / this.R_TAU);
      p.x = ((p.x + p.vx * dt) % W + W) % W; p.y = ((p.y + p.vy * dt) % H + H) % H;
    }
    this.collide(w);
    this.sparks(w, dt);
    for (const q of w.pops) q.age += dt;
    if (w.pops.length && w.pops[0].age >= this.POP_LIFE) w.pops = w.pops.filter(q => q.age < this.POP_LIFE);
  },
  // Все пары шаров из соседних ячеек сетки на торе (ячейка ≥ R_INT, поэтому любая пара ближе R_INT попадёт);
  // каждая пара передаётся в fn(i, j) один раз (i < j). Шары, добавленные в ps во время обхода, не участвуют
  near(w, fn) {
    const { W, H, ps } = w, n = ps.length;
    const gx = Math.max(1, Math.floor(W / w.c.R_INT)), gy = Math.max(1, Math.floor(H / w.c.R_INT));
    const head = new Int32Array(gx * gy).fill(-1), next = new Int32Array(n), nb = [];
    for (let i = 0; i < n; i++) {
      const c = Math.min(gx - 1, Math.floor(ps[i].x / W * gx)) + Math.min(gy - 1, Math.floor(ps[i].y / H * gy)) * gx;
      next[i] = head[c]; head[c] = i;
    }
    for (let cy = 0; cy < gy; cy++) for (let cx = 0; cx < gx; cx++) {
      nb.length = 0; // соседние ячейки без повторов (при малом мире соседи по тору могут совпадать)
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const c2 = (cx + ox + gx) % gx + ((cy + oy + gy) % gy) * gx;
        if (!nb.includes(c2)) nb.push(c2);
      }
      for (let i = head[cx + cy * gx]; i >= 0; i = next[i])
        for (const c2 of nb) for (let j = head[c2]; j >= 0; j = next[j]) if (i < j) fn(i, j);
    }
  },
  // Столкновения с учётом масс: масса шара пропорциональна площади (m = r²). Удар имеет три взаимоисключающих исхода,
  // выбираемых одним броском: [0, pb) — рождение, [pb, pb + pd) — исчезновение, остальное — отскок
  // (pb = spawnProb, pd = deathProb). Если выпало рождение, но оно невозможно (пауза после рождения или все типы
  // набраны), удар просто упругий — исчезновением он не подменяется:
  //   1) упругий отскок: нормальный импульс J = 2μ·rel, где μ = ma·mb/(ma+mb) — приведённая масса;
  //   2) исчезновение одного из шаров (deathProb): оставшийся получает ровно ту скорость, что дал бы упругий удар
  //      с настоящим шаром его массы;
  //   3) рождение нового шара массы mc = R_MIN² (spawnProb): пара гасит сближение (неупругий удар, J = μ·rel),
  //      освободившаяся энергия ½μ·rel² уходит новому шару — в системе центра масс пары он летит вдоль касательной
  //      со скоростью w, а пара получает отдачу −(mc/M)·w (импульс и энергия сохраняются). Если w вышла бы больше
  //      BIRTH_VCAP·VMAX, новый шар забирает только энергию для этой скорости, а пара отскакивает частично упруго
  //      (коэффициент восстановления e подбирается так, чтобы энергия сошлась)
  collide(w) {
    const { W, H, ps, c } = w, n = ps.length, cnt = [0, 0, 0];
    let alive = n;
    for (const p of ps) cnt[p.t]++;
    this.near(w, (i, j) => {
      const a = ps[i], b = ps[j], D = a.r + b.r;
      if (a.dead || b.dead) return;
      let dx = b.x - a.x, dy = b.y - a.y;
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
      const d2 = dx * dx + dy * dy;
      if (d2 >= D * D || d2 === 0) return;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; // скорость сближения
      const ma = a.r * a.r, mb = b.r * b.r, M = ma + mb, mu = ma * mb / M;
      if (rel > 0) {
        const cx = ((a.x + nx * a.r) % W + W) % W, cy = ((a.y + ny * a.r) % H + H) % H;
        const mx = (ma * a.vx + mb * b.vx) / M, my = (ma * a.vy + mb * b.vy) / M; // скорость центра масс пары
        // исходы удара: рождение нового шара / исчезновение одного из двух / обычный упругий отскок
        const pb = this.spawnProb(alive), pd = this.deathProb(alive), roll = Math.random();
        const t = roll < pb && !(a.cd > 0 || b.cd > 0) ? this.pickType(cnt) : -1;
        if (roll >= pb && roll < pb + pd) {
          // исчезает случайный шар; оставшийся отскакивает ровно так, как от настоящего (второй просто не двигается)
          const gone = Math.random() < 0.5 ? a : b, J = 2 * mu * rel;
          if (gone === a) { b.vx += J / mb * nx; b.vy += J / mb * ny; } else { a.vx -= J / ma * nx; a.vy -= J / ma * ny; }
          gone.dead = true; cnt[gone.t]--; alive--;
          // анимация лопнувшего шарика: ударная волна и осколки (углы и скорости осколков фиксируются здесь)
          if (w.pops.length < this.POP_MAX) {
            // осколок: [направление, скорость разлёта, доля радиуса шара, на которой он стартует, относительный размер 0.2–1 (разброс в 5 раз, равномерно по логарифму)]; √ даёт равномерность по площади круга
            const sh = [];
            for (let q = 0; q < this.POP_SHARDS; q++) sh.push([Math.random() * Math.PI * 2, 0.5 + Math.random(), Math.sqrt(Math.random()), Math.pow(0.2, Math.random())]);
            w.pops.push({ t: gone.t, x: gone.x, y: gone.y, r: gone.r, vx: gone.vx * 0.3, vy: gone.vy * 0.3, age: 0, sh });
          }
        } else if (t < 0) {
          const J = 2 * mu * rel;
          a.vx -= J / ma * nx; a.vy -= J / ma * ny; b.vx += J / mb * nx; b.vy += J / mb * ny;
        } else {
          const mc = c.R_MIN * c.R_MIN, E0 = mu * rel * rel / 2, k = mc * (1 + mc / M);
          // скорость нового шара относительно центра масс пары при передаче всей энергии E0 — с ограничением сверху
          // (если вместе со скоростью центра масс выйдет больше VMAX, лишнее срежет step)
          const wv = Math.min(Math.sqrt(2 * E0 / k), this.BIRTH_VCAP * c.VMAX), E = k * wv * wv / 2;
          const ec = Math.sqrt(Math.max(0, 1 - E / E0)), J = mu * (1 + ec) * rel; // e = 0 — пара полностью гасит сближение
          const sg = Math.random() < 0.5 ? -1 : 1, tx = -ny * sg, ty = nx * sg, rc = mc / M * wv; // rc — отдача пары
          a.vx += -J / ma * nx - rc * tx; a.vy += -J / ma * ny - rc * ty;
          b.vx += J / mb * nx - rc * tx; b.vy += J / mb * ny - rc * ty;
          // новый шар выдавливается вбок от точки касания ровно настолько, чтобы не перекрываться с родителями
          const e = Math.max(a.r, b.r) + c.R_MIN;
          ps.push({ t, x: ((cx + tx * e) % W + W) % W, y: ((cy + ty * e) % H + H) % H,
                    vx: mx + wv * tx, vy: my + wv * ty, r: c.R_MIN, cd: this.BIRTH_COOLDOWN });
          a.cd = b.cd = this.BIRTH_COOLDOWN;
          this.burst(w, cx, cy, mx, my);
          cnt[t]++; alive++;
        }
        this.emit(w, cx, cy, (a.vx + b.vx) / 2, (a.vy + b.vy) / 2, Math.min(1, rel / c.SPARK_REF));
      }
      // раздвигаем пересёкшиеся шары: лёгкий сдвигается больше тяжёлого (центр масс пары остаётся на месте)
      const pa = (D - d) * mb / M, pb = (D - d) * ma / M;
      if (!a.dead) { a.x = ((a.x - nx * pa) % W + W) % W; a.y = ((a.y - ny * pa) % H + H) % H; }
      if (!b.dead) { b.x = ((b.x + nx * pb) % W + W) % W; b.y = ((b.y + ny * pb) % H + H) % H; }
    });
    if (ps.some(p => p.dead)) w.ps = ps.filter(p => !p.dead);
  },
  // Концентрация шаров (независимо от типа), 0..1. Опоры шкалы:
  //   0 — белый шум (равномерный случайный разброс), 1 — самая плотная упаковка этих же шаров
  //   (гексагональная куча кругов среднего радиуса — максимум, достижимый с учётом размера шаров).
  // Мера: сумма по парам гауссова ядра exp(-d²/2σ²) (расстояние по тору). Для белого шума её ожидание
  // ≈ pairs·2πσ²/(W·H); для кучи считаем сумму напрямую по n ближайшим к центру узлам гекс-решётки.
  concentration(w) {
    const { W, H, ps } = w, n = ps.length;
    if (n < 2) return 0;
    const s2 = 2 * w.c.CONC_SIGMA * w.c.CONC_SIGMA, kern = d2 => Math.exp(-d2 / s2);
    let sum = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = Math.abs(ps[j].x - ps[i].x), dy = Math.abs(ps[j].y - ps[i].y);
      if (dx > W / 2) dx = W - dx;
      if (dy > H / 2) dy = H - dy;
      sum += kern(dx * dx + dy * dy);
    }
    // плотнейшая упаковка: шаг решётки = диаметр среднего шара
    const d = 2 * ps.reduce((s, p) => s + p.r, 0) / n, m = Math.ceil(Math.sqrt(n)) + 2, pts = [];
    for (let j = -m; j <= m; j++) for (let i = -m; i <= m; i++) {
      const x = d * (i + j / 2), y = d * j * Math.sqrt(3) / 2;
      pts.push({ x, y, q: x * x + y * y });
    }
    pts.sort((a, b) => a.q - b.q);
    let best = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
      best += kern((pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2);
    const base = n * (n - 1) / 2 * Math.PI * s2 / (W * H);
    return best > base ? Math.max(0, Math.min(1, (sum - base) / (best - base))) : 0;
  }
};

let cur = 0;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W, H, world;
const fmt = v => (v > 0 ? '+' : '') + v.toFixed(2);

function restart() { world = SIM.create(W, H, PRESETS[cur]); }

// Панель слева внизу: кнопки наборов над индикатором коэффициентов
const hud = document.createElement('div');
hud.id = 'hud';
const presetBar = document.createElement('div');
presetBar.id = 'presets';
const status = document.createElement('div');
status.id = 'status';
hud.append(presetBar, status);
document.body.appendChild(hud);
const buttons = PRESETS.map((_, i) => {
  const btn = document.createElement('button');
  btn.textContent = i + 1;
  btn.addEventListener('click', () => select(i));
  presetBar.appendChild(btn);
  return btn;
});
const L = ['<span class="r">К</span>', '<span class="g">З</span>', '<span class="b">С</span>'];
function showCoefs() {
  const k = PRESETS[cur], pr = (a, b) => `${L[a]}→${L[b]} ${fmt(SIM.coef(k, a, b))}`;
  status.innerHTML = `${pr(0, 1)} · ${pr(1, 0)}<br>` +
    `${pr(0, 2)} · ${pr(2, 0)}<br>` +
    `${pr(1, 2)} · ${pr(2, 1)}<br>` +
    `<span class="r" id="nr">0</span> <span class="g" id="ng">0</span> <span class="b" id="nb">0</span> <span id="conc">0%</span>`;
  concEl = document.getElementById('conc');
  cntEl = ['nr', 'ng', 'nb'].map(id => document.getElementById(id));
  buttons.forEach((b, i) => b.classList.toggle('on', i === cur));
}
let concEl, cntEl;
function select(i) {
  cur = i;
  restart();
  showCoefs();
}
window.addEventListener('keydown', e => {
  const i = +e.key - 1;
  if (i >= 0 && i < PRESETS.length) select(i);
});
const UI_REF = 1920; // размер мира, при котором подбирались пиксельные размеры мелких деталей отрисовки (клочья, штрихи искр)
let concAt = 0;
function updateConc(t) {
  if (t - concAt < 200) return; concAt = t;
  const cnt = [0, 0, 0];
  for (const p of world.ps) cnt[p.t]++;
  cntEl.forEach((el, i) => el.textContent = cnt[i]);
  concEl.textContent = Math.round(SIM.concentration(world) * 100) + '%';
}

function resize() {
  // квадратный мир со стороной в большую сторону окна; невидимая часть по другой оси скрыта (overflow: hidden)
  canvas.width = canvas.height = W = H = Math.max(window.innerWidth, window.innerHeight);
  restart();
  buildSprites();
}

window.addEventListener('resize', resize);

// Спрайты объёмных шаров: рисуем один раз для каждого цвета в offscreen-canvas
const RGB = [[255, 64, 64], [61, 220, 107], [74, 144, 255]]; // красный, зелёный, синий
const mix = (c, t) => c.map(v => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t)); // t<0 темнее, t>0 светлее
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
let sprites = [];
function buildSprites() {
  const R = world.c.R_MAX, size = Math.ceil(R * 2 + 2); // спрайт максимального размера, при отрисовке масштабируется вниз
  sprites = RGB.map(c => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d'), m = size / 2;
    // основная заливка: свет в левом верхнем углу, тень по краю
    const body = g.createRadialGradient(m - R * 0.35, m - R * 0.4, R * 0.1, m, m, R);
    body.addColorStop(0, rgb(mix(c, 0.55)));
    body.addColorStop(0.45, rgb(c));
    body.addColorStop(1, rgb(mix(c, -0.65)));
    g.fillStyle = body;
    g.beginPath(); g.arc(m, m, R, 0, Math.PI * 2); g.fill();
    // отражённый свет снизу-справа
    const rim = g.createRadialGradient(m + R * 0.5, m + R * 0.6, 0, m + R * 0.5, m + R * 0.6, R * 0.8);
    rim.addColorStop(0, 'rgba(255,255,255,0.18)');
    rim.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rim;
    g.beginPath(); g.arc(m, m, R, 0, Math.PI * 2); g.fill();
    // блик
    const spec = g.createRadialGradient(m - R * 0.4, m - R * 0.45, 0, m - R * 0.4, m - R * 0.45, R * 0.35);
    spec.addColorStop(0, 'rgba(255,255,255,0.95)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec;
    g.beginPath(); g.arc(m - R * 0.4, m - R * 0.45, R * 0.35, 0, Math.PI * 2); g.fill();
    return cv;
  });
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const full = sprites[0].width;
  for (const p of world.ps) {
    const img = sprites[p.t], R = p.r, size = full * p.r / world.c.R_MAX, half = size / 2;
    // тайлинг: рисуем копии у краёв
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      const x = p.x + ox, y = p.y + oy;
      if (x < -R || x > W + R || y < -R || y > H + R) continue;
      ctx.drawImage(img, x - half, y - half, size, size);
    }
  }
  drawPops();
  drawSparks();
}

// Лопнувший шарик: только клочья цвета шара — рваные треугольники, стартующие в случайных точках всей площади шара, чуть разлетаются, кувыркаются, мельчают
// и гаснут («испаряются»); разлёт небольшой и быстро замедляется
function drawPops() {
  for (const q of world.pops) {
    const u = q.age / SIM.POP_LIFE, e = 1 - (1 - u) * (1 - u), fade = 1 - u * u; // e — замедляющийся разлёт, fade — угасание
    const x = q.x + q.vx * q.age, y = q.y + q.vy * q.age;
    const ui = W / UI_REF, shrink = 1 - u * 0.8, base = q.r * 0.22 + 2.5 * ui, travel = 6 * ui + q.r * 0.35; // base — размер самого крупного клочка
    ctx.fillStyle = rgb(mix(RGB[q.t], 0.15)); ctx.globalAlpha = fade;
    for (const [a, k, f, z] of q.sh) {
      const size = base * z * shrink, d = q.r * f + travel * k * e, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, rot = a * 3 + q.age * 12 * (k - 1);
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(rot) * size, py + Math.sin(rot) * size);
      ctx.lineTo(px + Math.cos(rot + 2.2) * size * 0.7, py + Math.sin(rot + 2.2) * size * 0.7);
      ctx.lineTo(px + Math.cos(rot + 4.1) * size * 0.5, py + Math.sin(rot + 4.1) * size * 0.5);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Искры: линии-штрихи вдоль скорости, аддитивное смешивание. Яркость квантуется на 6 уровней,
// чтобы рисовать каждый уровень одним путём (6 вызовов stroke на кадр, а не по одному на искру)
const SPARK_LEVELS = 6;
function drawSparks() {
  const sp = world.sp, paths = [];
  for (let l = 0; l < SPARK_LEVELS; l++) paths.push(new Path2D());
  let any = false;
  for (let o = 0; o < sp.length; o += 7) {
    const t = sp[o + 4]; if (t <= 0) continue;
    const l = Math.min(SPARK_LEVELS - 1, Math.floor(t * (0.3 + 0.7 * sp[o + 6]) * SPARK_LEVELS));
    const x = sp[o], y = sp[o + 1];
    paths[l].moveTo(x, y); paths[l].lineTo(x - sp[o + 2] * 0.03, y - sp[o + 3] * 0.03);
    any = true;
  }
  if (!any) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1.5 * W / UI_REF; ctx.lineCap = 'round';
  for (let l = 0; l < SPARK_LEVELS; l++) {
    ctx.strokeStyle = `rgba(255,${200 + l * 9},${120 + l * 24},${(l + 1) / SPARK_LEVELS})`;
    ctx.stroke(paths[l]);
  }
  ctx.restore();
}

let last = performance.now(), acc = 0;
function frame(t) {
  acc += Math.min(0.1, (t - last) / 1000); last = t;
  const dt = 1 / 240;
  while (acc >= dt) { SIM.step(world, dt); acc -= dt; }
  draw();
  updateConc(t);
  requestAnimationFrame(frame);
}

resize();
showCoefs();
requestAnimationFrame(frame);
