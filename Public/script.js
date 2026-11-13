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
  BIRTH_COOLDOWN: 0.05, // новые шары (после слияния или деления) столько секунд только отскакивают — в новых событиях не участвуют
  EVENT_SCALE: 0.1, // вероятность того, что удар кончится событием — слиянием (2 → 1) или делением (2 → 3); иначе — обычный отскок
  SPAWN_LIMIT: 30, // общее число шаров, начиная с которого они перестают возникать из пустоты (дальше — только при ударах, см. collide)
  TYPE_POW: 1,   // жёсткость глобальной тяги числа шаров каждого типа к N/2 при выборе типа нового шара (см. pickType); больше — строже
  LOCAL_POW: 2,  // сила локального правила «рождается тот тип, которого рядом меньше» (см. pickType); 0 — отключено
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
  BIRTH_SPARKS: 14, // число искр во вспышке при слиянии или делении
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
  // Вспышка при слиянии или делении: BIRTH_SPARKS искр веером во все стороны из точки удара
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
  // Тип нового шара. Вес типа t — произведение двух множителей:
  //   глобальный ((N − c)/(c + 1))^TYPE_POW, c = cnt[t] — число шаров типа: при c → 0 вес неограниченно растёт (вероятность → 100%),
  //     при c = N/2 он ≈ 1, при c = N равен нулю (тип не выбирается, больше N шаров одного типа не бывает);
  //   локальный (1.05 − s)^LOCAL_POW, s — доля типа в суммарной массе (площади, r²) шаров рядом с точкой удара (loc — массы по типам):
  //     чем меньше типа поблизости, тем он вероятнее. Без loc или если рядом никого — множитель одинаков для всех.
  // Возвращает -1, если все типы набраны
  pickType(cnt, loc) {
    const tot = loc ? loc[0] + loc[1] + loc[2] : 0, wt = [0, 0, 0];
    let sum = 0;
    for (let t = 0; t < 3; t++) {
      const c = cnt[t];
      if (c >= this.N) continue;
      sum += wt[t] = Math.pow((this.N - c) / (c + 1), this.TYPE_POW) * Math.pow(1.05 - (tot > 0 ? loc[t] / tot : 1 / 3), this.LOCAL_POW);
    }
    if (!sum) return -1;
    let t = 0, x = Math.random() * sum;
    while (t < 2 && x >= wt[t]) x -= wt[t++];
    while (!wt[t]) t--; // на случай ошибки округления
    return t;
  },
  // Рождение из пустоты — только затравка: пока шаров меньше SPAWN_LIMIT, они возникают в случайной точке,
  // на максимальной скорости и в случайном направлении (не чаще SPAWN_RATE шаров в секунду)
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
  // Столкновения с учётом масс: масса шара пропорциональна площади (m = r²). Исходы удара:
  //   1) упругий отскок (вероятность 1 − EVENT_SCALE, а также всегда, если у кого-то из пары не истекла пауза cd):
  //      нормальный импульс J = 2μ·rel, где μ = ma·mb/(ma+mb) — приведённая масса;
  //   2) событие (EVENT_SCALE): оба шара исчезают, вместо них появляются новые, типы которых выбираются заново (pickType).
  //      u = (ca + cb)/2N — средняя заполненность типов пары (c — число шаров типа). С вероятностью u пара сливается в один шар,
  //      с вероятностью 1 − u делится на три. При c = N/2 шансы равны — к этому числу шаров каждого типа система и тянется:
  //      удары избыточных типов чаще убавляют шары, редких — прибавляют.
  //      Слияние: шар массы ma + mb в центре масс пары, летит со скоростью центра масс (импульс сохраняется, энергия сближения — в искры).
  //      Деление: три шара равной массы (ma + mb)/3 в вершинах треугольника вокруг точки удара; скорость каждого — скорость центра масс
  //      плюс разлёт от центра со скоростью |v_отн|·√(μ/M): импульс сохраняется, а вся энергия пары в системе центра масс уходит в разлёт.
  //      Дальше новые шары живут по обычным правилам (силы, трение, срез до VMAX, радиус подстраивается под скорость)
  collide(w) {
    const { W, H, ps, c } = w, cnt = [0, 0, 0];
    const wrapX = x => (x % W + W) % W, wrapY = y => (y % H + H) % H;
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
      const rvx = a.vx - b.vx, rvy = a.vy - b.vy, rel = rvx * nx + rvy * ny; // rel — скорость сближения
      const ma = a.r * a.r, mb = b.r * b.r, M = ma + mb, mu = ma * mb / M;
      if (rel > 0) {
        const cx = wrapX(a.x + nx * a.r), cy = wrapY(a.y + ny * a.r); // точка удара
        const s = Math.min(1, rel / c.SPARK_REF);
        if (a.cd > 0 || b.cd > 0 || Math.random() >= this.EVENT_SCALE) {
          const J = 2 * mu * rel;
          a.vx -= J / ma * nx; a.vy -= J / ma * ny; b.vx += J / mb * nx; b.vy += J / mb * ny;
          this.emit(w, cx, cy, (a.vx + b.vx) / 2, (a.vy + b.vy) / 2, s);
        } else {
          const u = (cnt[a.t] + cnt[b.t]) / (2 * this.N);
          const mx = (ma * a.vx + mb * b.vx) / M, my = (ma * a.vy + mb * b.vy) / M; // скорость центра масс пары
          a.dead = b.dead = true; cnt[a.t]--; cnt[b.t]--;
          // массы шаров каждого типа в радиусе R_INT от точки удара (сами родители не считаются)
          const loc = [0, 0, 0], R2 = c.R_INT * c.R_INT;
          for (const p of ps) {
            if (p.dead) continue;
            let ex = Math.abs(p.x - cx), ey = Math.abs(p.y - cy);
            if (ex > W / 2) ex = W - ex;
            if (ey > H / 2) ey = H - ey;
            if (ex * ex + ey * ey < R2) loc[p.t] += p.r * p.r;
          }
          const born = (x, y, vx, vy, r) => {
            const t = this.pickType(cnt, loc);
            if (t < 0) return;
            ps.push({ t, x: wrapX(x), y: wrapY(y), vx, vy, r, cd: this.BIRTH_COOLDOWN });
            cnt[t]++;
          };
          if (Math.random() < u) {
            born(a.x + dx * mb / M, a.y + dy * mb / M, mx, my, Math.min(c.R_MAX, Math.sqrt(M)));
          } else {
            const r = Math.max(c.R_MIN, Math.sqrt(M / 3)), e = r * 1.2, a0 = Math.random() * Math.PI * 2; // e > 2r/√3 — шары не перекрываются
            const v = Math.hypot(rvx, rvy) * Math.sqrt(mu / M);
            for (let q = 0; q < 3; q++) {
              const ang = a0 + q * Math.PI * 2 / 3, ux = Math.cos(ang), uy = Math.sin(ang);
              born(cx + ux * e, cy + uy * e, mx + ux * v, my + uy * v, r);
            }
            // родители лопаются: осколок — [направление, скорость разлёта, доля радиуса шара, на которой он стартует,
            // относительный размер 0.2–1 (равномерно по логарифму)]; √ даёт равномерность по площади круга
            for (const gone of [a, b]) {
              if (w.pops.length >= this.POP_MAX) break;
              const sh = [];
              for (let q = 0; q < this.POP_SHARDS; q++) sh.push([Math.random() * Math.PI * 2, 0.5 + Math.random(), Math.sqrt(Math.random()), Math.pow(0.2, Math.random())]);
              w.pops.push({ t: gone.t, x: gone.x, y: gone.y, r: gone.r, vx: gone.vx * 0.3, vy: gone.vy * 0.3, age: 0, sh });
            }
          }
          this.burst(w, cx, cy, mx, my);
          return;
        }
      }
      // раздвигаем пересёкшиеся шары: лёгкий сдвигается больше тяжёлого (центр масс пары остаётся на месте)
      const pa = (D - d) * mb / M, pb = (D - d) * ma / M;
      a.x = wrapX(a.x - nx * pa); a.y = wrapY(a.y - ny * pa);
      b.x = wrapX(b.x + nx * pb); b.y = wrapY(b.y + ny * pb);
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
// Мир — квадрат (тор) постоянного размера в условных единицах; на экран он попадает через камеру (см. cam)
const W = 1920, H = 1920;
let world;
let VW = 0, VH = 0; // размер окна (и холста), px
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
let concAt = 0;
function updateConc(t) {
  if (t - concAt < 200) return; concAt = t;
  const cnt = [0, 0, 0];
  for (const p of world.ps) cnt[p.t]++;
  cntEl.forEach((el, i) => el.textContent = cnt[i]);
  concEl.textContent = Math.round(SIM.concentration(world) * 100) + '%';
}

// Камера: x, y — точка мира в левом верхнем углу экрана, z — пикселей экрана на единицу мира. Экран = (мир − cam)·z
const cam = { x: 0, y: 0, z: 1 };
const ZOOM_MIN_TILE = 8; // при отдалении плитка мира не становится меньше стольких пикселей
const ZOOM_MAX = 1000;   // предел приближения: во столько раз крупнее, чем «мир во всю большую сторону окна»
const clampZ = z => Math.max(ZOOM_MIN_TILE / W, Math.min(ZOOM_MAX * Math.max(VW, VH) / W, z));
// Сдвиг вида на dx, dy пикселей экрана; камера приводится по модулю размера мира, поэтому двигаться можно бесконечно
function panBy(dx, dy) {
  cam.x = ((cam.x - dx / cam.z) % W + W) % W;
  cam.y = ((cam.y - dy / cam.z) % H + H) % H;
}
// Масштабирование в f раз так, чтобы точка мира под точкой экрана (sx, sy) осталась на месте
function zoomAt(sx, sy, f) {
  const wx = cam.x + sx / cam.z, wy = cam.y + sy / cam.z;
  cam.z = clampZ(cam.z * f);
  cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z;
  panBy(0, 0);
}

function resize() {
  // холст во всё окно; мир и симуляция не трогаются, масштаб подстраивается под новую большую сторону окна
  const old = Math.max(VW, VH);
  VW = canvas.width = window.innerWidth; VH = canvas.height = window.innerHeight;
  const side = Math.max(VW, VH);
  cam.z = old ? clampZ(cam.z * side / old) : side / W; // при запуске мир занимает большую сторону окна целиком
}

window.addEventListener('resize', resize);

// Жесты: один указатель (мышь или палец) двигает вид, два пальца — двигают и масштабируют одновременно, колесо — масштаб под курсором
const pointers = new Map();
const pinch = () => {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
};
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1) {
    panBy(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY;
  } else {
    // центр и расстояние между первыми двумя пальцами до и после движения
    const a = pinch();
    p.x = e.clientX; p.y = e.clientY;
    const b = pinch();
    panBy(b.x - a.x, b.y - a.y);
    if (a.d > 0 && b.d > 0) zoomAt(b.x, b.y, b.d / a.d);
  }
});
function pointerEnd(e) {
  pointers.delete(e.pointerId);
  if (!pointers.size) canvas.classList.remove('drag');
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  // щипок на тачпаде приходит как колесо с ctrlKey и малыми deltaY; deltaMode 1 — прокрутка строками
  const d = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * (e.ctrlKey ? 0.01 : 0.0015);
  zoomAt(e.clientX, e.clientY, Math.exp(-d));
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault()); // Safari: не масштабировать страницу щипком

