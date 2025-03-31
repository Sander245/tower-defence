/*****************************
  GLOBAL VARIABLES & SETUP
*****************************/
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Arrays for towers, enemies, projectiles
let towers = [];
let enemies = [];
let projectiles = [];

// Wave/round variables
let currentRound = 0;
let inRound = false;
let enemySpawnTimer = 0;
let enemySpawnInterval = 60; // frames between spawns
let enemiesToSpawn = 0;
let playerHealth = 10;

// Tower placement and selection states
let placingTowerType = null; // "basic" or "sniper" when selected
let previewPos = null; // current mouse position (for tower preview)
let selectedTower = null; // a tower if clicked for editing

// DOM Elements from the toolbar
const toolbarContent = document.getElementById("toolbar-content");
const startRoundButton = document.getElementById("startRoundButton");

// Define the fixed enemy path (a list of waypoints)
const PATH = [
  { x: 50, y: 50 },
  { x: 750, y: 50 },
  { x: 750, y: 550 },
  { x: 50, y: 550 },
  { x: 50, y: 300 }
];

/*****************************
      CLASSES
******************************/

/*–– Enemy Class ––  
   This version supports three enemy types:  
     • "basic": standard enemy  
     • "fast": quicker but with lower health  
     • "tank": slower but with high health  
*/
class Enemy {
  constructor(type) {
    this.path = [...PATH];
    this.pos = { ...this.path[0] };
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
    
    // Simple health bar above enemy
    const barWidth = 20, barHeight = 4;
    const healthRatio = this.health / this.maxHealth;
    ctx.fillStyle = "black";
    ctx.fillRect(this.pos.x - barWidth/2, this.pos.y - this.radius - 10, barWidth, barHeight);
    ctx.fillStyle = "green";
    ctx.fillRect(this.pos.x - barWidth/2, this.pos.y - this.radius - 10, barWidth * healthRatio, barHeight);
  }
}

/*–– Tower (Defender) Class ––  
   Supports multiple types. In this example:
     • "basic": moderate range & rate-of-fire  
     • "sniper": longer range & higher damage
*/
class Tower {
  constructor(pos, type) {
    this.pos = { ...pos };
    this.type = type;
    this.level = 1;
    this.timer = 0;

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
    // Find the closest enemy within range
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
      projectiles.push(new Projectile(this.pos, target, this.damage));
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
    // Display level in the center of the tower
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.level, this.pos.x, this.pos.y);
  }
  
  isClicked(clickPos) {
    const dx = clickPos.x - this.pos.x;
    const dy = clickPos.y - this.pos.y;
    return Math.hypot(dx, dy) <= this.radius;
  }
  
  upgrade() {
    this.level++;
    this.damage += Math.floor(this.damage * 0.5);
    this.range += 10;
    this.cooldown = Math.max(20, this.cooldown - 5);
  }
}

/*–– Projectile Class ––  
   Fired by towers toward an enemy target.
*/
class Projectile {
  constructor(startPos, target, damage) {
    this.pos = { ...startPos };
    this.target = target;
    this.damage = damage;
    this.speed = 5;
    const dx = target.pos.x - startPos.x;
    const dy = target.pos.y - startPos.y;
    const dist = Math.hypot(dx, dy);
    if (dist) {
      this.dx = dx / dist;
      this.dy = dy / dist;
    } else {
      this.dx = this.dy = 0;
    }
    this.radius = 5;
    this.active = true;
  }
  
