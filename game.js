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

let placingTowerType = null;   // type selected from shop (eg. "basic", "sniper", "splash", etc.)
let previewPos = null;         // mouse position for showing placement preview
let selectedTower = null;      // tower currently selected (for upgrades & deletion)

// Frame counter (used for enemy special attacks)
let frameCount = 0;

// DOM Elements for Toolbar UI
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
   Types:
    • basic (red)
    • fast (orange)
    • tank (brown)
    • regenerator (teal): slowly heals and “attacks” towers.
*/
class Enemy {
  constructor(type) {
    this.path = [...PATH]; // copy path
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
      // For regeneration and tower attack
      this.attackCooldown = 180; // frames between special attacks
      this.lastAttack = -180;
    }
    this.health = this.maxHealth;
    this.baseSpeed = this.speed;
    this.slowTimer = 0; // if slowed (from slow projectile), counts down
  }
  
  update() {
    // Regenerator-specific behaviors: heal and shoot towers.
    if (this.type === "regenerator") {
      // Regenerate health slowly (up to maxHealth)
      this.health = Math.min(this.health + 0.2, this.maxHealth);
      // Every attackCooldown, attempt to slow a nearby tower
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
          nearestTower.attackSlowTimer = 90; // 1.5 seconds at 60fps
          this.lastAttack = frameCount;
        }
      }
    }
    
    // Use effective speed if slowed
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
    
    // Draw health bar above enemy
    const barWidth = 20, barHeight = 4;
    const healthRatio = this.health / this.maxHealth;
    ctx.fillStyle = "black";
    ctx.fillRect(this.pos.x - barWidth / 2, this.pos.y - this.radius - 10, barWidth, barHeight);
    ctx.fillStyle = "green";
    ctx.fillRect(this.pos.x - barWidth / 2, this.pos.y - this.radius - 10, barWidth * healthRatio, barHeight);
  }
}

/*–– Tower (Defender) Class ––
   Existing types: basic, sniper.
   New types:
    • splash – Fire a projectile that does area damage.
    • slow – Fire a projectile that slows enemies.
    • smart – Long range with shot prediction.
    
   Towers have three upgrade branches (your upgrade logic remains similar).
*/
class Tower {
  constructor(pos, type) {
    this.pos = { ...pos };
    this.type = type;
    this.level = 1;
    this.timer = 0;
    this.maxUpgrades = 3;
    this.specialAbilityUnlocked = false;
    this.attackSlowTimer = 0; // if a regenerator enemy “slows” the tower
    
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
      this.cooldown = 80;
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
    
    // If the tower is slowed from an enemy attack, skip firing this frame.
    if (this.attackSlowTimer > 0) {
      this.attackSlowTimer--;
      return;
    }
    
    // Look for the nearest enemy within range
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
      // Fire differently based on tower type:
      if (this.type === "smart") {
        // Calculate a predicted target position
        const dx = target.pos.x - this.pos.x;
        const dy = target.pos.y - this.pos.y;
        const distance = Math.hypot(dx, dy);
        const t = distance / 8; // projectile travel time (speed = 8)
        // Determine target’s direction (based on next waypoint)
        const waypoint = target.path[target.targetIndex] || target.pos;
        const dx_enemy = waypoint.x - target.pos.x;
        const dy_enemy = waypoint.y - target.pos.y;
        const dEnemy = Math.hypot(dx_enemy, dy_enemy) || 1;
        const predictFactor = t; 
        const predictedPos = { 
          x: target.pos.x + (dx_enemy / dEnemy) * predictFactor,
          y: target.pos.y + (dy_enemy / dEnemy) * predictFactor
        };
        // Create a dummy target to aim for with the projectile.
        const smartTarget = { pos: predictedPos, radius: target.radius };
        projectiles.push(new Projectile(this.pos, smartTarget, this.damage, 8));
      } else if (this.type === "splash") {
        // Projectile with splash effect
        projectiles.push(new Projectile(this.pos, target, this.damage, 5, "splash"));
      } else if (this.type === "slow") {
        projectiles.push(new Projectile(this.pos, target, this.damage, 5, "slow"));
      } else {
        // For basic & sniper towers
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
    
    // Display upgrade level
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.level, this.pos.x, this.pos.y);
  }
  
  // Upgrade tower stats. (The actual cost deduction is handled externally.)
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
      // Final upgrade: boost all stats and unlock a special ability.
      this.specialAbilityUnlocked = true;
      this.damage += 50;
      this.range += 50;
      this.cooldown = Math.max(10, this.cooldown - 15);
    }
    updateToolbar();
  }
}

/*–– Projectile Class ––
   Optionally accepts a type:
    • normal (default)
    • splash – on hit, deals area damage.
    • slow – on hit, applies a slow effect.
*/
class Projectile {
  constructor(startPos, target, damage, speed, projType = "normal") {
    this.pos = { ...startPos };
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.projType = projType;
    const dx = target.pos.x - startPos.x;
    const dy = target.pos.y - startPos.y;
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
    // Check collision against the target.
    if (Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.y - this.pos.y) < this.radius + this.target.radius) {
      if (this.projType === "splash") {
        // Full damage on main target.
        this.target.health -= this.damage;
        // Splash damage (50%) to nearby enemies.
        for (let enemy of enemies) {
          const d = Math.hypot(enemy.pos.x - this.target.pos.x, enemy.pos.y - this.target.pos.y);
          if (enemy !== this.target && d < 30) {
            enemy.health -= this.damage * 0.5;
          }
        }
      } else if (this.projType === "slow") {
        this.target.health -= this.damage;
        // Apply slow effect for 90 frames (1.5 seconds at 60fps)
        this.target.slowTimer = 90;
      } else {
        this.target.health -= this.damage;
      }
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

// Returns an enemy type based on the current round.
// Rounds 1-2: only basic.
// Rounds 3-4: basic, fast, and tank.
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
  // Build toolbar content – include currency at the top.
  let html = `<div class="toolbar-header">
                  <h3>Defender Shop</h3>
                  <div><strong>Currency:</strong> $${currency}</div>
               </div>`;
  
  if (selectedTower) {
    // Show tower details and upgrade options.
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
    
    // Wire up upgrade buttons with cost checking.
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
    // Shop view: show all tower types including new ones and display their price.
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
  
  // Show or hide the Start Round button.
  startRoundButton.style.display = inRound ? "none" : "block";
}

/*****************************
         ATTEMPT UPGRADE
*****************************/
// Attempts an upgrade and deducts currency.
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
// Start Round button
startRoundButton.addEventListener("click", () => {
  if (!inRound) startRound();
});

// Update tower placement preview
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  previewPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
});

// Clear preview when mouse leaves the canvas.
canvas.addEventListener("mouseleave", () => {
  previewPos = null;
});

// Mouse click on canvas: select tower or place new one.
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
      placingTowerType = null; // cancel new placement if tower selected
      updateToolbar();
      break;
    }
  }
  
  if (!clickedOnTower) {
    if (placingTowerType) {
      // Check currency before placing a new tower.
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
      // Deselect any selected tower.
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
  
  // Spawn enemies if round is active.
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
  
  // Process enemies: add coin reward if killed and reduce health if they finish the path.
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
  
  // End round if complete.
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
  
  // Draw HUD (Health, Round, Currency)
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