// Спрайты объёмных шаров: рисуем один раз для каждого цвета в offscreen-canvas.
// Разрешение спрайта (spriteScale пикселей на единицу мира) подбирается под масштаб камеры ступенями по степеням двойки
const RGB = [[255, 64, 64], [61, 220, 107], [74, 144, 255]]; // красный, зелёный, синий
const mix = (c, t) => c.map(v => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t)); // t<0 темнее, t>0 светлее
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
let sprites = [], spriteScale = 0;
function buildSprites(scale) {
  spriteScale = scale;
  const R = world.c.R_MAX * scale, size = Math.ceil(R * 2 + 2); // спрайт максимального размера, при отрисовке масштабируется вниз
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

// Плитка мира для режима отдаления: мир рисуется в неё один раз за кадр, а экран заливается ею как узором
const tile = document.createElement('canvas'), tctx = tile.getContext('2d');
const TILES_DIRECT = 4; // пока на экране помещается не больше стольких копий мира, они рисуются напрямую (резко), иначе — через плитку

function draw() {
  const z = cam.z;
  const scale = Math.min(4, Math.max(1 / 8, 2 ** Math.ceil(Math.log2(z))));
  if (scale !== spriteScale) buildSprites(scale);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, VH);
  if (VW * VH <= TILES_DIRECT * W * z * H * z) {
    ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
    drawWorld(ctx, cam.x, cam.y, cam.x + VW / z, cam.y + VH / z);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    // стоимость кадра не зависит от числа видимых копий мира
    const T = Math.ceil(W * z), s = W * z / T;
    if (tile.width !== T) tile.width = tile.height = T;
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, T, T);
    tctx.setTransform(T / W, 0, 0, T / H, 0, 0);
    drawWorld(tctx, 0, 0, W, H);
    const pat = ctx.createPattern(tile, 'repeat');
    pat.setTransform(new DOMMatrix([s, 0, 0, s, -cam.x * z, -cam.y * z]));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, VW, VH);
  }
}

