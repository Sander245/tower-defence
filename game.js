/*****************************
  GLOBAL VARIABLES & SETUP
*****************************/
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

let towers = [];
let enemies = [];
let projectiles = [];
let pulses = []; // New: array to hold the splash tower's pulse effects

let currentRound = 0;
let inRound = false;
let enemySpawnTimer = 0;
let enemiesToSpawn = 0;
let playerHealth = 10;

// Currency system
let currency = 150;
const towerCosts = {
  "basic": 50,
  "sniper": 75,
  "splash": 100,
  "slow": 80,
  "smart": 120
};

let placingTowerType = null; // type selected from shop (e.g., "basic", "sniper", etc.)
let previewPos = null;       // mouse position for showing tower placement preview
let selectedTower = null;    // currently selected tower (for upgrades/deletion)

// Frame counter (used for enemy special attacks)
let frameCount = 0;

const toolbarContent = document.getElementById("toolbar-content");
const startRoundButton = document.getElementById("startRoundButton");

// Define a fixed enemy path (list of waypoints)
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

/*–– Enemy Class ––  
   Enemy types:
    • basic (red)
    • fast (orange)
    • tank (brown)
    • regenerator (teal): slowly heals itself and “attacks” towers by slowing them.
*/
class Enemy {
  constructor(type) {
    this.path = [...PATH]; // copy of the enemy path
    this.pos = { ...this.path[0] };
    this.targetIndex = 1;
    this.type = type;
    
    if (type === "basic") {
      this.speed = 1.0;
      this.maxHealth = 100;
      this.radius = 10;
      this.color = "red";
      this.coinReward = 10;
    } else if (type === "fast") {
      this.speed = 2.0;
      this.maxHealth = 70;
      this.radius = 8;
      this.color = "orange";
      this.coinReward = 15;
    } else if (type === "tank") {
      this.speed = 0.5;
      this.maxHealth = 200;
      this.radius = 12;
      this.color = "brown";
      this.coinReward = 20;
    } else if (type === "regenerator") {
      this.speed = 0.8;
      this.maxHealth = 150;
      this.radius = 10;
      this.color = "teal";
      this.coinReward = 25;
      // Special ability: attack towers every so often.
      this.attackCooldown = 180; // frames between special attacks
      this.lastAttack = -180;
    }
    this.health = this.maxHealth;
    this.baseSpeed = this.speed;
    this.slowTimer = 0; // in case enemy gets slowed
  }
  
  update() {
    // Regenerator enemy heals and attempts to slow nearby towers.
    if (this.type === "regenerator") {
      // Heal slowly (but not above maxHealth)
      this.health = Math.min(this.health + 0.2, this.maxHealth);
      if (frameCount - this.lastAttack >= this.attackCooldown) {
        let nearestTower = null;
        let minDist = Infinity;
        for (let tower of towers) {
          const d = Math.hypot(tower.pos.x - this.pos.x, tower.pos.y - this.pos.y);
          if (d < 150 && d < minDist) {
            nearestTower = tower;
            minDist = d;
          }
        }
        if (nearestTower) {
          nearestTower.attackSlowTimer = 90; // slows tower for 1.5 seconds (at 60fps)
          this.lastAttack = frameCount;
        }
      }
    }
    
    // Apply slow effect if active.
    let effectiveSpeed = this.baseSpeed;
    if (this.slowTimer > 0) {
      effectiveSpeed *= 0.5;
      this.slowTimer--;
    }
    
    if (this.targetIndex >= this.path.length) return;
    const target = this.path[this.targetIndex];
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist !== 0) {
      const vx = dx / dist;
      const vy = dy / dist;
      this.pos.x += vx * effectiveSpeed;
      this.pos.y += vy * effectiveSpeed;
    }
    if (dist < effectiveSpeed) {
      this.targetIndex++;
    }
  }
  
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Health bar above enemy.
    const barWidth = 20, barHeight = 4;
    const healthRatio = this.health / this.maxHealth;
    ctx.fillStyle = "black";
    ctx.fillRect(this.pos.x - barWidth / 2, this.pos.y - this.radius - 10, barWidth, barHeight);
    ctx.fillStyle = "green";
    ctx.fillRect(this.pos.x - barWidth / 2, this.pos.y - this.radius - 10, barWidth * healthRatio, barHeight);
  }
}

