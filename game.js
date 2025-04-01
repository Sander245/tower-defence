/*****************************
  GLOBAL VARIABLES & SETUP
*****************************/
const canvas = document.getElementById("gameCanvas"),
      ctx = canvas.getContext("2d"),
      WIDTH = canvas.width,
      HEIGHT = canvas.height,
      gameContainer = document.getElementById("gameContainer");

// Our castle object and the image for it.
const castle = { x: 20, y: 240, width: 80, height: 80 };
const castleImage = new Image();
castleImage.src = "https://raw.githubusercontent.com/Sander245/tower-defence/main/low-taper-fade.png";

// This will hold our explosion effect when the castle is destroyed.
let castleExplosion = null;

let towers = [],
    enemies = [],
    projectiles = [],
    pulses = [];

let currentRound = 0,
    inRound = false,
    enemySpawnTimer = 0,
    enemiesToSpawn = 0,
    playerHealth = 10,
    currency = 150,
    placingTowerType = null,
    previewPos = null,
    selectedTower = null,
    frameCount = 0,
    gameSpeed = 1, // 1x or 2x
    autoStart = false,
    gameOver = false;

let titleScreen, creditsScreen, gameOverScreen;

const towerCosts = {
  "basic": 50,
  "sniper": 75,
  "splash": 100,
  "slow": 80,
  "smart": 120
};

const toolbarContent = document.getElementById("toolbar-content"),
      startRoundButton = document.getElementById("startRoundButton");

const PATH = [
  { x: 50, y: 50 },
  { x: 750, y: 50 },
  { x: 750, y: 550 },
  { x: 50, y: 550 },
  { x: 50, y: 300 }
];

/*****************************
         CLASSES
*****************************/
// Enemy: basic, fast, tank, regenerator, boss.
class Enemy {
  constructor(type) {
    this.path = [...PATH];
    this.pos = { ...this.path[0] };
    this.targetIndex = 1;
    this.type = type;
    
    if (type === "basic") {
      this.speed = 0.6;
      this.maxHealth = 90;
      this.radius = 10;
      this.color = "red";
      this.coinReward = Math.floor(10 * 0.5); // half reward
    } else if (type === "fast") {
      this.speed = 1.4;
      this.maxHealth = 70;
      this.radius = 8;
      this.color = "orange";
      this.coinReward = Math.floor(15 * 0.5);
    } else if (type === "tank") {
      this.speed = 0.5;
      this.maxHealth = 200;
      this.radius = 12;
      this.color = "brown";
      this.coinReward = Math.floor(20 * 0.5);
    } else if (type === "regenerator") {
      this.speed = 0.6;
      this.maxHealth = 150;
      this.radius = 10;
      this.color = "teal";
      this.coinReward = Math.floor(25 * 0.5);
      this.attackCooldown = 180;
      this.lastAttack = -180;
    } else if (type === "boss") {
      // Boss enemy: big, slow, and very durable.
      this.speed = 0.3;
      this.maxHealth = 1000;
      this.radius = 30;
      this.color = "black";
      this.coinReward = Math.floor(100 * 0.5);
    }
    
    // Scale enemy health based on round (5% increase per round past the first)
    let scale = 1 + (currentRound - 1) * 0.05;
    if (scale < 1) scale = 1;
    this.maxHealth = Math.floor(this.maxHealth * scale);
    this.health = this.maxHealth;
    
    this.baseSpeed = this.speed;
    this.slowTimer = 0;
  }
  