// Всё содержимое мира в контекст g (в координатах мира): каждая копия объекта на торе, попадающая в прямоугольник x0..x1 × y0..y1.
// Копии объекта в точке v с запасом m вдоль оси длиной L: v + k·L для k от ceil((a − m − v)/L) до floor((b + m − v)/L)
function drawWorld(g, x0, y0, x1, y1) {
  const full = sprites[0].width / spriteScale;
  for (const p of world.ps) {
    const img = sprites[p.t], size = full * p.r / world.c.R_MAX, half = size / 2;
    const ky1 = Math.floor((y1 + half - p.y) / H);
    for (let kx = Math.ceil((x0 - half - p.x) / W), kx1 = Math.floor((x1 + half - p.x) / W); kx <= kx1; kx++)
      for (let ky = Math.ceil((y0 - half - p.y) / H); ky <= ky1; ky++)
        g.drawImage(img, p.x + kx * W - half, p.y + ky * H - half, size, size);
  }
  drawPops(g, x0, y0, x1, y1);
  drawSparks(g, x0, y0, x1, y1);
}

// Лопнувший шарик: только клочья цвета шара — рваные треугольники, стартующие в случайных точках всей площади шара, чуть разлетаются, кувыркаются, мельчают
// и гаснут («испаряются»); разлёт небольшой и быстро замедляется
function drawPops(g, x0, y0, x1, y1) {
  for (const q of world.pops) {
    const u = q.age / SIM.POP_LIFE, e = 1 - (1 - u) * (1 - u), fade = 1 - u * u; // e — замедляющийся разлёт, fade — угасание
    const x = q.x + q.vx * q.age, y = q.y + q.vy * q.age;
    const shrink = 1 - u * 0.8, base = q.r * 0.22 + 2.5, travel = 6 + q.r * 0.35; // base — размер самого крупного клочка
    const m = q.r + travel * 1.5 + base; // дальше этого от центра клочья не улетают
    g.fillStyle = rgb(mix(RGB[q.t], 0.15)); g.globalAlpha = fade;
    const ky1 = Math.floor((y1 + m - y) / H);
    for (let kx = Math.ceil((x0 - m - x) / W), kx1 = Math.floor((x1 + m - x) / W); kx <= kx1; kx++)
      for (let ky = Math.ceil((y0 - m - y) / H); ky <= ky1; ky++) {
        const cx = x + kx * W, cy = y + ky * H;
        for (const [a, k, f, zz] of q.sh) {
          const size = base * zz * shrink, d = q.r * f + travel * k * e, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d, rot = a * 3 + q.age * 12 * (k - 1);
          g.beginPath();
          g.moveTo(px + Math.cos(rot) * size, py + Math.sin(rot) * size);
          g.lineTo(px + Math.cos(rot + 2.2) * size * 0.7, py + Math.sin(rot + 2.2) * size * 0.7);
          g.lineTo(px + Math.cos(rot + 4.1) * size * 0.5, py + Math.sin(rot + 4.1) * size * 0.5);
          g.closePath(); g.fill();
        }
      }
  }
  g.globalAlpha = 1;
}