/*–– Tower (Defender) Class ––
   Tower types:
    • basic – moderate range/damage.
    • sniper – longer range, higher damage.
    • splash – creates an expanding pulse effect.
    • slow – fires a projectile that slows enemies.
    • smart – long range with shot prediction.
*/
class Tower {
  constructor(pos, type) {
    this.pos = { ...pos };
    this.type = type;
    this.level = 1;
    this.timer = 0;
    this.maxUpgrades = 3;
    this.specialAbilityUnlocked = false;
    this.attackSlowTimer = 0; // if tower is slowed by a regenerator
    
    if (type === "basic") {
      this.range = 100;
      this.damage = 20;
      this.cooldown = 60;
      this.color = "blue";
    } else if (type === "sniper") {
      this.range = 150;
      this.damage = 40;
      this.cooldown = 120;
      this.color = "purple";
    } else if (type === "splash") {
      this.range = 120;
      this.damage = 25;
      this.cooldown = 300; // every 5 seconds (300 frames)
      this.color = "green";
    } else if (type === "slow") {
      this.range = 80;
      this.damage = 10;
      this.cooldown = 50;
      this.color = "cyan";
    } else if (type === "smart") {
      this.range = 180;
      this.damage = 15;
      this.cooldown = 40;
      this.color = "gold";
    }
    this.radius = 15;
  }
  
  update() {
    if (this.timer > 0) this.timer--;
    
    // If tower is slowed by a regenerator attack, skip this update cycle.
    if (this.attackSlowTimer > 0) {
      this.attackSlowTimer--;
      return;
    }
    
    // Look for the nearest enemy within range.
    let target = null;
    let minDist = Infinity;
    for (let enemy of enemies) {
      const dx = enemy.pos.x - this.pos.x;
      const dy = enemy.pos.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= this.range && dist < minDist) {
        minDist = dist;
        target = enemy;
      }
    }
    
    if (target && this.timer <= 0) {
      // Firing behavior depends on tower type.
      if (this.type === "splash") {
        // Create a pulse effect instead of a moving projectile.
        pulses.push(new Pulse(this.pos, this.range, this.damage, 300));
      } else if (this.type === "smart") {
        const speed = 8;
        const dx = target.pos.x - this.pos.x;
        const dy = target.pos.y - this.pos.y;
        const distance = Math.hypot(dx, dy);
        const t = distance / speed; // estimated travel time
        const waypoint = target.path[target.targetIndex] || target.pos;
        const dx_enemy = waypoint.x - target.pos.x;
        const dy_enemy = waypoint.y - target.pos.y;
        const dEnemy = Math.hypot(dx_enemy, dy_enemy) || 1;
        const predictFactor = t;
        const predictedPos = {
          x: target.pos.x + (dx_enemy / dEnemy) * predictFactor,
          y: target.pos.y + (dy_enemy / dEnemy) * predictFactor
        };
        // Use the predicted position for setting velocity, but track the real enemy.
        projectiles.push(new Projectile(this.pos, target, this.damage, speed, "smart", predictedPos));
      } else if (this.type === "slow") {
        projectiles.push(new Projectile(this.pos, target, this.damage, 5, "slow"));
      } else {
        // For basic & sniper towers.
        const bulletSpeed = (this.type === "sniper") ? 8 : 5;
        projectiles.push(new Projectile(this.pos, target, this.damage, bulletSpeed));
      }
      this.timer = this.cooldown;
    }
  }
  
  draw(isSelected = false) {
    ctx.fillStyle = isSelected ? "grey" : this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    if (isSelected) {
      ctx.strokeStyle = "grey";
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Display the upgrade level.
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.level, this.pos.x, this.pos.y);
  }
  
  // Upgrade the tower’s stats (actual cost deduction is handled externally).
  upgrade(stat) {
    if (this.level < this.maxUpgrades) {
      if (stat === "damage") {
        this.damage += Math.floor(this.damage * 0.5);
      } else if (stat === "range") {
        this.range += 10;
      } else if (stat === "cooldown") {
        this.cooldown = Math.max(20, this.cooldown - 10);
      }
      this.level++;
    } else if (!this.specialAbilityUnlocked) {
      this.specialAbilityUnlocked = true;
      this.damage += 50;
      this.range += 50;
      this.cooldown = Math.max(10, this.cooldown - 15);
    }
    updateToolbar();
  }
}

/*–– Projectile Class ––
   Now accepts an optional predicted position (used by smart towers).
*/
class Projectile {
  constructor(startPos, target, damage, speed, projType = "normal", predictedPos = null) {
    this.pos = { ...startPos };
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.projType = projType;
    
    // For smart projectiles, aim toward the predicted position if given.
    const aimPos = (projType === "smart" && predictedPos) ? predictedPos : target.pos;
    const dx = aimPos.x - startPos.x;
    const dy = aimPos.y - startPos.y;
    const dist = Math.hypot(dx, dy);
    if (dist) {
      this.dx = dx / dist;
      this.dy = dy / dist;
    } else {
      this.dx = 0;
      this.dy = 0;
    }
    this.radius = 5;
    this.active = true;
  }
  
