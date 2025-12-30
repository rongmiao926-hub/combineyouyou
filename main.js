(() => {
  const {
    Engine,
    Render,
    Runner,
    World,
    Bodies,
    Body,
    Events,
    Composite,
  } = Matter;

  const canvas = document.getElementById("world");
  const wrap = document.querySelector(".game-viewport") || document.querySelector(".canvas-wrap");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const nextBall = document.getElementById("nextBall");
  const overlay = document.getElementById("overlay");
  const finalScoreEl = document.getElementById("finalScore");
  const restartBtn2 = document.getElementById("restart2");
  const shareBtn = document.getElementById("shareBtn");
  const sharePreview = document.getElementById("sharePreview");
  const shareImage = document.getElementById("shareImage");
  const shareClose = document.getElementById("shareClose");
  const adBlock = document.getElementById("adBlock");
  const adTimer = document.getElementById("adTimer");
  const adTimerArc = document.getElementById("adTimerArc");
  const intro = document.getElementById("intro");
  const introClose = document.getElementById("introClose");
  const introStart = document.getElementById("introStart");
  const root = document.documentElement;

  const FRUITS = [
    { baseRadius: 16, color: "#c9f27c", stroke: "#95c85b", score: 10 },
    { baseRadius: 22, color: "#e3f89e", stroke: "#b7cf5f", score: 20 },
    { baseRadius: 28, color: "#f9e97a", stroke: "#e0c34d", score: 30 },
    { baseRadius: 34, color: "#f7d861", stroke: "#f4b860", score: 40 },
    { baseRadius: 40, color: "#f7c35a", stroke: "#f29f52", score: 50 },
    { baseRadius: 48, color: "#f5b04c", stroke: "#f0893e", score: 60 },
    { baseRadius: 56, color: "#f5a05a", stroke: "#ec7d4f", score: 80 },
    { baseRadius: 64, color: "#f28f3b", stroke: "#e76f51", score: 110 },
    { baseRadius: 74, color: "#f77f00", stroke: "#e8590c", score: 140 },
    { baseRadius: 84, color: "#f77f36", stroke: "#e4552e", score: 180 },
    { baseRadius: 96, color: "#ff9f1c", stroke: "#f3722c", score: 230 },
  ];

  const START_MAX_INDEX = 3;
  const DROP_COOLDOWN = 260;
  const TAP_MOVE_THRESHOLD = 6;
  const TAP_TIME_MAX = 260;
  const BEST_KEY = "youzi-best-score";
  const AD_DURATION = 2;
  const AD_PENDING_KEY = "youyou-ad-pending";
  const AD_END_KEY = "youyou-ad-end";
  const BASE_HEIGHT = 400;
  const BASE_WIDTH = 400;
  const BUCKET_FIXED_HEIGHT = 350;
  const BUCKET_FIXED_WIDTH = 280;
  const BUCKET_OFFSET_Y = 20;
  const FRUIT_SCALE = 1.5;
  const NEXT_PREVIEW_MAX = 96;
  const BASE_GRAVITY = 1.35;
  const SCALE_EPSILON = 0.02;
  const SCALE_RESET_THRESHOLD = 0.1;
  const WALL_THICKNESS_RATIO = 0.05;
  const FLOOR_INSET_BASE = 34;
  const DROP_GAP_BASE = 36;
  const DROP_PADDING_BASE = 8;
  const MIN_TOPLINE_BASE = 56;
  const OVERFLOW_GRACE = 900;
  const MAX_FRUIT_BONUS = 600;

  const engine = Engine.create();
  const world = engine.world;
  world.gravity.y = BASE_GRAVITY;
  engine.positionIterations = 8;
  engine.velocityIterations = 6;

  const render = Render.create({
    canvas,
    engine,
    options: {
      width: 800,
      height: 600,
      wireframes: false,
      background: "transparent",
    },
  });

  Render.run(render);

  const runner = Runner.create();
  runner.isFixed = true;
  runner.delta = 1000 / 60;
  runner.deltaMin = 1000 / 60;
  runner.deltaMax = 1000 / 60;
  Runner.run(runner, engine);

  let width = 800;
  let height = 600;
  let topLineY = 0;
  let currentX = width / 2;
  let currentIndex = randomStartIndex();
  let nextIndex = randomStartIndex();
  let score = 0;
  let bestScore = Number(localStorage.getItem(BEST_KEY)) || 0;
  let lastDropAt = 0;
  let dangerStart = null;
  let isGameOver = false;
  let endReason = null;
  let isIntroOpen = Boolean(intro) && !intro.hasAttribute("hidden");
  let bounds = [];
  let leftWall = null;
  let rightWall = null;
  let worldScale = 1;
  let playLeft = 0;
  let playTop = 0;
  let playWidth = BUCKET_FIXED_WIDTH;
  let playHeight = BUCKET_FIXED_HEIGHT;
  let playSize = Math.min(BUCKET_FIXED_WIDTH, BUCKET_FIXED_HEIGHT);
  let bucketWidth = BUCKET_FIXED_WIDTH;
  let bucketInset = 0;
  let floorInset = FLOOR_INSET_BASE;
  let wallThickness = Math.round(BASE_WIDTH * WALL_THICKNESS_RATIO);
  let dropGap = DROP_GAP_BASE;
  let dropPadding = DROP_PADDING_BASE;
  let minTopLine = MIN_TOPLINE_BASE;
  let fruitRadii = FRUITS.map((def) => Math.round(def.baseRadius * FRUIT_SCALE));
  let maxFruitRadius = Math.max(...fruitRadii);
  let nextMaxSize = 64;
  let activePointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerStartAt = 0;
  let pointerMoved = false;
  let isAdPlaying = false;
  let adTimerId = null;
  let adEndsAt = 0;
  let adTimerCircumference = 0;

  function randomStartIndex() {
    return Math.floor(Math.random() * (START_MAX_INDEX + 1));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setAppHeight() {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    root.style.setProperty("--app-height", `${Math.round(height)}px`);
  }

  function getFruitRadius(index) {
    return (
      fruitRadii[index] ||
      Math.round(FRUITS[index].baseRadius * worldScale * FRUIT_SCALE)
    );
  }

  function updateNextMaxSize() {
    if (!nextBall) {
      return;
    }

    nextMaxSize = Math.min(Math.round(maxFruitRadius * 1.4), NEXT_PREVIEW_MAX);
    nextBall.style.setProperty("--next-max-size", `${nextMaxSize}px`);
  }

  function updateScale(hasFruits) {
    const widthScale = playWidth / BASE_WIDTH;
    const heightScale = playHeight / BASE_HEIGHT;
    const nextScale = Math.min(heightScale, widthScale);
    if (!Number.isFinite(nextScale) || nextScale <= 0) {
      return false;
    }

    const delta = Math.abs(nextScale - worldScale);
    const shouldUpdateWorld =
      delta >= SCALE_EPSILON && !(hasFruits && delta < SCALE_RESET_THRESHOLD);
    let needsReset = false;

    if (shouldUpdateWorld) {
      worldScale = nextScale;
      dropGap = Math.max(16, Math.round(DROP_GAP_BASE * worldScale));
      dropPadding = Math.max(4, Math.round(DROP_PADDING_BASE * worldScale));
      minTopLine = Math.max(40, Math.round(MIN_TOPLINE_BASE * worldScale));
      floorInset = Math.max(20, Math.round(FLOOR_INSET_BASE * worldScale));
      fruitRadii = FRUITS.map((def) =>
        Math.max(8, Math.round(def.baseRadius * worldScale * FRUIT_SCALE))
      );
      maxFruitRadius = Math.max(...fruitRadii);
      world.gravity.y = BASE_GRAVITY * worldScale;
      needsReset = Boolean(hasFruits) && delta >= SCALE_RESET_THRESHOLD;
    }

    wallThickness = Math.max(10, Math.round(playSize * WALL_THICKNESS_RATIO));
    bucketWidth = playWidth;
    bucketInset = 0;

    updateNextMaxSize();

    return needsReset;
  }

  function updatePlayArea() {
    playWidth = BUCKET_FIXED_WIDTH;
    playHeight = BUCKET_FIXED_HEIGHT;
    playLeft = Math.round((width - playWidth) / 2);
    playTop = 0;
    playSize = Math.max(1, Math.min(playWidth, playHeight));
  }

  function getFloorY() {
    return playTop + playHeight - floorInset;
  }

  function getDropY(radius) {
    const floorY = getFloorY();
    const maxDrop = floorY - radius - dropPadding;
    const topDrop = playTop + radius;
    return Math.min(topDrop, maxDrop);
  }

  function getHorizontalBounds(radius) {
    const leftEdge = leftWall ? leftWall.bounds.max.x : playLeft + bucketInset;
    const rightEdge = rightWall
      ? rightWall.bounds.min.x
      : playLeft + playWidth - bucketInset;
    return {
      minX: leftEdge + radius,
      maxX: rightEdge - radius,
    };
  }

  function updateScore() {
    scoreEl.textContent = score.toString();
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(BEST_KEY, bestScore.toString());
    }
    bestEl.textContent = bestScore.toString();
    finalScoreEl.textContent = score.toString();
  }

  function setAdControlsDisabled(disabled) {
    if (restartBtn2) {
      restartBtn2.disabled = disabled;
    }
  }

  function setRestartReady(ready) {
    if (!restartBtn2) {
      return;
    }
    restartBtn2.classList.toggle("ready", ready);
  }

  function clearAdTimer() {
    if (adTimerId) {
      window.clearInterval(adTimerId);
      adTimerId = null;
    }
  }

  function finishAd() {
    clearAdTimer();
    isAdPlaying = false;
    adEndsAt = 0;
    localStorage.removeItem(AD_PENDING_KEY);
    localStorage.removeItem(AD_END_KEY);
    setAdControlsDisabled(false);
    setRestartReady(true);
  }

  function updateAdCountdown() {
    if (!adTimer) {
      finishAd();
      return;
    }

    const remainingMs = adEndsAt - Date.now();
    const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
    adTimer.textContent = remaining.toString();
    if (adTimerArc) {
      const radius = adTimerArc.r?.baseVal?.value || 18;
      if (!adTimerCircumference) {
        adTimerCircumference = 2 * Math.PI * radius;
        adTimerArc.style.strokeDasharray = `${adTimerCircumference}`;
      }
      const progress = Math.max(0, Math.min(1, remainingMs / (AD_DURATION * 1000)));
      adTimerArc.style.strokeDashoffset = `${adTimerCircumference * (1 - progress)}`;
    }
    if (remaining <= 0) {
      finishAd();
    }
  }

  function startAdCountdown() {
    if (isAdPlaying) {
      return;
    }

    if (!localStorage.getItem(AD_PENDING_KEY)) {
      resetGame();
      return;
    }

    setRestartReady(false);
    if (endReason === "max") {
      resetGame();
      return;
    }

    if (!adBlock || !adTimer) {
      resetGame();
      return;
    }

    isAdPlaying = true;
    isGameOver = true;
    overlay.hidden = false;
    resetSharePreview();
    setAdControlsDisabled(true);
    adBlock.hidden = false;

    const now = Date.now();
    const storedEndsAt = Number(localStorage.getItem(AD_END_KEY)) || 0;
    adEndsAt = storedEndsAt > now ? storedEndsAt : now + AD_DURATION * 1000;
    localStorage.setItem(AD_PENDING_KEY, "1");
    localStorage.setItem(AD_END_KEY, adEndsAt.toString());

    clearAdTimer();
    updateAdCountdown();
    adTimerId = window.setInterval(updateAdCountdown, 200);
  }

  function resetSharePreview() {
    if (!sharePreview || !shareImage) {
      return;
    }

    sharePreview.hidden = true;
    shareImage.removeAttribute("src");
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function generateShareImage() {
    if (!sharePreview || !shareImage) {
      return;
    }

    const baseWidth = 1365;
    const baseHeight = 1820;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const shareCanvas = document.createElement("canvas");
    shareCanvas.width = baseWidth * dpr;
    shareCanvas.height = baseHeight * dpr;

    const ctx = shareCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.scale(dpr, dpr);
    const gradient = ctx.createLinearGradient(0, 0, baseWidth, baseHeight);
    gradient.addColorStop(0, "#fffdef");
    gradient.addColorStop(1, "#f7e8ec");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, baseWidth, baseHeight);

    const scoreText = score.toString();
    const topLineScore = "4000";
    const textYOffset = 24;
    const topLineGap = 24;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#000";

    let x = 67;
    const topY = 109 + textYOffset;
    const topLinePrefix = "没人能超过";
    ctx.font = "700 110px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillText(topLinePrefix, x, topY);
    x += ctx.measureText(topLinePrefix).width + topLineGap;
    ctx.font = "700 180px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillText(topLineScore, x, topY);
    x += ctx.measureText(topLineScore).width + topLineGap;
    ctx.font = "700 110px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillText("分！", x, topY);

    const line2Top = 410 + textYOffset;
    ctx.font = "400 96px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillText("我在", 65, line2Top);

    const pillX = 263;
    const pillY = line2Top;
    const pillW = 656;
    const pillH = 155;
    const pillR = 86;
    ctx.fillStyle = "#ffe58f";
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillR);
    ctx.fill();

    const titleText = "碰碰大柚子";
    ctx.fillStyle = "#000";
    ctx.font = "700 120px \"PingFang SC\", \"PingFang TC\", sans-serif";
    const titleWidth = ctx.measureText(titleText).width;
    const titleX = pillX + (pillW - titleWidth) / 2;
    const titleY = pillY + (pillH - 120) / 2 - 6;
    ctx.fillText(titleText, titleX, titleY);

    ctx.font = "400 96px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillText("里狂砍", pillX + pillW + 20, line2Top);

    ctx.save();
    ctx.translate(baseWidth / 2, 880);
    ctx.rotate((-6 * Math.PI) / 180);
    ctx.textBaseline = "middle";
    ctx.font = "700 350px \"PingFang SC\", \"PingFang TC\", sans-serif";
    const bigWidth = ctx.measureText(scoreText).width;
    const bigGradient = ctx.createLinearGradient(-bigWidth / 2, 0, bigWidth / 2, 0);
    bigGradient.addColorStop(0, "#ff62df");
    bigGradient.addColorStop(1, "#ffb63c");
    ctx.fillStyle = bigGradient;
    ctx.fillText(scoreText, -bigWidth / 2, 0);
    ctx.restore();

    ctx.textBaseline = "top";
    ctx.fillStyle = "#000";
    ctx.font = "700 240px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillText("分", 958, 1028);

    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(67, 1380, 280, 280);

    ctx.fillStyle = "#454545";
    ctx.font = "400 50px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillText("扫我一决高下", 382, 1611);

    shareImage.src = shareCanvas.toDataURL("image/png");
    sharePreview.hidden = false;
  }

  function updateNextUI() {
    const def = FRUITS[nextIndex];
    const radius = getFruitRadius(nextIndex);
    const size = Math.min(Math.round(radius * 1.4), nextMaxSize);
    if (!nextBall) {
      return;
    }

    nextBall.style.setProperty("--next-size", `${size}px`);
    nextBall.style.setProperty("--next-color", def.color);
    nextBall.style.setProperty("--next-stroke", def.stroke);
  }

  function createFruit(index, x, y) {
    const def = FRUITS[index];
    const radius = getFruitRadius(index);
    const body = Bodies.circle(x, y, radius, {
      restitution: 0.1,
      friction: 0.2,
      frictionAir: 0.006,
      render: {
        fillStyle: def.color,
        strokeStyle: def.stroke,
        lineWidth: 2,
      },
    });

    body.fruitIndex = index;
    body.isFruit = true;

    return body;
  }

  function dropCurrent() {
    if (isGameOver || isIntroOpen) {
      return;
    }

    const now = performance.now();
    if (now - lastDropAt < DROP_COOLDOWN) {
      return;
    }

    const def = FRUITS[currentIndex];
    const radius = getFruitRadius(currentIndex);
    const { minX, maxX } = getHorizontalBounds(radius);
    currentX = clamp(currentX, minX, maxX);

    const body = createFruit(currentIndex, currentX, getDropY(radius));
    World.add(world, body);

    currentIndex = nextIndex;
    nextIndex = randomStartIndex();
    updateNextUI();
    lastDropAt = now;
  }

  function resetGame() {
    isGameOver = false;
    endReason = null;
    overlay.hidden = true;
    resetSharePreview();
    if (adBlock) {
      adBlock.hidden = true;
    }
    setAdControlsDisabled(false);
    setRestartReady(false);
    score = 0;
    updateScore();
    dangerStart = null;
    lastDropAt = 0;

    Composite.allBodies(world).forEach((body) => {
      if (body.isFruit) {
        World.remove(world, body);
      }
    });

    currentIndex = randomStartIndex();
    nextIndex = randomStartIndex();
    updateNextUI();
    const { minX, maxX } = getHorizontalBounds(getFruitRadius(currentIndex));
    currentX = clamp(playLeft + playWidth / 2, minX, maxX);
  }

  function endGame(reason = "overflow") {
    if (isGameOver) {
      return;
    }

    isGameOver = true;
    endReason = reason;
    overlay.hidden = false;
    resetSharePreview();
    setRestartReady(false);
    if (reason === "overflow") {
      localStorage.setItem(AD_PENDING_KEY, "1");
      localStorage.removeItem(AD_END_KEY);
      startAdCountdown();
    } else {
      localStorage.removeItem(AD_PENDING_KEY);
      localStorage.removeItem(AD_END_KEY);
      if (adBlock) {
        adBlock.hidden = true;
      }
      setAdControlsDisabled(false);
    }
  }

  function closeIntro() {
    if (!intro) {
      isIntroOpen = false;
      return;
    }

    intro.hidden = true;
    isIntroOpen = false;
  }

  function updateBounds() {
    if (bounds.length) {
      bounds.forEach((body) => World.remove(world, body));
    }

    const thickness = wallThickness;
    const floorY = getFloorY();
    const innerWidth = Math.max(1, bucketWidth);
    const centerX = playLeft + playWidth / 2;
    const centerY = playTop + playHeight / 2;
    const wallOffset = (innerWidth + thickness) / 2;
    const leftX = centerX - wallOffset;
    const rightX = centerX + wallOffset;
    const wallStyle = {
      fillStyle: "rgba(0, 0, 0, 0)",
      strokeStyle: "rgba(0, 0, 0, 0)",
      lineWidth: 0,
    };
    const floor = Bodies.rectangle(
      centerX,
      floorY + thickness / 2,
      innerWidth + thickness * 2,
      thickness,
      {
        isStatic: true,
        render: wallStyle,
      }
    );

    const left = Bodies.rectangle(leftX, centerY, thickness, playHeight * 2, {
      isStatic: true,
      render: wallStyle,
    });

    const right = Bodies.rectangle(rightX, centerY, thickness, playHeight * 2, {
      isStatic: true,
      render: wallStyle,
    });

    leftWall = left;
    rightWall = right;
    bounds = [floor, left, right];
    World.add(world, bounds);
  }

  function resize() {
    setAppHeight();
    const rect = wrap.getBoundingClientRect();
    const nextWidth = rect.width;
    const nextHeight = rect.height;
    if (nextWidth < 2 || nextHeight < 2) {
      requestAnimationFrame(resize);
      return;
    }
    width = Math.max(1, Math.round(nextWidth));
    height = Math.max(1, Math.round(nextHeight));

    render.options.width = width;
    render.options.height = height;
    Render.setPixelRatio(render, window.devicePixelRatio || 1);
    if (render.bounds) {
      render.bounds.max.x = width;
      render.bounds.max.y = height;
    }
    updatePlayArea();
    const hasFruits = Composite.allBodies(world).some((body) => body.isFruit);
    const needsReset = updateScale(hasFruits);
    updateNextMaxSize();
    updateBounds();
    if (needsReset && Composite.allBodies(world).some((body) => body.isFruit)) {
      resetGame();
    }

    const floorY = getFloorY();
    const maxStartRadius = getFruitRadius(START_MAX_INDEX);
    const maxTopLine = floorY - maxStartRadius - dropGap - dropPadding;
    const targetTopLine = playTop + playHeight * 0.14;
    topLineY = playTop;
    const { minX, maxX } = getHorizontalBounds(getFruitRadius(currentIndex));
    const defaultX = playLeft + playWidth / 2;
    if (!hasFruits && lastDropAt === 0 && activePointerId === null) {
      currentX = defaultX;
    }
    const safeX = Number.isFinite(currentX) ? currentX : defaultX;
    currentX = clamp(safeX, minX, maxX);
  }

  function pointerX(event) {
    const rect = canvas.getBoundingClientRect();
    return event.clientX - rect.left;
  }

  function pointerY(event) {
    const rect = canvas.getBoundingClientRect();
    return event.clientY - rect.top;
  }

  function handlePointerMove(event) {
    if (isGameOver || isIntroOpen) {
      return;
    }

    if (event.pointerType === "touch" && activePointerId === null) {
      return;
    }

    if (activePointerId !== null && event.pointerId !== activePointerId) {
      return;
    }

    const radius = getFruitRadius(currentIndex);
    const { minX, maxX } = getHorizontalBounds(radius);
    const nextX = pointerX(event);
    if (activePointerId !== null) {
      const dx = nextX - pointerStartX;
      const dy = pointerY(event) - pointerStartY;
      if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        pointerMoved = true;
      }
    }
    currentX = clamp(nextX, minX, maxX);
  }

  function handlePointerDown(event) {
    if (isGameOver || isIntroOpen) {
      return;
    }

    activePointerId = event.pointerId;
    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(activePointerId);
    }
    pointerStartX = pointerX(event);
    pointerStartY = pointerY(event);
    pointerStartAt = performance.now();
    pointerMoved = false;
    currentX = pointerStartX;
  }

  function handlePointerUp(event) {
    if (isGameOver || isIntroOpen) {
      return;
    }

    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    if (canvas.releasePointerCapture) {
      canvas.releasePointerCapture(activePointerId);
    }

    const endX = pointerX(event);
    const endY = pointerY(event);
    const dx = endX - pointerStartX;
    const dy = endY - pointerStartY;
    if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
      pointerMoved = true;
    }
    const elapsed = performance.now() - pointerStartAt;
    const shouldDrop =
      event.pointerType !== "touch" || (!pointerMoved && elapsed < TAP_TIME_MAX);
    activePointerId = null;
    currentX = endX;
    if (shouldDrop) {
      dropCurrent();
    }
  }

  function handlePointerCancel(event) {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    if (canvas.releasePointerCapture) {
      canvas.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
    pointerMoved = false;
  }

  function handleKeyDown(event) {
    if (isGameOver || isIntroOpen) {
      return;
    }

    const radius = getFruitRadius(currentIndex);
    const { minX, maxX } = getHorizontalBounds(radius);
    const step = 26;
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
      currentX = clamp(currentX - step, minX, maxX);
    }

    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
      currentX = clamp(currentX + step, minX, maxX);
    }

    if (event.code === "Space") {
      event.preventDefault();
      dropCurrent();
    }
  }

  Events.on(render, "afterRender", () => {
    const ctx = render.context;
    const def = FRUITS[currentIndex];
    const radius = getFruitRadius(currentIndex);
    const leftEdge = leftWall ? leftWall.bounds.max.x : playLeft + bucketInset;
    const rightEdge = rightWall
      ? rightWall.bounds.min.x
      : playLeft + playWidth - bucketInset;
    const floorY = getFloorY();
    const bucketTopY = playTop;
    const previewY = getDropY(radius);
    const lineColor = "rgba(90, 90, 90, 0.85)";

    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(leftEdge, bucketTopY);
    ctx.lineTo(rightEdge, bucketTopY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(leftEdge, floorY);
    ctx.lineTo(rightEdge, floorY);
    ctx.moveTo(leftEdge, bucketTopY);
    ctx.lineTo(leftEdge, floorY);
    ctx.moveTo(rightEdge, bucketTopY);
    ctx.lineTo(rightEdge, floorY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = def.stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(currentX, previewY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  });

  Events.on(engine, "collisionStart", (event) => {
    event.pairs.forEach((pair) => {
      if (isGameOver) {
        return;
      }

      const { bodyA, bodyB } = pair;

      if (!bodyA.isFruit || !bodyB.isFruit) {
        return;
      }

      if (bodyA.isMerging || bodyB.isMerging) {
        return;
      }

      if (bodyA.fruitIndex !== bodyB.fruitIndex) {
        return;
      }

      const next = bodyA.fruitIndex + 1;
      if (next >= FRUITS.length) {
        return;
      }

      bodyA.isMerging = true;
      bodyB.isMerging = true;

      const newX = (bodyA.position.x + bodyB.position.x) / 2;
      const newY = (bodyA.position.y + bodyB.position.y) / 2;

      World.remove(world, bodyA);
      World.remove(world, bodyB);

      const merged = createFruit(next, newX, newY);
      World.add(world, merged);

      score += FRUITS[next].score;
      if (next === FRUITS.length - 1) {
        score += MAX_FRUIT_BONUS;
        updateScore();
        endGame("max");
        return;
      }
      updateScore();
    });
  });

  Events.on(engine, "afterUpdate", () => {
    if (isGameOver) {
      return;
    }

    const floorY = getFloorY();
    const bodies = Composite.allBodies(world);
    bodies.forEach((body) => {
      if (!body.isFruit || !body.circleRadius) {
        return;
      }

      const radius = body.circleRadius;
      const { minX, maxX } = getHorizontalBounds(radius);
      const maxY = floorY - radius;
      let nextX = body.position.x;
      let nextY = body.position.y;
      let nextVx = body.velocity.x;
      let nextVy = body.velocity.y;
      let moved = false;

      if (nextY > maxY) {
        nextY = maxY;
        if (nextVy > 0) {
          nextVy = 0;
        }
        moved = true;
      }

      if (nextX < minX) {
        nextX = minX;
        if (nextVx < 0) {
          nextVx = 0;
        }
        moved = true;
      } else if (nextX > maxX) {
        nextX = maxX;
        if (nextVx > 0) {
          nextVx = 0;
        }
        moved = true;
      }

      if (moved) {
        Body.setPosition(body, { x: nextX, y: nextY });
        Body.setVelocity(body, { x: nextVx, y: nextVy });
      }
    });

    const now = engine.timing.timestamp;
    const isOverflowing = bodies.some((body) => {
      return body.isFruit && body.position.y - body.circleRadius < topLineY;
    });

    if (isOverflowing) {
      if (dangerStart === null) {
        dangerStart = now;
      } else if (now - dangerStart > OVERFLOW_GRACE) {
        endGame();
      }
    } else {
      dangerStart = null;
    }
  });

  if (restartBtn2) {
    restartBtn2.addEventListener("click", startAdCountdown);
  }
  if (shareBtn) {
    shareBtn.addEventListener("click", generateShareImage);
  }
  if (shareClose) {
    shareClose.addEventListener("click", resetSharePreview);
  }
  if (sharePreview) {
    sharePreview.addEventListener("click", (event) => {
      if (event.target === sharePreview) {
        resetSharePreview();
      }
    });
  }
  if (introClose) {
    introClose.addEventListener("click", closeIntro);
  }
  if (introStart) {
    introStart.addEventListener("click", () => {
      closeIntro();
      resetGame();
    });
  }
  window.addEventListener("resize", resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
    window.visualViewport.addEventListener("scroll", resize);
  }
  if (window.ResizeObserver && wrap) {
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(wrap);
  }
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  window.addEventListener("keydown", handleKeyDown);

  resize();
  updateScore();
  updateNextUI();
  if (localStorage.getItem(AD_PENDING_KEY)) {
    if (intro && !intro.hasAttribute("hidden")) {
      intro.hidden = true;
    }
    isIntroOpen = false;
    startAdCountdown();
  }
})();
