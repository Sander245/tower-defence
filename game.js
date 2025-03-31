/*****************************
  GLOBAL VARIABLES & SETUP
*****************************/
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Arrays to hold towers, enemies, and projectiles
let towers = [];
let enemies = [];
let projectiles = [];

// Wave / round variables
let currentRound = 0;
let inRound = false;
let enemySpawnTimer = 0;
let enemiesToSpawn = 0;
let playerHealth = 10;

// States for tower placement and selection
let placingTowerType = null;   // "basic" or "sniper" when selected in the shop
let previewPos = null;         // mouse position for showing placement preview
let selectedTower = null;      // currently selected tower for editing

// DOM Elements for the toolbar UI
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
   Supports three types:
    • basic (red) – standard enemy.
    • fast (orange) – quicker and with lower health.
    • tank (brown) – slower but with higher health.
*/
class Enemy {
  constructor(type) {
    this.path = [...PATH]; // copy the path
    this.pos = { ...this.path[0] }; // starting position
    this.targetIndex = 1;
    this.type = type;
    
    if (type === "basic") {
      this.speed = 1.0;
      this.maxHealth = 100;
      this.radius = 10;
      this.color = "red";
    } else if (type === "fast") {
      this.speed = 2.0;
      this.maxHealth = 70;
      this.radius = 8;
      this.color = "orange";
    } else if (type === "tank") {
      this.speed = 0.5;
      this.maxHealth = 200;
      this.radius = 12;
      this.color = "brown";
    }
    this.health = this.maxHealth;
  }
  
  update() {
    if (this.targetIndex >= this.path.length) return;
    const target = this.path[this.targetIndex];
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist !== 0) {
      const vx = dx / dist;
      const vy = dy / dist;
      this.pos.x += vx * this.speed;
      this.pos.y += vy * this.speed;
    }
    if (dist < this.speed) {
      this.targetIndex++;
    }
  }
  
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw a simple health bar above the enemy
    const barWidth = 20, barHeight = 4;
    const healthRatio = this.health / this.maxHealth;
    ctx.fillStyle = "black";
    ctx.fillRect(this.pos.x - barWidth / 2, this.pos.y - this.radius - 10, barWidth, barHeight);
    ctx.fillStyle = "green";
    ctx.fillRect(this.pos.x - barWidth / 2, this.pos.y - this.radius - 10, barWidth * healthRatio, barHeight);
  }
}

/*–– Tower (Defender) Class ––  
   Two types are supported:
    • basic – moderate range, damage, and rate-of-fire.
    • sniper – longer range and higher damage, and (per request) its projectiles travel faster.
    
   This class also provides an upgrade method. Upgrades come in three branches:
     – Upgrade Damage
     – Upgrade Range
     – Upgrade Cooldown (i.e. rate-of-fire)
     
   When a tower reaches three upgrades, a final upgrade button appears that boosts all stats and unlocks a special ability.
*/
class Tower {
  constructor(pos, type) {
    this.pos = { ...pos };
    this.type = type;
    this.level = 1;
    this.timer = 0;
    this.maxUpgrades = 3;
    this.specialAbilityUnlocked = false;
    
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
    }
    this.radius = 15;
  }
  
  update() {
    if (this.timer > 0) this.timer--;
    // Look for the closest enemy within range
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
      // Sniper towers fire faster bullets
      const bulletSpeed = (this.type === "sniper") ? 8 : 5;
      projectiles.push(new Projectile(this.pos, target, this.damage, bulletSpeed));
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
    
    // Display current upgrade level (or number of upgrade actions taken)
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.level, this.pos.x, this.pos.y);
  }
  
  // Upgrade the tower with a chosen stat upgrade.
  // 'stat' is one of "damage", "range", or "cooldown". When max upgrades reached,
  // the 'final' upgrade boosts all stats and grants a special ability.
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
      // Final Upgrade: boost all stats and unlock special ability
      this.specialAbilityUnlocked = true;
      this.damage += 50;
      this.range += 50;
      this.cooldown = Math.max(10, this.cooldown - 15);
    }
    updateToolbar();
  }
}

