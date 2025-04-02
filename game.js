/*****************************
  GLOBAL VARIABLES & SETUP
*****************************/
const canvas = document.getElementById("gameCanvas"),
      ctx = canvas.getContext("2d"),
      WIDTH = canvas.width,
      HEIGHT = canvas.height;

const gameContainer = document.getElementById("gameContainer");

// Menu screen elements from the HTML:
const titleScreen = document.getElementById("titleScreen");
const creditsScreen = document.getElementById("creditsScreen");
const upgradeShopScreen = document.getElementById("upgradeShopScreen");
const upgradeShopContent = document.getElementById("upgradeShopContent");
const gameOverScreen = document.getElementById("gameOverScreen");
const settingsScreen = document.getElementById("settingsScreen");

const startGameButton = document.getElementById("startGameButton");
const creditsButton = document.getElementById("creditsButton");
const upgradesButton = document.getElementById("upgradesButton");
const settingsButton = document.getElementById("settingsButton");
const backFromCreditsButton = document.getElementById("backFromCreditsButton");
const backFromUpgradeButton = document.getElementById("backFromUpgradeButton");
const backToTitleButton = document.getElementById("backToTitleButton");
const applySettingsButton = document.getElementById("applySettingsButton");
const backFromSettingsButton = document.getElementById("backFromSettingsButton");

const startRoundButton = document.getElementById("startRoundButton");
const toolbarContent = document.getElementById("toolbar-content");

// Our castle
const castle = { x: 20, y: 240, width: 80, height: 80 };
const castleImage = new Image();
castleImage.src = "https://raw.githubusercontent.com/Sander245/tower-defence/main/low-taper-fade.png";

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
    gameSpeed = 1, // starting speed
    gameSpeedModifier = 1, // new performance modifier
    autoStart = false,
    gameOver = false,
    theme = "light", // theme setting
    coinsEarnedThisGame = 0; // track coins earned in current game

let towerCosts = {
  "basic": 50,
  "sniper": 75,
  "splash": 100,
  "slow": 80,
  "smart": 120,
  "laser": 85
};

const PATH = [
  { x: 50, y: 50 },
  { x: 750, y: 50 },
  { x: 750, y: 550 },
  { x: 50, y: 550 },
  { x: 50, y: 300 }
];

/****************** Persistent Upgrades & Coins ******************/
let coins = 0; // upgrade currency
let startingCashBonus = 0;
let enemyHealthMultiplier = 1;
let gameSpeedMax = 2;
let waveCoinsBonus = 2;
let towerBulletSpeedBonus = 0; // New global variable for bullet speed bonus
const BASE_CURRENCY = 150;

// Reduce base prices roughly by a factor of 10 (so 200 becomes 20, etc.)
let upgradeItems = {
  moreStartingCash: {
    id: "moreStartingCash",
    displayName: "More Starting Cash",
    description: "Increase starting cash for new games by +50 per level.",
    level: 0,
    maxLevel: 3,
    basePrice: 10,
    currentPrice: 10,
    multiple: true,
    effect: function () { startingCashBonus += 50; }
  },
  lowerEnemyHealth: {
    id: "lowerEnemyHealth",
    displayName: "Lower Enemy Health",
    description: "Lower enemy health by 10% per level.",
    level: 0,
    maxLevel: 3,
    basePrice: 15,
    currentPrice: 15,
    multiple: true,
    effect: function () { enemyHealthMultiplier *= 0.9; }
  },
  fasterBullets: {
    id: "fasterBullets",
    displayName: "Faster Bullets",
    description: "Increase bullet speed for all towers by 10% per level.",
    level: 0,
    maxLevel: 5,
    basePrice: 12,
    currentPrice: 12,
    multiple: true,
    effect: function () { towerBulletSpeedBonus += 0.1; }
  },
  fastGameSpeed: {
    id: "fastGameSpeed",
    displayName: "3x Gamespeed",
    description: "Unlocks a 3x gamespeed option.",
    level: 0,
    maxLevel: 1,
    basePrice: 20,
    currentPrice: 20,
    multiple: false,
    effect: function () { gameSpeedMax = 3; }
  },
  extraCoinsPerWave: {
    id: "extraCoinsPerWave",
    displayName: "Extra Coins Per Wave",
    description: "Increase coins earned per wave by +1 per level.",
    level: 0,
    maxLevel: 3,
    basePrice: 12,
    currentPrice: 12,
    multiple: true,
    effect: function () { waveCoinsBonus += 1; }
  }
};