// Искры: линии-штрихи вдоль скорости, аддитивное смешивание. Яркость квантуется на 6 уровней,
// чтобы рисовать каждый уровень одним путём (6 вызовов stroke на кадр, а не по одному на искру)
const SPARK_LEVELS = 6;
function drawSparks(g, x0, y0, x1, y1) {
  const sp = world.sp, paths = [], m = W / 100; // m — запас на длину штриха
  for (let l = 0; l < SPARK_LEVELS; l++) paths.push(new Path2D());
  let any = false;
  for (let o = 0; o < sp.length; o += 7) {
    const t = sp[o + 4]; if (t <= 0) continue;
    const l = Math.min(SPARK_LEVELS - 1, Math.floor(t * (0.3 + 0.7 * sp[o + 6]) * SPARK_LEVELS));
    const tx = sp[o + 2] * 0.03, ty = sp[o + 3] * 0.03;
    const ky1 = Math.floor((y1 + m - sp[o + 1]) / H);
    for (let kx = Math.ceil((x0 - m - sp[o]) / W), kx1 = Math.floor((x1 + m - sp[o]) / W); kx <= kx1; kx++)
      for (let ky = Math.ceil((y0 - m - sp[o + 1]) / H); ky <= ky1; ky++) {
        const x = sp[o] + kx * W, y = sp[o + 1] + ky * H;
        paths[l].moveTo(x, y); paths[l].lineTo(x - tx, y - ty);
        any = true;
      }
  }
  if (!any) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineWidth = 1.5; g.lineCap = 'round';
  for (let l = 0; l < SPARK_LEVELS; l++) {
    g.strokeStyle = `rgba(255,${200 + l * 9},${120 + l * 24},${(l + 1) / SPARK_LEVELS})`;
    g.stroke(paths[l]);
  }
  g.restore();
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
restart();
showCoefs();
requestAnimationFrame(frame);