  update() {
    // Regenerator enemy heals over time and may slow towers.
    if (this.type === "regenerator") {
      this.health = Math.min(this.health + 0.2, this.maxHealth);
      if (frameCount - this.lastAttack >= this.attackCooldown) {
        let nearestTower = null, minDist = Infinity;
        for (let tower of towers) {
          let d = Math.hypot(tower.pos.x - this.pos.x, tower.pos.y - this.pos.y);
          if (d < 150 && d < minDist) { nearestTower = tower; minDist = d; }
        }
        if (nearestTower) { nearestTower.attackSlowTimer = 90; this.lastAttack = frameCount; }
      }
    }
    let effectiveSpeed = this.baseSpeed;
    if (this.slowTimer > 0) { effectiveSpeed *= 0.5; this.slowTimer--; }
    
    if (this.targetIndex < this.path.length) {
      let target = this.path[this.targetIndex],
          dx = target.x - this.pos.x,
          dy = target.y - this.pos.y,
          dist = Math.hypot(dx, dy);
      if (dist !== 0) {
        this.pos.x += (dx / dist) * effectiveSpeed;
        this.pos.y += (dy / dist) * effectiveSpeed;
      }
      if (dist < effectiveSpeed) this.targetIndex++;
    }
  }
  
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    // Draw health bar
    let barW = 20, barH = 4, ratio = this.health / this.maxHealth;
    ctx.fillStyle = "black";
    ctx.fillRect(this.pos.x - barW / 2, this.pos.y - this.radius - 10, barW, barH);
    ctx.fillStyle = "green";
    ctx.fillRect(this.pos.x - barW / 2, this.pos.y - this.radius - 10, barW * ratio, barH);
  }
}

// Tower: basic, sniper, splash (pulse), slow, smart.
class Tower {
  constructor(pos, type) {
    this.pos = { ...pos };
    this.type = type;
    this.level = 1;
    this.timer = 0;
    this.maxUpgrades = 3;
    this.specialAbilityUnlocked = false;
    this.attackSlowTimer = 0;
    
    if (type === "basic") {
      this.range = 100; this.damage = 20; this.cooldown = 60; this.color = "blue";
    } else if (type === "sniper") {
      this.range = 150; this.damage = 40; this.cooldown = 120; this.color = "purple";
    } else if (type === "splash") {
      // Pulse tower – cooldown increased to ~1.3 seconds (78 frames at 60 FPS)
      this.range = 120; this.damage = 25; this.cooldown = 78; this.color = "green";
    } else if (type === "slow") {
      this.range = 80; this.damage = 10; this.cooldown = 50; this.color = "cyan";
    } else if (type === "smart") {
      this.range = 180; this.damage = 15; this.cooldown = 40; this.color = "gold";
    }
    this.radius = 15;
  }
  
  update() {
    if (this.timer > 0) this.timer--;
    if (this.attackSlowTimer > 0) { this.attackSlowTimer--; return; }
    
    let target = null, minDist = Infinity;
    for (let enemy of enemies) {
      let d = Math.hypot(enemy.pos.x - this.pos.x, enemy.pos.y - this.pos.y);
      if (d <= this.range && d < minDist) { minDist = d; target = enemy; }
    }
    
    if (target && this.timer <= 0) {
      if (this.type === "splash") {
        pulses.push(new Pulse(this.pos, this.range, this.damage, 30));
      } else if (this.type === "smart") {
        const speed = 8,
              dx = target.pos.x - this.pos.x,
              dy = target.pos.y - this.pos.y,
              distance = Math.hypot(dx, dy),
              t = distance / speed,
              wp = target.path[target.targetIndex] || target.pos,
              dx_e = wp.x - target.pos.x,
              dy_e = wp.y - target.pos.y,
              dEnemy = Math.hypot(dx_e, dy_e) || 1,
              predictedPos = {
                x: target.pos.x + (dx_e / dEnemy) * t,
                y: target.pos.y + (dy_e / dEnemy) * t
              };
        projectiles.push(new Projectile(this.pos, target, this.damage, speed, "smart", predictedPos));
      } else if (this.type === "slow") {
        projectiles.push(new Projectile(this.pos, target, this.damage, 5, "slow"));
      } else {
        const bulletSpeed = (this.type === "sniper") ? 8 : 5;
        projectiles.push(new Projectile(this.pos, target, this.damage, bulletSpeed));
      }
      this.timer = this.cooldown;
    }
  }
  
  draw(sel = false) {
    ctx.fillStyle = sel ? "grey" : this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    if (sel) {
      ctx.strokeStyle = "grey";
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.level, this.pos.x, this.pos.y);
  }
  