loadGameProgress();

/* Global flag to disable coin earnings if console cheats are used */
let cheatsUsed = false;

/* Global vars for End Round confirmation */
let endRoundConfirm = false;
let endRoundTimeout = null;

/*****************************
         CLASSES
*****************************/
// (Enemy, Tower, Projectile, Pulse, CastleExplosion remain the same as before.)

class Enemy {
  constructor(type) {
    this.path = [...PATH];
    this.pos = { ...this.path[0] };
    this.targetIndex = 1;
    this.type = type;
    
    if (type === "basic") {
      this.speed = 0.4; // reduced from 0.6
      this.maxHealth = 90;
      this.radius = 10;
      this.color = "red";
      this.coinReward = Math.floor(10 * 0.5);
    } else if (type === "fast") {
      this.speed = 0.8; // reduced from 1.4
      this.maxHealth = 70;
      this.radius = 8;
      this.color = "orange";
      this.coinReward = Math.floor(15 * 0.5);
    } else if (type === "tank") {
      this.speed = 0.3; // reduced from 0.5
      this.maxHealth = 200;
      this.radius = 12;
      this.color = "brown";
      this.coinReward = Math.floor(20 * 0.5);
    } else if (type === "regenerator") {
      this.speed = 0.4; // reduced from 0.6
      this.maxHealth = 150;
      this.radius = 10;
      this.color = "teal";
      this.coinReward = Math.floor(25 * 0.5);
      this.attackCooldown = 180;
      this.lastAttack = -180;
    } else if (type === "boss") {
      this.speed = 0.2; // reduced from 0.3
      this.maxHealth = 1000;
      this.radius = 30;
      this.color = "black";
      this.coinReward = Math.floor(100 * 0.5);
    }
    
    let scale = 1 + (currentRound - 1) * 0.05;
    if (scale < 1) scale = 1;
    this.maxHealth = Math.floor(this.maxHealth * scale * enemyHealthMultiplier);
    this.health = this.maxHealth;
    
    this.baseSpeed = this.speed;
    this.slowTimer = 0;
  }
  
  update() {
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
    let effectiveSpeed = this.baseSpeed * gameSpeedModifier;
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
    let barW = 20, barH = 4, ratio = this.health / this.maxHealth;
    ctx.fillStyle = "black";
    ctx.fillRect(this.pos.x - barW/2, this.pos.y - this.radius - 10, barW, barH);
    ctx.fillStyle = "green";
    ctx.fillRect(this.pos.x - barW/2, this.pos.y - this.radius -10, barW * ratio, barH);
  }
}

class Tower {
  constructor(pos, type) {
    this.pos = { ...pos };
    this.type = type;
    this.level = 1;
    this.timer = 0;
    this.maxUpgrades = 3;
    this.specialAbilityUnlocked = false;
    this.attackSlowTimer = 0;
    this.bulletSpeedLevel = 0; // This is now only modified globally
    this.laserAlpha = 0; // For laser tower visual effect
    this.laserTarget = null; // For storing laser target
    
    if (type === "basic") {
      this.range = 100; this.damage = 20; this.cooldown = 60; this.color = "blue";
    } else if (type === "sniper") {
      this.range = 150; this.damage = 40; this.cooldown = 120; this.color = "purple";
    } else if (type === "splash") {
      this.range = 120; this.damage = 25; this.cooldown = 78; this.color = "green";
    } else if (type === "slow") {
      this.range = 80; this.damage = 10; this.cooldown = 50; this.color = "cyan";
    } else if (type === "smart") {
      this.range = 180; this.damage = 15; this.cooldown = 40; this.color = "gold";
    } else if (type === "laser") {
      this.range = 130; this.damage = 35; this.cooldown = 90; this.color = "orangered";
    }
    this.radius = 15;
    this.bulletSpeed = 2.5 + towerBulletSpeedBonus; // Base bullet speed with global bonus
  }
  