  update() {
    this.pos.x += this.dx * this.speed;
    this.pos.y += this.dy * this.speed;
    // A simple collision-check
    if (
      Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.y - this.pos.y) <
      this.radius + this.target.radius
    ) {
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
/*–– Start a new round ––  
   Increases the round number and sets the enemy spawn count.
*/
function startRound() {
  currentRound++;
  inRound = true;
  enemiesToSpawn = 5 + currentRound * 2;
  enemySpawnTimer = 0;
  updateToolbar();
}

/*–– Randomly choose an enemy type ––  
   Early rounds use only "basic" enemies. Later rounds use a mix.
*/
function randomEnemyType() {
  if (currentRound < 3) return "basic";
  let roll = Math.random();
  if (roll < 0.6) return "basic";
  else if (roll < 0.9) return "fast";
  else return "tank";
}

/*****************************
       TOOLBAR (UI) 
*****************************/
/*–– updateToolbar ––  
   Changes the toolbar’s innerHTML depending on whether a tower is selected.
   When no tower is selected, it shows the shop items.
*/
function updateToolbar() {
  if (selectedTower) {
    toolbarContent.innerHTML = `
      <h3>Defender Options</h3>
      <div><strong>Type:</strong> ${selectedTower.type}</div>
      <div><strong>Level:</strong> ${selectedTower.level}</div>
      <div><strong>Damage:</strong> ${selectedTower.damage}</div>
      <div><strong>Range:</strong> ${selectedTower.range}</div>
      <button id="upgradeButton">Upgrade</button>
      <button id="deleteButton">Delete</button>
      <button id="cancelSelectionButton">Cancel</button>
    `;
    document.getElementById("upgradeButton").addEventListener("click", () => {
      selectedTower.upgrade();
      updateToolbar();
    });
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
  
  // Hide the Start Round button if a round is active.
  startRoundButton.style.display = inRound ? "none" : "block";
}

/*–– Event listener for the "Start Round" button ––*/
startRoundButton.addEventListener("click", () => {
  if (!inRound) startRound();
});

/*****************************
         MOUSE EVENTS
*****************************/
// Update preview position for tower placement on mouse move.
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  previewPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
});

// Clear the preview when mouse leaves the canvas.
canvas.addEventListener("mouseleave", () => {
  previewPos = null;
});

// On mouse click, either select an existing tower or place a new one.
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  
  let clickedOnTower = false;
  for (let tower of towers) {
    if (tower.isClicked(clickPos)) {
      selectedTower = tower;
      clickedOnTower = true;
      placingTowerType = null; // cancel placement if any
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
      // If clicking empty space without an active placement,
      // deselect any selected tower.
      selectedTower = null;
      updateToolbar();
    }
  }
});

/*****************************
         RENDERING
*****************************/
// Draw the static enemy path.
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

/*–– gameLoop ––  
   Handles enemy spawns (if a round is going on), updates all game objects, 
   draws towers, enemies, projectiles, and—if a defender is awaiting placement—
   shows a transparent preview of the defender and its attack range.
*/
function gameLoop() {
  // Clear canvas
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  // Draw background & path
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawPath();
  
  // Wave system logic: spawn enemies if in a round
  if (inRound && enemiesToSpawn > 0) {
    enemySpawnTimer++;
    if (enemySpawnTimer >= enemySpawnInterval) {
      const enemyType = randomEnemyType();
      enemies.push(new Enemy(enemyType));
      enemySpawnTimer = 0;
      enemiesToSpawn--;
    }
  }
  
  // Update game objects
  towers.forEach(tower => tower.update());
  enemies.forEach(enemy => enemy.update());
  projectiles.forEach(proj => proj.update());
  
  // Clean-up inactive projectiles.
  projectiles = projectiles.filter(p => p.active);
  
  // Remove enemies if they’re defeated or have reached the end.
  for (let i = enemies.length - 1; i >= 0; i--) {
    let enemy = enemies[i];
    if (enemy.health <= 0) {
      enemies.splice(i, 1);
    } else if (enemy.targetIndex >= enemy.path.length) {
      playerHealth--;
      enemies.splice(i, 1);
    }
  }
  
  // End the round if all enemies have been spawned and eliminated.
  if (inRound && enemiesToSpawn === 0 && enemies.length === 0) {
    inRound = false;
    updateToolbar();
  }
  
  // Draw game objects.
  towers.forEach(tower => tower.draw(tower === selectedTower));
  enemies.forEach(enemy => enemy.draw());
  projectiles.forEach(proj => proj.draw());
  
  // If in tower placement mode, draw the preview at the current mouse position.
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
  
  // Draw HUD info (player health and current round)
  ctx.fillStyle = "black";
  ctx.font = "20px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Health: " + playerHealth, 10, 30);
  ctx.fillText("Round: " + currentRound, 10, 60);
  
  requestAnimationFrame(gameLoop);
}

// Initialize toolbar and start the loop.
updateToolbar();
gameLoop();