  upgrade(stat) {
    if (this.level < this.maxUpgrades) {
      if (stat === "damage") this.damage += Math.floor(this.damage * 0.5);
      else if (stat === "range") this.range += 10;
      else if (stat === "cooldown") this.cooldown = Math.max(20, this.cooldown - 10);
      this.level++;
    } else if (!this.specialAbilityUnlocked) {
      this.specialAbilityUnlocked = true;
      this.damage += 50; this.range += 50;
      this.cooldown = Math.max(10, this.cooldown - 15);
    }
    updateToolbar();
  }
}

// Projectile class; smart projectiles may use predictedPos.
class Projectile {
  constructor(startPos, target, damage, speed, projType = "normal", predictedPos = null) {
    this.pos = { ...startPos };
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.projType = projType;
    const aimPos = (projType === "smart" && predictedPos) ? predictedPos : target.pos,
          dx = aimPos.x - startPos.x,
          dy = aimPos.y - startPos.y,
          dist = Math.hypot(dx, dy);
    this.dx = dist ? dx / dist : 0;
    this.dy = dist ? dy / dist : 0;
    this.radius = 5;
    this.active = true;
  }
  
  update() {
    this.pos.x += this.dx * this.speed;
    this.pos.y += this.dy * this.speed;
    if (Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.y - this.pos.y) <
        this.radius + this.target.radius) {
      this.target.health -= this.damage;
      this.active = false;
    }
  }
  
  draw() {
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Pulse class for the splash tower.
// Uses an ease‑out cubic function.
class Pulse {
  constructor(center, maxRadius, damage, duration = 30) {
    this.center = { ...center };
    this.maxRadius = maxRadius;
    this.damage = damage;
    this.duration = duration;
    this.frame = 0;
    this.hitEnemies = new Set();
  }
  
  update() {
    this.frame++;
    let t = this.frame / this.duration;
    let easeOut = 1 - Math.pow(1 - t, 3);
    this.currentRadius = easeOut * this.maxRadius;
    const tol = 5;
    for (let enemy of enemies) {
      let d = Math.hypot(enemy.pos.x - this.center.x, enemy.pos.y - this.center.y);
      if (d >= this.currentRadius - tol && d <= this.currentRadius + tol &&
          !this.hitEnemies.has(enemy)) {
        enemy.health -= this.damage;
        this.hitEnemies.add(enemy);
      }
    }
  }
  
  draw() {
    const alpha = 1 - (this.frame / this.duration);
    ctx.strokeStyle = `rgba(0,128,0,${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this.currentRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  isDone() { return this.frame >= this.duration; }
}

/*********************** NEW: Castle Explosion CLASS ***********************/
class CastleExplosion {
  constructor(cx, cy, maxRadius, duration) {
    this.cx = cx;
    this.cy = cy;
    this.maxRadius = maxRadius;
    this.duration = duration; // in frames
    this.frame = 0;
    this.currentRadius = 0;
  }
  update() {
    this.frame++;
    let t = this.frame / this.duration;
    // Using a linear expansion (you could use an easing function if desired)
    this.currentRadius = t * this.maxRadius;
    // Kill any enemy whose center is within the explosion.
    enemies.forEach(enemy => {
      let d = Math.hypot(enemy.pos.x - this.cx, enemy.pos.y - this.cy);
      if(d < this.currentRadius) {
        enemy.health = 0; // Instant kill (and no coins will be awarded).
      }
    });
    // Remove towers that are caught in the explosion.
    towers = towers.filter(tower => {
      let d = Math.hypot(tower.pos.x - this.cx, tower.pos.y - this.cy);
      if(d < this.currentRadius) {
        // Optionally, here you could trigger a mini shockwave effect.
        return false; // Delete tower
      }
      return true;
    });
  }
  draw() {
    let alpha = 1 - (this.frame / this.duration);
    ctx.fillStyle = "rgba(255, 100, 0," + alpha + ")";
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.currentRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  isDone() {
    return this.frame >= this.duration;
  }
}

/*****************************
      WAVE & ENEMY SPAWNER
*****************************/
function startRound() {
  currentRound++;
  inRound = true;
  enemiesToSpawn = 3 + currentRound;
  enemySpawnTimer = 0;
  
  // On wave 7, spawn a boss enemy.
  if (currentRound === 7) {
    enemies.push(new Enemy("boss"));
  }
  
  updateToolbar();
}

function randomEnemyType() {
  let roll = Math.random();
  if (currentRound < 3) { 
    return (roll < 0.8) ? "basic" : "fast"; 
  } else if (currentRound < 5) {
    if (roll < 0.6) return "basic";
    else if (roll < 0.9) return "fast";
    else return "tank";
  } else {
    if (roll < 0.5) return "basic";
    else if (roll < 0.7) return "fast";
    else if (roll < 0.9) return "tank";
    else return "regenerator";
  }
}

/*****************************
      TOOLBAR (UI) FUNCTIONS
*****************************/
function updateToolbar() {
  let html = `<div class="toolbar-header">
                  <h3>${selectedTower ? "Defender Options" : "Defender Shop"}</h3>
                  <div><strong>Currency:</strong> $${currency}</div>
              </div>`;
  if (selectedTower) {
    html += `<div><strong>Type:</strong> ${selectedTower.type}</div>
             <div><strong>Level:</strong> ${selectedTower.level}</div>
             <div><strong>Damage:</strong> ${selectedTower.damage}</div>
             <div><strong>Range:</strong> ${selectedTower.range}</div>
             <div><strong>Cooldown:</strong> ${selectedTower.cooldown}</div>
             ${
               selectedTower.level < selectedTower.maxUpgrades
               ? `<button id="upgradeDamage">Upgrade Damage ($40)</button>
                  <button id="upgradeRange">Upgrade Range ($40)</button>
                  <button id="upgradeCooldown">Upgrade Cooldown ($40)</button>`
               : !selectedTower.specialAbilityUnlocked
               ? `<button id="finalUpgrade">Final Upgrade ($60)</button>`
               : `<div>Max Upgrades Achieved</div>`
             }
             <button id="deleteButton">Delete (Refund 75%)</button>
             <button id="cancelSelectionButton">Cancel</button>`;
  } else {
    html += `<button class="shop-item" data-type="basic">Basic Defender ($50)</button>`;
    // Tower unlock conditions adjusted to unlock one round early:
    if (currentRound >= 3) {
      html += `<button class="shop-item" data-type="sniper">Sniper Defender ($75)</button>`;
    }
    if (currentRound >= 7) {
      html += `<button class="shop-item" data-type="slow">Slow Defender ($80)</button>`;
    }
    if (currentRound >= 13) {
      html += `<button class="shop-item" data-type="smart">Smart Defender ($120)</button>`;
    }
    if (currentRound >= 17) {
      html += `<button class="shop-item" data-type="splash">Splash Defender ($100)</button>`;
    }
  }
  
  // Global controls: Auto‑Start checkbox and Speed Toggle button.
  html += `<div class="global-controls" style="margin-top: 10px; text-align: center;">
             <label><input type="checkbox" id="autoStartCheckbox" ${autoStart ? "checked" : ""}> Auto-Start Rounds</label>
             <br>
             <button id="speedToggleButton" style="margin-top: 5px;">${gameSpeed === 1 ? "2x Speed" : "1x Speed"}</button>
           </div>`;
  
  toolbarContent.innerHTML = html;
  
  if (selectedTower) {
    if (selectedTower.level < selectedTower.maxUpgrades) {
      document.getElementById("upgradeDamage").addEventListener("click", () => { attemptUpgrade(selectedTower, "damage"); });
      document.getElementById("upgradeRange").addEventListener("click", () => { attemptUpgrade(selectedTower, "range"); });
      document.getElementById("upgradeCooldown").addEventListener("click", () => { attemptUpgrade(selectedTower, "cooldown"); });
    } else if (!selectedTower.specialAbilityUnlocked) {
      document.getElementById("finalUpgrade").addEventListener("click", () => { attemptUpgrade(selectedTower, "final"); });
    }
    document.getElementById("deleteButton").addEventListener("click", () => {
      currency += Math.floor(towerCosts[selectedTower.type] * 0.75);
      towers = towers.filter(t => t !== selectedTower);
      selectedTower = null;
      updateToolbar();
    });
    document.getElementById("cancelSelectionButton").addEventListener("click", () => { selectedTower = null; updateToolbar(); });
  } else {
    document.querySelectorAll(".shop-item").forEach(item => {
      item.addEventListener("click", () => { placingTowerType = item.getAttribute("data-type"); });
    });
  }
  
  let autoCheckbox = document.getElementById("autoStartCheckbox");
  if (autoCheckbox) {
    autoCheckbox.addEventListener("change", function() {
      autoStart = this.checked;
    });
  }
  
  let speedBtn = document.getElementById("speedToggleButton");
  if (speedBtn) {
    speedBtn.addEventListener("click", function() {
      gameSpeed = gameSpeed === 1 ? 2 : 1;
      updateToolbar();
    });
  }
  
  if (!inRound) startRoundButton.style.display = "block";
  else startRoundButton.style.display = "none";
}

function attemptUpgrade(tower, stat) {
  let cost = (tower.level < tower.maxUpgrades) ? 40 : 60;
  if (currency >= cost) { currency -= cost; tower.upgrade(stat); }
  else alert("Not enough currency for upgrade!");
  updateToolbar();
}

/*****************************
      CHEAT PANEL FUNCTIONS
*****************************/
let cheatPanel;
function createCheatPanel() {
  cheatPanel = document.createElement("div");
  cheatPanel.id = "cheatPanel";
  cheatPanel.style.position = "absolute";
  cheatPanel.style.top = "20px";
  cheatPanel.style.left = "50%";
  cheatPanel.style.transform = "translateX(-50%)";
  cheatPanel.style.backgroundColor = "rgba(0,0,0,0.7)";
  cheatPanel.style.color = "white";
  cheatPanel.style.padding = "10px";
  cheatPanel.style.borderRadius = "5px";
  cheatPanel.style.zIndex = "1000";
  
  let input = document.createElement("input");
  input.type = "text";
  input.style.width = "300px";
  input.style.padding = "5px";
  input.style.border = "none";
  input.style.outline = "none";
  input.style.backgroundColor = "#333";
  input.style.color = "white";
  cheatPanel.appendChild(input);
  
  let toggleButton = document.createElement("div");
  toggleButton.innerHTML = "▼ Commands";
  toggleButton.style.cursor = "pointer";
  toggleButton.style.textAlign = "center";
  toggleButton.style.fontSize = "16px";
  toggleButton.style.marginTop = "5px";
  cheatPanel.appendChild(toggleButton);
  
  let commandList = document.createElement("div");
  commandList.id = "commandList";
  commandList.style.display = "none";
  commandList.style.marginTop = "5px";
  commandList.innerHTML = `
    <ul style="list-style-type: none; padding: 0; margin: 0;">
      <li>set money [amount]</li>
      <li>set gamespeed [value]</li>
      <li>start wave [number]</li>
    </ul>
  `;
  cheatPanel.appendChild(commandList);
  
  toggleButton.addEventListener("click", () => {
    if (commandList.style.display === "none") {
      commandList.style.display = "block";
      toggleButton.innerHTML = "▲ Commands";
    } else {
      commandList.style.display = "none";
      toggleButton.innerHTML = "▼ Commands";
    }
  });
  document.body.appendChild(cheatPanel);
  input.focus();
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      let cmd = input.value.trim();
      handleCheatCommand(cmd);
      input.value = "";
    }
  });
}
function toggleCheatPanel() {
  if (!cheatPanel) createCheatPanel();
  else { cheatPanel.style.display = cheatPanel.style.display === "none" ? "block" : "none"; }
}
document.addEventListener("keydown", function(e) {
  if (e.key === "`") { toggleCheatPanel(); }
});
function handleCheatCommand(cmd) {
  let parts = cmd.split(" ");
  if (parts[0] === "set") {
    if (parts[1] === "money") {
      let amount = parseInt(parts[2]);
      if (!isNaN(amount)) { currency = amount; updateToolbar(); console.log("Set money to", amount); }
    } else if (parts[1] === "gamespeed") {
      let speed = parseInt(parts[2]);
      if (!isNaN(speed) && speed > 0) { gameSpeed = speed; console.log("Set game speed to", speed); }
    }
  } else if(parts[0] === "start" && parts[1] === "wave") {
    let waveNum = parseInt(parts[2]);
    if (!isNaN(waveNum)) {
      currentRound = waveNum - 1;
      startRound();
      console.log("Starting wave", waveNum);
    }
  } else { console.log("Unknown command:", cmd); }
}

/*****************************
       EVENT HANDLERS
*****************************/
startRoundButton.addEventListener("click", () => { if (!inRound) startRound(); });
canvas.addEventListener("mousemove", e => {
  let rect = canvas.getBoundingClientRect();
  previewPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});
canvas.addEventListener("mouseleave", () => { previewPos = null; });
canvas.addEventListener("click", e => {
  let rect = canvas.getBoundingClientRect(),
      clickPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  let clickedOnTower = false;
  for (let tower of towers)
    if (Math.hypot(clickPos.x - tower.pos.x, clickPos.y - tower.pos.y) <= tower.radius) {
      selectedTower = tower; clickedOnTower = true; placingTowerType = null; updateToolbar(); break;
    }
  if (!clickedOnTower) {
    if (placingTowerType) {
      let cost = towerCosts[placingTowerType];
      if (currency >= cost) { currency -= cost; towers.push(new Tower(clickPos, placingTowerType)); }
      else alert("Not enough currency!");
      placingTowerType = null; updateToolbar();
    } else { selectedTower = null; updateToolbar(); }
  }
});

/*****************************
       UPDATE & DRAW FUNCTIONS
*****************************/
function updateGameState() {
  // If the castle (and thus player) is dead, trigger and update castle explosion.
  if (playerHealth <= 0) {
    if (!castleExplosion) {
      // On death, disable auto start and reset speed.
      autoStart = false;
      gameSpeed = 1;
      updateToolbar();
      // Create the explosion from the castle's center.
      castleExplosion = new CastleExplosion(castle.x + castle.width/2, castle.y + castle.height/2, 1000, 60);
    } else {
      castleExplosion.update();
      if (castleExplosion.isDone()){
         // Clear remaining enemies (and towers were already removed on collision) then show Game Over.
         enemies = [];
         showGameOverScreen();
      }
    }
    return;
  }
  
  frameCount++;
  
  if (inRound && enemiesToSpawn > 0) {
    enemySpawnTimer++;
    if (enemySpawnTimer >= 60) {
      enemies.push(new Enemy(randomEnemyType()));
      enemySpawnTimer = 0;
      enemiesToSpawn--;
    }
  }
  
  towers.forEach(t => t.update());
  enemies.forEach(e => e.update());
  projectiles.forEach(p => p.update());
  projectiles = projectiles.filter(p => p.active);
  pulses.forEach(pulse => pulse.update());
  pulses = pulses.filter(pulse => !pulse.isDone());
  
  // Process enemy deaths and escapes.
  for (let i = enemies.length - 1; i >= 0; i--) {
    let enemy = enemies[i];
    if (enemy.health <= 0) {
      if (enemy.type === "tank") {
        // Transform a dying tank enemy into a basic enemy.
        let newEnemy = new Enemy("basic");
        newEnemy.pos = { ...enemy.pos };
        newEnemy.targetIndex = enemy.targetIndex;
        enemies.push(newEnemy);
      } else if (enemy.type === "boss") {
        // When the boss dies, spawn 3 tank enemies spaced apart.
        for (let j = 0; j < 3; j++) {
          let tank = new Enemy("tank");
          tank.pos = { x: enemy.pos.x + (j - 1) * 20, y: enemy.pos.y };
          tank.targetIndex = enemy.targetIndex;
          enemies.push(tank);
        }
      }
      currency += enemy.coinReward;
      enemies.splice(i, 1);
    } else if (enemy.targetIndex >= enemy.path.length) {
      playerHealth--;
      enemies.splice(i, 1);
    }
  }
  
  // Wave completion bonus: 5 coins for finishing a round.
  if (inRound && enemiesToSpawn === 0 && enemies.length === 0) {
    currency += 5;
    inRound = false;
    updateToolbar();
    if (autoStart) {
      setTimeout(startRound, 1000);
    }
  }
}

function drawGame() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawPath();
  
  // Draw towers, enemies, projectiles, and pulses.
  towers.forEach(t => t.draw(t === selectedTower));
  enemies.forEach(e => e.draw());
  projectiles.forEach(p => p.draw());
  pulses.forEach(pulse => pulse.draw());
  
  // If placing a tower, draw its preview.
  if (placingTowerType && previewPos) {
    let tempRange, tempColor;
    if (placingTowerType === "basic") { tempRange = 100; tempColor = "rgba(0,0,255,0.3)"; }
    else if (placingTowerType === "sniper") { tempRange = 150; tempColor = "rgba(128,0,128,0.3)"; }
    else if (placingTowerType === "splash") { tempRange = 120; tempColor = "rgba(0,128,0,0.3)"; }
    else if (placingTowerType === "slow") { tempRange = 80; tempColor = "rgba(0,255,255,0.3)"; }
    else if (placingTowerType === "smart") { tempRange = 180; tempColor = "rgba(255,215,0,0.3)"; }
    ctx.fillStyle = tempColor;
    ctx.beginPath();
    ctx.arc(previewPos.x, previewPos.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tempColor;
    ctx.beginPath();
    ctx.arc(previewPos.x, previewPos.y, tempRange, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Draw HUD info.
  ctx.fillStyle = "black";
  ctx.font = "20px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Health: " + playerHealth, 10, 30);
  ctx.fillText("Round: " + currentRound, 10, 60);
  ctx.fillText("Currency: $" + currency, 10, 90);
  
  // Draw the castle if it exists and is not in explosion mode.
  if (!castleExplosion) {
    ctx.drawImage(castleImage, castle.x, castle.y, castle.width, castle.height);
  } else {
    castleExplosion.draw();
  }
}

function drawPath() {
  ctx.strokeStyle = "grey";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(PATH[0].x, PATH[0].y);
  for (let i = 1; i < PATH.length; i++) { ctx.lineTo(PATH[i].x, PATH[i].y); }
  ctx.stroke();
}

function gameLoop() {
  for (let i = 0; i < gameSpeed; i++) { updateGameState(); }
  drawGame();
  requestAnimationFrame(gameLoop);
}
updateToolbar();
gameLoop();

/*****************************
       MENU SCREEN FUNCTIONS
*****************************/
function createTitleScreen() {
  titleScreen = document.createElement("div");
  titleScreen.id = "titleScreen";
  titleScreen.style.position = "fixed";
  titleScreen.style.top = "0";
  titleScreen.style.left = "0";
  titleScreen.style.width = "100%";
  titleScreen.style.height = "100%";
  titleScreen.style.backgroundColor = "#333";
  titleScreen.style.color = "white";
  titleScreen.style.display = "flex";
  titleScreen.style.flexDirection = "column";
  titleScreen.style.justifyContent = "center";
  titleScreen.style.alignItems = "center";
  titleScreen.innerHTML = `
     <h1 style="font-size: 50px; margin-bottom: 20px;">Tower-Defence</h1>
     <button id="startGameButton" style="padding: 10px 20px; font-size: 20px; margin-bottom: 10px;">Start</button>
     <button id="creditsButton" style="padding: 10px 20px; font-size: 20px; margin-bottom: 10px;">Credits</button>
     <button id="upgradesButton" style="padding: 10px 20px; font-size: 20px;">Upgrades (Coming Soon)</button>
  `;
  document.body.appendChild(titleScreen);

  document.getElementById("startGameButton").addEventListener("click", function() {
    hideTitleScreen();
    resetGame();
  });
  document.getElementById("creditsButton").addEventListener("click", function() {
    showCreditsScreen();
  });
  // The Upgrades button is currently a placeholder.
}

function createCreditsScreen() {
  creditsScreen = document.createElement("div");
  creditsScreen.id = "creditsScreen";
  creditsScreen.style.position = "fixed";
  creditsScreen.style.top = "0";
  creditsScreen.style.left = "0";
  creditsScreen.style.width = "100%";
  creditsScreen.style.height = "100%";
  creditsScreen.style.backgroundColor = "#333";
  creditsScreen.style.color = "white";
  creditsScreen.style.display = "none";
  creditsScreen.style.flexDirection = "column";
  creditsScreen.style.justifyContent = "center";
  creditsScreen.style.alignItems = "center";
  creditsScreen.innerHTML = `
     <h1 style="font-size: 40px; margin-bottom: 20px;">Credits</h1>
     <p style="font-size: 24px;">sander</p>
     <button id="backFromCreditsButton" style="padding: 10px 20px; font-size: 20px; margin-top: 20px;">Back</button>
  `;
  document.body.appendChild(creditsScreen);
  
  document.getElementById("backFromCreditsButton").addEventListener("click", function() {
    hideCreditsScreen();
    showTitleScreen();
  });
}

function createGameOverScreen() {
  gameOverScreen = document.createElement("div");
  gameOverScreen.id = "gameOverScreen";
  gameOverScreen.style.position = "fixed";
  gameOverScreen.style.top = "0";
  gameOverScreen.style.left = "0";
  gameOverScreen.style.width = "100%";
  gameOverScreen.style.height = "100%";
  gameOverScreen.style.backgroundColor = "rgba(0,0,0,0.8)";
  gameOverScreen.style.color = "white";
  gameOverScreen.style.display = "none";
  gameOverScreen.style.flexDirection = "column";
  gameOverScreen.style.justifyContent = "center";
  gameOverScreen.style.alignItems = "center";
  gameOverScreen.innerHTML = `
     <h1 style="font-size: 50px; margin-bottom: 20px;">You Died</h1>
     <button id="backToTitleButton" style="padding: 10px 20px; font-size: 20px;">Back to Title</button>
  `;
  document.body.appendChild(gameOverScreen);
  
  document.getElementById("backToTitleButton").addEventListener("click", function() {
    hideGameOverScreen();
    showTitleScreen();
  });
}

function showTitleScreen() {
  if (!titleScreen) createTitleScreen();
  titleScreen.style.display = "flex";
  gameContainer.style.display = "none";
}
function hideTitleScreen() {
  if (titleScreen) {
    titleScreen.style.display = "none";
  }
  // Display as flex so that canvas and toolbar remain side-by-side.
  gameContainer.style.display = "flex";
}
function showCreditsScreen() {
  if (!creditsScreen) createCreditsScreen();
  creditsScreen.style.display = "flex";
  titleScreen.style.display = "none";
}
function hideCreditsScreen() {
  if (creditsScreen) {
    creditsScreen.style.display = "none";
  }
  titleScreen.style.display = "flex";
}
function showGameOverScreen() {
  if (!gameOverScreen) createGameOverScreen();
  gameOverScreen.style.display = "flex";
  gameContainer.style.display = "none";
}
function hideGameOverScreen() {
  if (gameOverScreen) {
    gameOverScreen.style.display = "none";
  }
  // Set display back to flex for proper layout.
  gameContainer.style.display = "flex";
}

function resetGame() {
  towers = [];
  enemies = [];
  projectiles = [];
  pulses = [];
  currentRound = 0;
  inRound = false;
  enemySpawnTimer = 0;
  enemiesToSpawn = 0;
  playerHealth = 10;
  currency = 150;
  placingTowerType = null;
  previewPos = null;
  selectedTower = null;
  frameCount = 0;
  gameSpeed = 1;
  autoStart = false;
  gameOver = false;
  castleExplosion = null;
  updateToolbar();
}

// On load, display the title screen and hide the game container.
gameContainer.style.display = "none";
createTitleScreen();
createCreditsScreen();
createGameOverScreen();