  update() {
    this.pos.x += this.dx * this.speed;
    this.pos.y += this.dy * this.speed;
    // Check collision with the actual enemy target.
    if (Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.y - this.pos.y) < this.radius + this.target.radius) {
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

/*–– Pulse Class ––
   Used exclusively by splash towers.
   An expanding outline that, as it grows, damages enemies it passes.
*/
class Pulse {
  constructor(center, maxRadius, damage, duration = 300) {
    this.center = { ...center };
    this.maxRadius = maxRadius;
    this.damage = damage;
    this.duration = duration; // duration in frames (300 frames = 5 seconds)
    this.frame = 0;
    this.hitEnemies = new Set(); // so each enemy is damaged only once per pulse cycle
  }
  
  update() {
    this.frame++;
    // Calculate current radius (linearly expanding).
    this.currentRadius = (this.frame / this.duration) * this.maxRadius;
    
    // Check for enemies within a small tolerance around the pulse ring.
    const tolerance = 5;
    for (let enemy of enemies) {
      const d = Math.hypot(enemy.pos.x - this.center.x, enemy.pos.y - this.center.y);
      if (d >= this.currentRadius - tolerance && d <= this.currentRadius + tolerance) {
        if (!this.hitEnemies.has(enemy)) {
          enemy.health -= this.damage;
          this.hitEnemies.add(enemy);
        }
      }
    }
  }
  
  draw() {
    // Fade out over time.
    const alpha = 1 - (this.frame / this.duration);
    ctx.strokeStyle = `rgba(0,128,0,${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this.currentRadius, 0, Math.PI * 2);
    ctx.stroke();
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
  enemiesToSpawn = 5 + currentRound * 2;
  enemySpawnTimer = 0;
  updateToolbar();
}

// Returns enemy type based on current round:
// Rounds 1-2: basic only.
// Rounds 3-4: basic, fast, tank.
// Rounds 5+: include regenerator.
function randomEnemyType() {
  if (currentRound < 3) return "basic";
  let roll = Math.random();
  if (currentRound < 5) {
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
  // Build toolbar HTML (show current currency).
  let html = `<div class="toolbar-header">
                  <h3>Defender Shop</h3>
                  <div><strong>Currency:</strong> $${currency}</div>
               </div>`;
  
  if (selectedTower) {
    // Tower options and upgrades.
    html = `<div class="toolbar-header">
              <h3>Defender Options</h3>
              <div><strong>Currency:</strong> $${currency}</div>
            </div>
            <div><strong>Type:</strong> ${selectedTower.type}</div>
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
            <button id="deleteButton">Delete</button>
            <button id="cancelSelectionButton">Cancel</button>`;
    toolbarContent.innerHTML = html;
    if (selectedTower.level < selectedTower.maxUpgrades) {
      document.getElementById("upgradeDamage").addEventListener("click", () => {
        attemptUpgrade(selectedTower, "damage");
      });
      document.getElementById("upgradeRange").addEventListener("click", () => {
        attemptUpgrade(selectedTower, "range");
      });
      document.getElementById("upgradeCooldown").addEventListener("click", () => {
        attemptUpgrade(selectedTower, "cooldown");
      });
    } else if (!selectedTower.specialAbilityUnlocked) {
      document.getElementById("finalUpgrade").addEventListener("click", () => {
        attemptUpgrade(selectedTower, "final");
      });
    }
    document.getElementById("deleteButton").addEventListener("click", () => {
      towers = towers.filter(t => t !== selectedTower);
      selectedTower = null;
      updateToolbar();
    });
    document.getElementById("cancelSelectionButton").addEventListener("click", () => {
      selectedTower = null;
      updateToolbar();
    });
  } else {
    // Shop view: list all tower types with prices.
    html += `
      <button class="shop-item" data-type="basic">Basic Defender ($50)</button>
      <button class="shop-item" data-type="sniper">Sniper Defender ($75)</button>
      <button class="shop-item" data-type="splash">Splash Defender ($100)</button>
      <button class="shop-item" data-type="slow">Slow Defender ($80)</button>
      <button class="shop-item" data-type="smart">Smart Defender ($120)</button>
    `;
    toolbarContent.innerHTML = html;
    document.querySelectorAll(".shop-item").forEach(item => {
      item.addEventListener("click", () => {
        placingTowerType = item.getAttribute("data-type");
      });
    });
  }
  
  // Show/hide the Start Round button based on whether a round is active.
  startRoundButton.style.display = inRound ? "none" : "block";
}

/*****************************
         ATTEMPT UPGRADE
*****************************/
function attemptUpgrade(tower, stat) {
  let cost = (tower.level < tower.maxUpgrades) ? 40 : 60;
  if (currency >= cost) {
    currency -= cost;
    tower.upgrade(stat);
  } else {
    alert("Not enough currency for upgrade!");
  }
  updateToolbar();
}

/*****************************
       EVENT HANDLERS
*****************************/
startRoundButton.addEventListener("click", () => {
  if (!inRound) startRound();
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  previewPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
});

canvas.addEventListener("mouseleave", () => {
  previewPos = null;
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  
  let clickedOnTower = false;
  for (let tower of towers) {
    if (Math.hypot(clickPos.x - tower.pos.x, clickPos.y - tower.pos.y) <= tower.radius) {
      selectedTower = tower;
      clickedOnTower = true;
      placingTowerType = null;
      updateToolbar();
      break;
    }
  }
  
  if (!clickedOnTower) {
    if (placingTowerType) {
      const cost = towerCosts[placingTowerType];
      if (currency >= cost) {
        currency -= cost;
        towers.push(new Tower(clickPos, placingTowerType));
      } else {
        alert("Not enough currency!");
      }
      placingTowerType = null;
      updateToolbar();
    } else {
      selectedTower = null;
      updateToolbar();
    }
  }
});

/*****************************
       RENDERING & GAME LOOP
*****************************/
function drawPath() {
  ctx.strokeStyle = "grey";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(PATH[0].x, PATH[0].y);
  for (let i = 1; i < PATH.length; i++) {
    ctx.lineTo(PATH[i].x, PATH[i].y);
  }
  ctx.stroke();
}

function gameLoop() {
  frameCount++;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  
  // Draw background and enemy path.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawPath();
  
  // Spawn enemies if a round is active.
  if (inRound && enemiesToSpawn > 0) {
    enemySpawnTimer++;
    if (enemySpawnTimer >= 60) {
      const enemyType = randomEnemyType();
      enemies.push(new Enemy(enemyType));
      enemySpawnTimer = 0;
      enemiesToSpawn--;
    }
  }
  
  // Update game objects.
  towers.forEach(tower => tower.update());
  enemies.forEach(enemy => enemy.update());
  projectiles.forEach(proj => proj.update());
  
  // Remove inactive projectiles.
  projectiles = projectiles.filter(p => p.active);
  
  // Update and draw pulses; remove pulses which are done.
  pulses.forEach(pulse => pulse.update());
  pulses = pulses.filter(pulse => !pulse.isDone());
  pulses.forEach(pulse => pulse.draw());
  
  // Process enemies: reward currency on kills, reduce health if enemy escapes.
  for (let i = enemies.length - 1; i >= 0; i--) {
    let enemy = enemies[i];
    if (enemy.health <= 0) {
      currency += enemy.coinReward;
      enemies.splice(i, 1);
    } else if (enemy.targetIndex >= enemy.path.length) {
      playerHealth--;
      enemies.splice(i, 1);
    }
  }
  
  // End round when all enemies are spawned and eliminated.
  if (inRound && enemiesToSpawn === 0 && enemies.length === 0) {
    inRound = false;
    updateToolbar();
  }
  
  // Draw game objects.
  towers.forEach(tower => tower.draw(tower === selectedTower));
  enemies.forEach(enemy => enemy.draw());
  projectiles.forEach(proj => proj.draw());
  
  // If placing a tower, render a transparent preview.
  if (placingTowerType && previewPos) {
    let tempRange, tempColor;
    if (placingTowerType === "basic") {
      tempRange = 100;
      tempColor = "rgba(0,0,255,0.3)";
    } else if (placingTowerType === "sniper") {
      tempRange = 150;
      tempColor = "rgba(128,0,128,0.3)";
    } else if (placingTowerType === "splash") {
      tempRange = 120;
      tempColor = "rgba(0,128,0,0.3)";
    } else if (placingTowerType === "slow") {
      tempRange = 80;
      tempColor = "rgba(0,255,255,0.3)";
    } else if (placingTowerType === "smart") {
      tempRange = 180;
      tempColor = "rgba(255,215,0,0.3)";
    }
    ctx.fillStyle = tempColor;
    ctx.beginPath();
    ctx.arc(previewPos.x, previewPos.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tempColor;
    ctx.beginPath();
    ctx.arc(previewPos.x, previewPos.y, tempRange, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Draw HUD (Health, Round, Currency).
  ctx.fillStyle = "black";
  ctx.font = "20px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Health: " + playerHealth, 10, 30);
  ctx.fillText("Round: " + currentRound, 10, 60);
  ctx.fillText("Currency: $" + currency, 10, 90);
  
  requestAnimationFrame(gameLoop);
}

updateToolbar();
gameLoop();
