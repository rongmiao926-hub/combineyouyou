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
  const wrap = document.querySelector(".canvas-wrap");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const nextBall = document.getElementById("nextBall");
  const overlay = document.getElementById("overlay");
  const finalScoreEl = document.getElementById("finalScore");
  const restartBtn = document.getElementById("restart");
  const restartBtn2 = document.getElementById("restart2");
  const shareBtn = document.getElementById("shareBtn");
  const sharePreview = document.getElementById("sharePreview");
  const shareImage = document.getElementById("shareImage");
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
  const BEST_KEY = "youzi-best-score";
  const BASE_HEIGHT = 600;
  const BASE_GRAVITY = 1.35;
  const SCALE_EPSILON = 0.02;
  const SCALE_RESET_THRESHOLD = 0.1;
  const BUCKET_INSET_BASE = 42;
  const WALL_THICKNESS_BASE = 36;
  const DROP_GAP_BASE = 36;
  const DROP_PADDING_BASE = 8;
  const MIN_TOPLINE_BASE = 56;
  const OVERFLOW_GRACE = 900;

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
  let topLineY = 90;
  let currentX = width / 2;
  let currentIndex = randomStartIndex();
  let nextIndex = randomStartIndex();
  let score = 0;
  let bestScore = Number(localStorage.getItem(BEST_KEY)) || 0;
  let lastDropAt = 0;
  let dangerStart = null;
  let isGameOver = false;
  let isIntroOpen = Boolean(intro) && !intro.hasAttribute("hidden");
  let bounds = [];
  let leftWall = null;
  let rightWall = null;
  let worldScale = 1;
  let bucketInset = BUCKET_INSET_BASE;
  let wallThickness = WALL_THICKNESS_BASE;
  let dropGap = DROP_GAP_BASE;
  let dropPadding = DROP_PADDING_BASE;
  let minTopLine = MIN_TOPLINE_BASE;
  let fruitRadii = FRUITS.map((def) => def.baseRadius);
  let maxFruitRadius = Math.max(...fruitRadii);

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
    return fruitRadii[index] || Math.round(FRUITS[index].baseRadius * worldScale);
  }

  function updateNextMaxSize() {
    if (!nextBall) {
      return;
    }

    const size = Math.round(maxFruitRadius * 1.4);
    nextBall.style.setProperty("--next-max-size", `${size}px`);
  }

  function updateScale(hasFruits) {
    const nextScale = height / BASE_HEIGHT;
    if (!Number.isFinite(nextScale) || nextScale <= 0) {
      return false;
    }

    const delta = Math.abs(nextScale - worldScale);
    if (delta < SCALE_EPSILON) {
      return false;
    }

    if (hasFruits && delta < SCALE_RESET_THRESHOLD) {
      return false;
    }

    worldScale = nextScale;
    bucketInset = Math.max(16, Math.round(BUCKET_INSET_BASE * worldScale));
    wallThickness = Math.max(12, Math.round(WALL_THICKNESS_BASE * worldScale));
    dropGap = Math.max(16, Math.round(DROP_GAP_BASE * worldScale));
    dropPadding = Math.max(4, Math.round(DROP_PADDING_BASE * worldScale));
    minTopLine = Math.max(40, Math.round(MIN_TOPLINE_BASE * worldScale));
    fruitRadii = FRUITS.map((def) => Math.max(8, Math.round(def.baseRadius * worldScale)));
    maxFruitRadius = Math.max(...fruitRadii);
    world.gravity.y = BASE_GRAVITY * worldScale;
    updateNextMaxSize();

    return Boolean(hasFruits) && delta >= SCALE_RESET_THRESHOLD;
  }

  function getFloorY() {
    return height - bucketInset;
  }

  function getDropY(radius) {
    const floorY = getFloorY();
    const maxDrop = floorY - radius - dropPadding;
    return Math.min(topLineY + dropGap, maxDrop);
  }

  function getHorizontalBounds(radius) {
    const leftEdge = leftWall ? leftWall.bounds.max.x : bucketInset;
    const rightEdge = rightWall ? rightWall.bounds.min.x : width - bucketInset;
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

    const baseWidth = 900;
    const baseHeight = 1200;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const shareCanvas = document.createElement("canvas");
    shareCanvas.width = baseWidth * dpr;
    shareCanvas.height = baseHeight * dpr;

    const ctx = shareCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.scale(dpr, dpr);
    const gradient = ctx.createLinearGradient(0, 0, 0, baseHeight);
    gradient.addColorStop(0, "#fff1c1");
    gradient.addColorStop(1, "#e8ffd1");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, baseWidth, baseHeight);

    ctx.fillStyle = "#3b2f2f";
    ctx.font = "700 48px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillText("合成柚柚", 60, 90);
    ctx.font = "20px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillStyle = "rgba(59, 47, 47, 0.7)";
    ctx.fillText("柚柚AI出品", 60, 125);

    ctx.font = "600 32px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillStyle = "#f05a28";
    ctx.fillText(`得分 ${score}`, 60, 175);

    const cardX = 60;
    const cardY = 210;
    const cardW = baseWidth - 120;
    const cardH = cardW;
    roundRectPath(ctx, cardX, cardY, cardW, cardH, 26);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(244, 156, 72, 0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const innerPad = 20;
    const innerX = cardX + innerPad;
    const innerY = cardY + innerPad;
    const innerW = cardW - innerPad * 2;
    const innerH = cardH - innerPad * 2;

    ctx.save();
    roundRectPath(ctx, innerX, innerY, innerW, innerH, 20);
    ctx.clip();
    const src = render.canvas;
    const srcW = src.width || 1;
    const srcH = src.height || 1;
    const srcRatio = srcW / srcH;
    const dstRatio = innerW / innerH;
    let drawW = innerW;
    let drawH = innerH;
    if (srcRatio > dstRatio) {
      drawH = innerW / srcRatio;
    } else {
      drawW = innerH * srcRatio;
    }
    const drawX = innerX + (innerW - drawW) / 2;
    const drawY = innerY + (innerH - drawH) / 2;
    ctx.drawImage(src, drawX, drawY, drawW, drawH);
    ctx.restore();

    ctx.font = "18px \"PingFang SC\", \"PingFang TC\", sans-serif";
    ctx.fillStyle = "rgba(59, 47, 47, 0.6)";
    ctx.fillText("合成柚柚 · 长按保存分享", 60, baseHeight - 60);

    shareImage.src = shareCanvas.toDataURL("image/png");
    sharePreview.hidden = false;
  }

  function updateNextUI() {
    const def = FRUITS[nextIndex];
    const radius = getFruitRadius(nextIndex);
    const size = Math.round(radius * 1.4);
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
    overlay.hidden = true;
    resetSharePreview();
    score = 0;
    updateScore();
    dangerStart = null;

    Composite.allBodies(world).forEach((body) => {
      if (body.isFruit) {
        World.remove(world, body);
      }
    });

    currentIndex = randomStartIndex();
    nextIndex = randomStartIndex();
    updateNextUI();
  }

  function endGame() {
    if (isGameOver) {
      return;
    }

    isGameOver = true;
    overlay.hidden = false;
    resetSharePreview();
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
    const inset = bucketInset;
    const floorY = height - inset;
    const innerWidth = Math.max(1, width - inset * 2);
    const wallStyle = {
      fillStyle: "#ffe4b5",
      strokeStyle: "#f3b15f",
      lineWidth: 2,
    };
    const floor = Bodies.rectangle(
      width / 2,
      floorY + thickness / 2,
      innerWidth + thickness * 2,
      thickness,
      {
        isStatic: true,
        render: wallStyle,
      }
    );

    const left = Bodies.rectangle(
      inset / 2,
      height / 2,
      thickness,
      height * 2,
      {
        isStatic: true,
        render: wallStyle,
      }
    );

    const right = Bodies.rectangle(
      width - inset / 2,
      height / 2,
      thickness,
      height * 2,
      {
        isStatic: true,
        render: wallStyle,
      }
    );

    leftWall = left;
    rightWall = right;
    bounds = [floor, left, right];
    World.add(world, bounds);
  }

  function resize() {
    setAppHeight();
    const nextWidth = wrap.clientWidth;
    const nextHeight = wrap.clientHeight;
    if (nextWidth < 2 || nextHeight < 2) {
      requestAnimationFrame(resize);
      return;
    }
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);

    Render.setSize(render, width, height);
    Render.setPixelRatio(render, window.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

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
    topLineY = clamp(height * 0.14, minTopLine, Math.max(minTopLine, maxTopLine));
    const { minX, maxX } = getHorizontalBounds(getFruitRadius(currentIndex));
    currentX = clamp(currentX || width / 2, minX, maxX);
  }

  function pointerX(event) {
    const rect = canvas.getBoundingClientRect();
    return event.clientX - rect.left;
  }

  function handlePointerMove(event) {
    if (isGameOver || isIntroOpen) {
      return;
    }

    const radius = getFruitRadius(currentIndex);
    const { minX, maxX } = getHorizontalBounds(radius);
    currentX = clamp(pointerX(event), minX, maxX);
  }

  function handlePointerDown(event) {
    if (isGameOver || isIntroOpen) {
      return;
    }

    currentX = pointerX(event);
    dropCurrent();
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
    const leftEdge = leftWall ? leftWall.bounds.max.x : bucketInset;
    const rightEdge = rightWall ? rightWall.bounds.min.x : width - bucketInset;
    const floorY = getFloorY();
    const previewY = getDropY(radius);

    ctx.save();
    ctx.strokeStyle = "rgba(255, 128, 60, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(leftEdge, topLineY);
    ctx.lineTo(rightEdge, topLineY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(244, 156, 72, 0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftEdge, floorY);
    ctx.lineTo(rightEdge, floorY);
    ctx.moveTo(leftEdge, topLineY);
    ctx.lineTo(leftEdge, floorY);
    ctx.moveTo(rightEdge, topLineY);
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

  if (restartBtn) {
    restartBtn.addEventListener("click", resetGame);
  }
  if (restartBtn2) {
    restartBtn2.addEventListener("click", resetGame);
  }
  if (shareBtn) {
    shareBtn.addEventListener("click", generateShareImage);
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
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("keydown", handleKeyDown);

  resize();
  updateScore();
  updateNextUI();
})();