/*–– Projectile Class ––  
   A projectile fired from a tower towards an enemy.
   The constructor now takes a speed parameter so that sniper towers can fire faster bullets.
*/
class Projectile {
  constructor(startPos, target, damage, speed) {
    this.pos = { ...startPos };
    this.target = target;
    this.damage = damage;
    this.speed = speed;
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
// Rounds 1 and 2 only spawn basic enemies. Starting round 3, additional types are introduced.
function randomEnemyType() {
  if (currentRound < 3) return "basic";
  let roll = Math.random();
  if (roll < 0.6) return "basic";
  else if (roll < 0.9) return "fast";
  else return "tank";
}

/*****************************
      TOOLBAR (UI) FUNCTIONS
*****************************/
function updateToolbar() {
  if (selectedTower) {
    // Display tower details and upgrade options
    toolbarContent.innerHTML = `
      <h3>Defender Options</h3>
      <div><strong>Type:</strong> ${selectedTower.type}</div>
      <div><strong>Level:</strong> ${selectedTower.level}</div>
      <div><strong>Damage:</strong> ${selectedTower.damage}</div>
      <div><strong>Range:</strong> ${selectedTower.range}</div>
      <div><strong>Cooldown:</strong> ${selectedTower.cooldown}</div>
      ${
        selectedTower.level < selectedTower.maxUpgrades
          ? `
            <button id="upgradeDamage">Upgrade Damage</button>
            <button id="upgradeRange">Upgrade Range</button>
            <button id="upgradeCooldown">Upgrade Cooldown</button>
          `
          : !selectedTower.specialAbilityUnlocked
          ? `<button id="finalUpgrade">Final Upgrade</button>`
          : `<div>Max Upgrades Achieved</div>`
      }
      <button id="deleteButton">Delete</button>
      <button id="cancelSelectionButton">Cancel</button>
    `;
    if (selectedTower.level < selectedTower.maxUpgrades) {
      document.getElementById("upgradeDamage").addEventListener("click", () => {
        selectedTower.upgrade("damage");
      });
      document.getElementById("upgradeRange").addEventListener("click", () => {
        selectedTower.upgrade("range");
      });
      document.getElementById("upgradeCooldown").addEventListener("click", () => {
        selectedTower.upgrade("cooldown");
      });
    } else if (!selectedTower.specialAbilityUnlocked) {
      document.getElementById("finalUpgrade").addEventListener("click", () => {
        selectedTower.upgrade("final");
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
    // Display the defender shop to option new tower placement
    toolbarContent.innerHTML = `
      <h3>Defender Shop</h3>
      <button class="shop-item" data-type="basic">Basic Defender</button>
      <button class="shop-item" data-type="sniper">Sniper Defender</button>
    `;
    document.querySelectorAll(".shop-item").forEach(item => {
      item.addEventListener("click", () => {
        placingTowerType = item.getAttribute("data-type");
      });
    });
  }
  
  // Show or hide the Start Round button based on whether a round is active
  startRoundButton.style.display = inRound ? "none" : "block";
}

/*****************************
         EVENT HANDLERS
*****************************/
// Start Round button – begins a new wave/round when clicked
startRoundButton.addEventListener("click", () => {
  if (!inRound) startRound();
});

// Update the preview position for tower placement when moving the mouse
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  previewPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
});

// When the mouse leaves the canvas, clear the preview position
canvas.addEventListener("mouseleave", () => {
  previewPos = null;
});

// Mouse click on canvas: either select an existing tower or place a new tower
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
      placingTowerType = null; // cancel tower placement if a tower is selected
      updateToolbar();
      break;
    }
  }
  
  if (!clickedOnTower) {
    if (placingTowerType) {
      towers.push(new Tower(clickPos, placingTowerType));
      placingTowerType = null;
      updateToolbar();
    } else {
      // If click isn't on an existing tower and no tower is selected for placement, deselect any selected tower
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
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  
  // Draw background and enemy path
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawPath();
  
  // Wave system: spawn enemies if a round is active and there are still enemies left to spawn
  if (inRound && enemiesToSpawn > 0) {
    enemySpawnTimer++;
    if (enemySpawnTimer >= 60) {
      const enemyType = randomEnemyType();
      enemies.push(new Enemy(enemyType));
      enemySpawnTimer = 0;
      enemiesToSpawn--;
    }
  }
  
  // Update all game objects
  towers.forEach(tower => tower.update());
  enemies.forEach(enemy => enemy.update());
  projectiles.forEach(proj => proj.update());
  
  // Remove inactive projectiles
  projectiles = projectiles.filter(p => p.active);
  
  // Remove enemies if they’re defeated or have reached the end of the path
  for (let i = enemies.length - 1; i >= 0; i--) {
    let enemy = enemies[i];
    if (enemy.health <= 0) {
      enemies.splice(i, 1);
    } else if (enemy.targetIndex >= enemy.path.length) {
      playerHealth--;
      enemies.splice(i, 1);
    }
  }
  
  // End the round if all enemies have been spawned and eliminated
  if (inRound && enemiesToSpawn === 0 && enemies.length === 0) {
    inRound = false;
    updateToolbar();
  }
  
  // Draw game objects
  towers.forEach(tower => tower.draw(tower === selectedTower));
  enemies.forEach(enemy => enemy.draw());
  projectiles.forEach(proj => proj.draw());
  
  // If a tower is being placed, render a transparent preview with its attack radius
  if (placingTowerType && previewPos) {
    let tempRange, tempColor;
    if (placingTowerType === "basic") {
      tempRange = 100;
      tempColor = "rgba(0,0,255,0.3)";
    } else if (placingTowerType === "sniper") {
      tempRange = 150;
      tempColor = "rgba(128,0,128,0.3)";
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
  
  // Draw HUD (Health and Current Round)
  ctx.fillStyle = "black";
  ctx.font = "20px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Health: " + playerHealth, 10, 30);
  ctx.fillText("Round: " + currentRound, 10, 60);
  
  requestAnimationFrame(gameLoop);
}

// Initialize toolbar and start the game loop
updateToolbar();
gameLoop();