  update() {
    if (this.timer > 0) this.timer--;
    if (this.attackSlowTimer > 0) { this.attackSlowTimer--; return; }
    
    // Handle laser effect fade out
    if (this.type === "laser" && this.laserAlpha > 0) {
      this.laserAlpha -= 0.1;
    }
    
    let target = null, minDist = Infinity;
    for (let enemy of enemies) {
      let d = Math.hypot(enemy.pos.x - this.pos.x, enemy.pos.y - this.pos.y);
      if (d <= this.range && d < minDist) { minDist = d; target = enemy; }
    }
    if (target && this.timer <= 0) {
      if (this.type === "splash") {
        pulses.push(new Pulse(this.pos, this.range, this.damage, 30));
      } else if (this.type === "laser") {
        // Direct damage to target - no projectile needed
        target.health -= this.damage;
        // Set laser effect properties
        this.laserTarget = target;
        this.laserAlpha = 1.0;
      } else if (this.type === "smart") {
        const speed = this.bulletSpeed + this.bulletSpeedLevel * 0.5,
              dx = target.pos.x - this.pos.x,
              dy = target.pos.y - this.pos.y,
              distance = Math.hypot(dx, dy),
              t = distance / speed,
              wp = target.path[target.targetIndex] || target.pos,
              dx_e = wp.x - target.pos.x,
              dy_e = wp.y - target.pos.y,
              dEnemy = Math.hypot(dx_e, dy_e) || 1,
              predictedPos = {
                x: target.pos.x + (dx_e/dEnemy)*t,
                y: target.pos.y + (dy_e/dEnemy)*t
              };
        projectiles.push(new Projectile(this.pos, target, this.damage, speed, "smart", predictedPos));
      } else if (this.type === "slow") {
        projectiles.push(new Projectile(this.pos, target, this.damage, this.bulletSpeed + this.bulletSpeedLevel * 0.5, "slow"));
      } else {
        const bulletSpeed = (this.type === "sniper") ? 
          this.bulletSpeed + 1 + this.bulletSpeedLevel * 0.5 : 
          this.bulletSpeed + this.bulletSpeedLevel * 0.5;
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
    
    // Draw laser effect
    if (this.type === "laser" && this.laserAlpha > 0 && this.laserTarget) {
      // Create a "static" effect with random offsets
      const staticEffect = Math.random() * 2 - 1;
      const offsetX = staticEffect;
      const offsetY = staticEffect;
      
      // Draw the laser beam
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(
        this.laserTarget.pos.x + offsetX, 
        this.laserTarget.pos.y + offsetY
      );
      
      // Create gradient for better visual effect
      const gradient = ctx.createLinearGradient(
        this.pos.x, this.pos.y, 
        this.laserTarget.pos.x, this.laserTarget.pos.y
      );
      
      gradient.addColorStop(0, `rgba(255, 255, 0, ${this.laserAlpha})`);
      gradient.addColorStop(0.5, `rgba(255, 200, 0, ${this.laserAlpha * 0.8})`);
      gradient.addColorStop(1, `rgba(255, 255, 0, ${this.laserAlpha})`);
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2 + Math.random() * 2; // Variable width for effect
      ctx.stroke();
    }
    
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
    if (stat === "damage") this.damage += Math.floor(this.damage * 0.5);
    else if (stat === "range") this.range += 10;
    else if (stat === "cooldown") this.cooldown = Math.max(20, this.cooldown - 10);
    this.level++;
    updateToolbar();
  }
}

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
    // Use the correct calculation for direction vector
    this.dx = dist ? dx/dist : 0;
    this.dy = dist ? dy/dist : 0;
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

class CastleExplosion {
  constructor(cx, cy, maxRadius, duration) {
    this.cx = cx;
    this.cy = cy;
    this.maxRadius = maxRadius;
    this.duration = duration;
    this.frame = 0;
    this.currentRadius = 0;
  }
  update() {
    this.frame++;
    let t = this.frame / this.duration;
    this.currentRadius = t * this.maxRadius;
    enemies.forEach(enemy => {
      let d = Math.hypot(enemy.pos.x - this.cx, enemy.pos.y - this.cy);
      if (d < this.currentRadius) {
        enemy.health = 0;
      }
    });
    towers = towers.filter(tower => {
      let d = Math.hypot(tower.pos.x - this.cx, tower.pos.y - this.cy);
      return d >= this.currentRadius;
    });
  }
  draw() {
    let alpha = 1 - (this.frame/this.duration);
    ctx.fillStyle = "rgba(255,100,0,"+alpha+")";
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.currentRadius, 0, Math.PI*2);
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
             <div><strong>Bullet Speed:</strong> ${(selectedTower.bulletSpeed + towerBulletSpeedBonus).toFixed(1)}</div>
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
    if (currentRound >= 20) {
      html += `<button class="shop-item" data-type="laser">Laser Defender ($85)</button>`;
    }
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
  
  // Global controls: Auto‑Start checkbox, Speed Toggle button, and End Round button.
  html += `<div class="global-controls" style="margin-top: 10px; text-align: center;">
             <label><input type="checkbox" id="autoStartCheckbox" ${autoStart ? "checked" : ""}>
             Auto-Start Rounds</label>
             <br>
             <button id="speedToggleButton" style="margin-top: 5px;">${gameSpeed + "x Speed"}</button>
             <br>
             <button id="endRoundButton" style="margin-top: 5px;">End Round</button>
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
      if (confirm("Are you sure you want to delete this tower?")) {
        currency += Math.floor(towerCosts[selectedTower.type] * 0.75);
        towers = towers.filter(t => t !== selectedTower);
        selectedTower = null;
        updateToolbar();
      }
    });
    document.getElementById("cancelSelectionButton").addEventListener("click", () => { selectedTower = null; updateToolbar(); });
  } else {
    document.querySelectorAll(".shop-item").forEach(item => {
      item.addEventListener("click", () => { placingTowerType = item.getAttribute("data-type"); });
    });
  }
  
  let autoCheckbox = document.getElementById("autoStartCheckbox");
  if (autoCheckbox) {
    autoCheckbox.addEventListener("change", function() { autoStart = this.checked; });
  }
  
  let speedBtn = document.getElementById("speedToggleButton");
  if (speedBtn) {
    speedBtn.addEventListener("click", function() {
      if (gameSpeed >= gameSpeedMax) { gameSpeed = 1; }
      else { gameSpeed++; }
      updateToolbar();
    });
  }
  
  let endRoundBtn = document.getElementById("endRoundButton");
  if (endRoundBtn) {
    endRoundBtn.addEventListener("click", function() {
      if (!endRoundConfirm) {
        endRoundConfirm = true;
        this.textContent = "Confirm End Round";
        endRoundTimeout = setTimeout(() => {
          endRoundConfirm = false;
          this.textContent = "End Round";
        }, 2000);
      } else {
        clearTimeout(endRoundTimeout);
        triggerEndRound();
        this.textContent = "End Round";
        endRoundConfirm = false;
      }
    });
  }
  
  startRoundButton.style.display = inRound ? "none" : "block";
}

function attemptUpgrade(tower, stat) {
  let cost;
  if (tower.level < tower.maxUpgrades) {
    cost = 40;
  } else {
    cost = 60;
  }
  
  if (currency >= cost) { 
    currency -= cost; 
    tower.upgrade(stat); 
  }
  else alert("Not enough currency for upgrade!");
  updateToolbar();
}

/* Trigger end round: set castle health to 0 and trigger explosion */
function triggerEndRound() {
  if (playerHealth > 0) {
    playerHealth = 0;
    if (!castleExplosion) {
      castleExplosion = new CastleExplosion(castle.x + castle.width/2, castle.y + castle.height/2, 1000, 60);
    }
  }
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
      <li>set health [amount]</li>
      <li>start wave [number]</li>
      <li>spawn enemies [count]</li>
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
      if (!isNaN(amount)) { currency = amount; updateToolbar(); cheatsUsed = true; }
    } else if (parts[1] === "gamespeed") {
      let speed = parseInt(parts[2]);
      if (!isNaN(speed) && speed > 0) { gameSpeed = speed; cheatsUsed = true; }
    } else if (parts[1] === "health") {
      let newHealth = parseInt(parts[2]);
      if (!isNaN(newHealth)) { playerHealth = newHealth; updateToolbar(); cheatsUsed = true; }
    }
  } else if(parts[0] === "start" && parts[1] === "wave") {
    let waveNum = parseInt(parts[2]);
    if (!isNaN(waveNum)) { currentRound = waveNum - 1; startRound(); cheatsUsed = true; }
  } else if (parts[0] === "spawn" && parts[1] === "enemies") {
    let count = parseInt(parts[2]);
    if (!isNaN(count)) {
      for (let i = 0; i < count; i++) { enemies.push(new Enemy(randomEnemyType())); }
      cheatsUsed = true;
    }
  }
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
      selectedTower = tower; clickedOnTower = true; placingTowerType = null; updateToolbar();
      break;
    }
  if (!clickedOnTower) {
    if (placingTowerType) {
      let cost = towerCosts[placingTowerType];
      if (currency >= cost) { currency -= cost; towers.push(new Tower(clickPos, placingTowerType)); }
      else alert("Not enough currency!");
      placingTowerType = null; updateToolbar();
    } else {
      selectedTower = null; updateToolbar();
    }
  }
});

/*****************************
       UPDATE & DRAW FUNCTIONS
*****************************/
function updateGameState() {
  if (playerHealth <= 0) {
    if (!castleExplosion) {
      autoStart = false;
      gameSpeed = 1;
      updateToolbar();
      castleExplosion = new CastleExplosion(castle.x + castle.width/2, castle.y + castle.height/2, 1000, 60);
    } else {
      castleExplosion.update();
      if (castleExplosion.isDone()) {
         enemies = [];
         document.getElementById("coinsEarnedDisplay").textContent = `You earned ${coinsEarnedThisGame} coins this game!`;
         gameOverScreen.style.display = "flex";
         gameContainer.style.display = "none";
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
  
  for (let i = enemies.length - 1; i >= 0; i--) {
    let enemy = enemies[i];
    if (enemy.health <= 0) {
      if (enemy.type === "tank") {
        let newEnemy = new Enemy("basic");
        newEnemy.pos = { ...enemy.pos };
        newEnemy.targetIndex = enemy.targetIndex;
        enemies.push(newEnemy);
      } else if (enemy.type === "boss") {
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
  
  if (inRound && enemiesToSpawn === 0 && enemies.length === 0) {
    currency += 5;
    if (!cheatsUsed) { 
      coins += waveCoinsBonus; 
      coinsEarnedThisGame += waveCoinsBonus;
    }
    inRound = false;
    updateToolbar();
    saveGameProgress();
    if (autoStart) { setTimeout(startRound, 1000); }
  }
}

function drawGame() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawPath();
  
  towers.forEach(t => t.draw(t === selectedTower));
  enemies.forEach(e => e.draw());
  projectiles.forEach(p => p.draw());
  pulses.forEach(pulse => pulse.draw());
  
  if (placingTowerType && previewPos) {
    let tempRange, tempColor;
    if (placingTowerType === "basic") { tempRange = 100; tempColor = "rgba(0,0,255,0.3)"; }
    else if (placingTowerType === "sniper") { tempRange = 150; tempColor = "rgba(128,0,128,0.3)"; }
    else if (placingTowerType === "splash") { tempRange = 120; tempColor = "rgba(0,128,0,0.3)"; }
    else if (placingTowerType === "slow") { tempRange = 80; tempColor = "rgba(0,255,255,0.3)"; }
    else if (placingTowerType === "smart") { tempRange = 180; tempColor = "rgba(255,215,0,0.3)"; }
    else if (placingTowerType === "laser") { tempRange = 130; tempColor = "rgba(255,105,0,0.3)"; }
    ctx.fillStyle = tempColor;
    ctx.beginPath();
    ctx.arc(previewPos.x, previewPos.y, 15, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = tempColor;
    ctx.beginPath();
    ctx.arc(previewPos.x, previewPos.y, tempRange, 0, Math.PI*2);
    ctx.stroke();
  }
  
  ctx.fillStyle = "black";
  ctx.font = "20px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Health: " + playerHealth, 10, 30);
  ctx.fillText("Round: " + currentRound, 10, 60);
  ctx.fillText("Currency: $" + currency, 10, 90);
  
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
       MENU & SCREEN HANDLERS
*****************************/
document.getElementById("startGameButton").addEventListener("click", function() {
  titleScreen.style.display = "none";
  gameContainer.style.display = "flex";
  resetGame();
});
document.getElementById("creditsButton").addEventListener("click", function() {
  titleScreen.style.display = "none";
  creditsScreen.style.display = "flex";
});
document.getElementById("upgradesButton").addEventListener("click", function() {
  titleScreen.style.display = "none";
  updateUpgradeShopUI();
  upgradeShopScreen.style.display = "flex";
});
document.getElementById("settingsButton").addEventListener("click", function() {
  showSettingsPanel();
});
document.getElementById("backFromCreditsButton").addEventListener("click", function() {
  creditsScreen.style.display = "none";
  titleScreen.style.display = "flex";
});
document.getElementById("backFromUpgradeButton").addEventListener("click", function() {
  upgradeShopScreen.style.display = "none";
  titleScreen.style.display = "flex";
});
document.getElementById("backToTitleButton").addEventListener("click", function() {
  gameOverScreen.style.display = "none";
  titleScreen.style.display = "flex";
  resetGame(); // Add this line to ensure game state is reset properly
});

document.getElementById("applySettingsButton").addEventListener("click", function() {
  theme = document.getElementById("themeSelector").value;
  applySettings();
});
document.getElementById("backFromSettingsButton").addEventListener("click", function() {
  settingsScreen.style.display = "none";
  titleScreen.style.display = "flex";
});

document.getElementById("gameSpeedSlider").addEventListener("input", function() {
  document.getElementById("gameSpeedValue").textContent = parseFloat(this.value).toFixed(2) + "x";
});

/*****************************
      UPGRADE SHOP UI FUNCTIONS
*****************************/
function updateUpgradeShopUI() {
  let html = `<div style="font-size: 20px; margin-bottom: 20px;">Coins: ${coins}</div>`;
  html += `<div>`;
  for (let key in upgradeItems) {
    let item = upgradeItems[key];
    let progressPercent = (item.level / item.maxLevel) * 100;
    html += `
      <div class="upgradeCard">
        <h2>${item.displayName}</h2>
        <p>${item.description}</p>
        <p>Level: ${item.level} / ${item.maxLevel}</p>
        <progress value="${item.level}" max="${item.maxLevel}"></progress>
        <p>Price: ${item.level < item.maxLevel ? item.currentPrice : 'Maxed'}</p>`;
    if (item.level < item.maxLevel) {
      html += `<button onclick="buyUpgrade('${key}')">Buy Upgrade</button>`;
    } else {
      html += `<button disabled>Maxed Out</button>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  upgradeShopContent.innerHTML = html;
}

function buyUpgrade(itemId) {
  let item = upgradeItems[itemId];
  if (item.level >= item.maxLevel) {
    alert("This upgrade is maxed out.");
    return;
  }
  if (coins < item.currentPrice) {
    alert("Not enough coins!");
    return;
  }
  coins -= item.currentPrice;
  item.level++;
  item.effect();
  if (item.level < item.maxLevel && item.multiple) {
    item.currentPrice = Math.floor(item.currentPrice * 1.5);
  }
  saveGameProgress();
  updateUpgradeShopUI();
}

/*****************************
       SETTINGS PANEL
*****************************/
function showSettingsPanel() {
  titleScreen.style.display = "none";
  settingsScreen.style.display = "flex";
}

function applySettings() {
  // Apply theme
  document.body.classList = theme;
  
  // Apply game speed modifier
  gameSpeedModifier = parseFloat(document.getElementById("gameSpeedSlider").value);
  
  saveSettings();
  settingsScreen.style.display = "none";
  titleScreen.style.display = "flex";
}

function saveSettings() {
  let settings = {
    theme: theme,
    gameSpeedModifier: gameSpeedModifier
  };
  localStorage.setItem("gameSettings", JSON.stringify(settings));
}

function loadSettings() {
  let settings = localStorage.getItem("gameSettings");
  if (settings) {
    settings = JSON.parse(settings);
    theme = settings.theme || "light";
    gameSpeedModifier = settings.gameSpeedModifier || 1;
    document.body.classList = theme;
    if (document.getElementById("gameSpeedSlider")) {
      document.getElementById("gameSpeedSlider").value = gameSpeedModifier;
    }
    if (document.getElementById("themeSelector")) {
      document.getElementById("themeSelector").value = theme;
    }
  }
}

/*****************************
       RESET & PERSISTENCE
*****************************/
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
  currency = BASE_CURRENCY + startingCashBonus;
  placingTowerType = null;
  previewPos = null;
  selectedTower = null;
  frameCount = 0;
  gameSpeed = 1;
  autoStart = false;
  gameOver = false;
  castleExplosion = null;
  coinsEarnedThisGame = 0;
  updateToolbar();
}

function saveGameProgress() {
  let upgradesData = {};
  for (let key in upgradeItems) {
    upgradesData[key] = {
      level: upgradeItems[key].level,
      currentPrice: upgradeItems[key].currentPrice
    };
  }
  let data = {
    coins: coins,
    upgrades: upgradesData,
    startingCashBonus: startingCashBonus,
    enemyHealthMultiplier: enemyHealthMultiplier,
    gameSpeedMax: gameSpeedMax,
    waveCoinsBonus: waveCoinsBonus,
    towerBulletSpeedBonus: towerBulletSpeedBonus
  };
  localStorage.setItem("gameProgress", JSON.stringify(data));
}

function loadGameProgress() {
  let data = localStorage.getItem("gameProgress");
  if (data) {
    data = JSON.parse(data);
    coins = data.coins || 0;
    startingCashBonus = data.startingCashBonus || 0;
    enemyHealthMultiplier = data.enemyHealthMultiplier || 1;
    gameSpeedMax = data.gameSpeedMax || 2;
    waveCoinsBonus = data.waveCoinsBonus || 2;
    towerBulletSpeedBonus = data.towerBulletSpeedBonus || 0;
    if (data.upgrades) {
      for (let key in data.upgrades) {
        if (upgradeItems[key]) {
          upgradeItems[key].level = data.upgrades[key].level;
          upgradeItems[key].currentPrice = data.upgrades[key].currentPrice;
        }
      }
    }
  }
}

/*****************************
   INITIALIZE THE GAME
*****************************/
loadSettings();
gameContainer.style.display = "none";
