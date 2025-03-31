// Get a reference to the canvas and its drawing context
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Game states: "home", "playing", "gameover"
let state = "home";
let towers = [];
let enemies = [];
let projectiles = [];
let enemySpawnTimer = 0;
const enemySpawnInterval = 120; // spawn an enemy every 120 frames (roughly 2 seconds @ 60 FPS)
let playerHealth = 10;

// Define a fixed enemy path
const PATH = [
  { x: 50,  y: 50 },
  { x: 750, y: 50 },
  { x: 750, y: 550 },
  { x: 50,  y: 550 },
  { x: 50,  y: 300 }
];

/*------------------------------------
  Classes
------------------------------------*/

// Enemy class – follows the PATH and carries health
class Enemy {
  constructor() {
    this.path = [...PATH]; // create a shallow copy of the path array
    this.pos = { ...this.path[0] };
    this.targetIndex = 1; // next point in the path
    this.speed = 1.0;
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.radius = 10;
  }
  
  update() {
    if (this.targetIndex >= this.path.length) return;
    const target = this.path[this.targetIndex];
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const distance = Math.hypot(dx, dy);
    if (distance !== 0) {
      const vx = dx / distance;
      const vy = dy / distance;
      this.pos.x += vx * this.speed;
      this.pos.y += vy * this.speed;
    }
    // Move to the next waypoint if close enough
    if (distance < this.speed) {
      this.targetIndex++;
    }
  }
  
  draw() {
    // Draw enemy as a red circle
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw a health bar above the enemy
    const barWidth = 20;
    const barHeight = 4;
    const healthRatio = this.health / this.maxHealth;
    ctx.fillStyle = "black";
    ctx.fillRect(this.pos.x - barWidth / 2, this.pos.y - this.radius - 10, barWidth, barHeight);
    ctx.fillStyle = "green";
    ctx.fillRect(this.pos.x - barWidth / 2, this.pos.y - this.radius - 10, barWidth * healthRatio, barHeight);
  }
}

// Tower class – placed by the player; automatically fires at enemies
class Tower {
  constructor(pos) {
    this.pos = { ...pos };
    this.range = 100;
    this.damage = 20;
    this.level = 1;
    this.cooldown = 60; // in frames
    this.timer = 0;     // countdown timer before shooting
  }
  
  update() {
    if (this.timer > 0) {
      this.timer--;
    }
    
    // Find the closest enemy that is within range
    let target = null;
    let minDist = Infinity;
    enemies.forEach(enemy => {
      const dist = Math.hypot(enemy.pos.x - this.pos.x, enemy.pos.y - this.pos.y);
      if (dist < this.range && dist < minDist) {
        minDist = dist;
        target = enemy;
      }
    });
    
    // Fire a projectile if an enemy is found and the tower is off cooldown
    if (target && this.timer <= 0) {
      projectiles.push(new Projectile(this.pos, target, this.damage));
      this.timer = this.cooldown;
    }
  }
  
  draw(selected = false) {
    ctx.fillStyle = selected ? "grey" : "blue";
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // If selected, draw the detection range
    if (selected) {
      ctx.strokeStyle = "grey";
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw the current upgrade level at the center of the tower
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.level, this.pos.x, this.pos.y);
  }
  
  // Check if a given position (e.g., mouse click) is on the tower
  isClicked(clickPos) {
    return Math.hypot(clickPos.x - this.pos.x, clickPos.y - this.pos.y) <= 15;
  }
  
  // Upgrade the tower's abilities
  upgrade() {
    this.level++;
    this.damage += 10;
    this.range += 10;
    this.cooldown = Math.max(20, this.cooldown - 5);
  }
}

// Projectile class – spawned by towers and moves toward an enemy target
class Projectile {
  constructor(startPos, target, damage) {
    this.pos = { ...startPos };
    this.target = target;
    this.damage = damage;
    this.speed = 5;
    // Calculate movement vector toward the target's position
    const dx = target.pos.x - startPos.x;
    const dy = target.pos.y - startPos.y;
    const distance = Math.hypot(dx, dy);
    if (distance !== 0) {
      this.dx = dx / distance;
      this.dy = dy / distance;
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
    
    // Simple collision check with the target enemy
    if (Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.y - this.pos.y) < (this.radius + this.target.radius)) {
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

/*------------------------------------
  Screen Rendering Functions
------------------------------------*/

function drawHomeScreen() {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "black";
  ctx.font = "32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Tower Defense Game", WIDTH / 2, HEIGHT / 3);
  ctx.font = "24px Arial";
  ctx.fillText("Press Enter to Start", WIDTH / 2, HEIGHT / 3 + 50);
}

function drawGameOverScreen() {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "black";
  ctx.font = "32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Game Over", WIDTH / 2, HEIGHT / 2 - 30);
  ctx.font = "24px Arial";
  ctx.fillText("Press R to Restart", WIDTH / 2, HEIGHT / 2 + 10);
}

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

/*------------------------------------
  Main Game Loop
------------------------------------*/

function gameLoop() {
  // Clear the canvas completely
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  
  if (state === "home") {
    drawHomeScreen();
  } else if (state === "playing") {
    // Draw background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Draw the enemy path for visualization
    drawPath();
    
    // Increment the enemy spawn timer
    enemySpawnTimer++;
    if (enemySpawnTimer >= enemySpawnInterval) {
      enemies.push(new Enemy());
      enemySpawnTimer = 0;
    }
    
    // Update towers so they can look for enemies and fire
    towers.forEach(tower => tower.update());
    // Update enemies along the path
    enemies.forEach(enemy => enemy.update());
    // Update projectiles moving toward targets
    projectiles.forEach(proj => proj.update());
    
    // Remove projectiles that have hit their target
    projectiles = projectiles.filter(proj => proj.active);
    
    // Remove enemies that are defeated or have reached the end of the path
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      if (enemy.health <= 0) {
        enemies.splice(i, 1);
      } else if (enemy.targetIndex >= enemy.path.length) {
        playerHealth--;
        enemies.splice(i, 1);
      }
    }
    
    // Draw towers, enemies, and projectiles
    towers.forEach(tower => tower.draw());
    enemies.forEach(enemy => enemy.draw());
    projectiles.forEach(proj => proj.draw());
    
    // Draw the player's remaining health
    ctx.fillStyle = "black";
    ctx.font = "20px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Health: " + playerHealth, 10, 30);
    
    // Check for game over condition
    if (playerHealth <= 0) {
      state = "gameover";
    }
  } else if (state === "gameover") {
    drawGameOverScreen();
  }
  
  requestAnimationFrame(gameLoop);
}

/*------------------------------------
  Event Handlers
------------------------------------*/

// Restart the game (reset variables)
function restartGame() {
  towers = [];
  enemies = [];
  projectiles = [];
  enemySpawnTimer = 0;
  playerHealth = 10;
}

// Handle keydown events
document.addEventListener("keydown", (e) => {
  if (state === "home" && e.key === "Enter") {
    state = "playing";
  } else if (state === "gameover" && (e.key === "r" || e.key === "R")) {
    restartGame();
    state = "playing";
  }
});

// Handle mouse clicks for placing new towers or upgrading existing ones
canvas.addEventListener("click", (e) => {
  if (state !== "playing") return;
  
  const rect = canvas.getBoundingClientRect();
  const clickPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  
  // Check if the click is on an existing tower
  const clickedTower = towers.find(tower => tower.isClicked(clickPos));
  if (clickedTower) {
    clickedTower.upgrade();
  } else {
    towers.push(new Tower(clickPos));
  }
});

// Start the game loop
gameLoop();
