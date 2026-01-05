let scene, camera, renderer;
let zombies = [];
let buildings = [];
let bullets = [];
let lights = [];
let gibs = [];
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let raycaster = new THREE.Raycaster();
let weapon;
let weaponBarrel;
let gunshotAudio;
let zombieModel = null;
let zombieAnimations = [];
const targetZombieHeight = 1.7;

// Game state
let gameStarted = false;
let gameOver = false;
let round = 1;
let kills = 0;
let zombiesThisRound = 6;
let zombiesSpawned = 0;
let zombiesKilled = 0;
let health = 100;
const maxHealth = 100;
const healthRegenRate = 6;
const overlayMinOpacity = 0.05;
const overlayMaxOpacity = 0.75;
let currentAmmo = 30;
let reserveAmmo = 120;
let reloading = false;
let sprinting = false;
const sprintMultiplier = 1.6;
const fireCooldownMs = 1000;
let lastShotTime = 0;

const clock = new THREE.Clock();

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.015);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1f,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Ambient light (very dark for atmosphere)
    const ambientLight = new THREE.AmbientLight(0x404060, 0.3);
    scene.add(ambientLight);

    // Create atmospheric environment
    createBuildings();
    createStreetLights();
    createDebris();
    createWeapon();
    loadZombieModel();
    gunshotAudio = new Audio('assets/gunshot.mp3');
    gunshotAudio.volume = 0.7;

    // Mouse lock
    renderer.domElement.addEventListener('click', () => {
        if (gameStarted && !gameOver) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        // Handle pointer lock change
    });

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onMouseClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    window.addEventListener('resize', onWindowResize);
}

function loadZombieModel() {
    const loader = new THREE.FBXLoader();
    const statusEl = document.getElementById('modelStatus');
    if (statusEl) {
        statusEl.textContent = 'Loading zombie model from assets/zombie.fbx...';
    }
    fetch('assets/zombie.fbx', { method: 'HEAD' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            loader.load(
                'assets/zombie.fbx',
                fbx => {
                    zombieModel = fbx;
                    zombieAnimations = fbx.animations || [];
                    if (statusEl) {
                        statusEl.textContent = 'Zombie model loaded from assets/zombie.fbx.';
                    }
                    zombieModel.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            if (child.material) {
                                child.material.side = THREE.DoubleSide;
                            }
                        }
                    });
                },
                undefined,
                error => {
                    console.error('Failed to load zombie model from assets/zombie.fbx.', error);
                    if (statusEl) {
                        statusEl.textContent = 'Zombie model failed to load. Check console for details.';
                    }
                }
            );
        })
        .catch(error => {
            console.error('Zombie model file missing or unreachable.', error);
            if (statusEl) {
                statusEl.textContent = 'Missing assets/zombie.fbx. Add the file to the assets folder.';
            }
        });
}

function createWeapon() {
    const weaponGroup = new THREE.Group();

    const bodyGeometry = new THREE.BoxGeometry(0.25, 0.18, 0.8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x2b2b2f,
        roughness: 0.6,
        metalness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0.15, -0.15, -0.5);
    weaponGroup.add(body);

    const barrelGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12);
    const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x444450,
        roughness: 0.4,
        metalness: 0.6
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.18, -0.12, -0.95);
    weaponGroup.add(barrel);
    weaponBarrel = barrel;

    const gripGeometry = new THREE.BoxGeometry(0.12, 0.25, 0.18);
    const gripMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1f,
        roughness: 0.8,
        metalness: 0.2
    });
    const grip = new THREE.Mesh(gripGeometry, gripMaterial);
    grip.position.set(0.12, -0.32, -0.35);
    weaponGroup.add(grip);

    weaponGroup.position.set(0.35, -0.25, -0.6);
    camera.add(weaponGroup);
    scene.add(camera);
    weapon = weaponGroup;
}

function createBuildings() {
    // Create destroyed/damaged buildings around the map
    const buildingPositions = [
        { x: -30, z: -30, w: 15, h: 25, d: 12 },
        { x: 30, z: -25, w: 12, h: 20, d: 15 },
        { x: -35, z: 30, w: 18, h: 30, d: 10 },
        { x: 35, z: 35, w: 14, h: 22, d: 14 },
        { x: 0, z: -45, w: 20, h: 18, d: 16 },
        { x: -50, z: 0, w: 16, h: 28, d: 12 },
        { x: 50, z: 5, w: 13, h: 24, d: 13 }
    ];

    buildingPositions.forEach(pos => {
        // Main building
        const geometry = new THREE.BoxGeometry(pos.w, pos.h, pos.d);
        const material = new THREE.MeshStandardMaterial({
            color: 0x252530,
            roughness: 0.9,
            metalness: 0.1
        });
        const building = new THREE.Mesh(geometry, material);
        building.position.set(pos.x, pos.h / 2, pos.z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        buildings.push(building);

        // Add windows
        const windowGeometry = new THREE.BoxGeometry(1, 1.5, 0.1);
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a3a50,
            emissive: Math.random() > 0.7 ? 0x4a4a60 : 0x000000,
            emissiveIntensity: 0.3
        });

        // Add several windows
        for (let i = 0; i < 6; i++) {
            const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
            windowMesh.position.set(
                pos.x + (Math.random() - 0.5) * pos.w * 0.8,
                pos.h * 0.3 + Math.random() * pos.h * 0.4,
                pos.z + pos.d / 2 + 0.05
            );
            scene.add(windowMesh);
        }
    });
}

function createStreetLights() {
    const lightPositions = [
        { x: -20, z: -20 },
        { x: 20, z: -20 },
        { x: -20, z: 20 },
        { x: 20, z: 20 },
        { x: 0, z: 0 },
        { x: -40, z: 0 },
        { x: 40, z: 0 }
    ];

    lightPositions.forEach(pos => {
        // Pole
        const poleGeometry = new THREE.CylinderGeometry(0.2, 0.2, 8, 8);
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a35 });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.set(pos.x, 4, pos.z);
        pole.castShadow = true;
        scene.add(pole);

        // Light source - blue atmospheric light like in the image
        const light = new THREE.PointLight(0x6090ff, 2, 30);
        light.position.set(pos.x, 7.5, pos.z);
        light.castShadow = true;
        light.shadow.mapSize.width = 512;
        light.shadow.mapSize.height = 512;
        scene.add(light);

        // Light bulb
        const bulbGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const bulbMaterial = new THREE.MeshStandardMaterial({
            color: 0x8ab0ff,
            emissive: 0x6090ff,
            emissiveIntensity: 1
        });
        const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
        bulb.position.set(pos.x, 7.5, pos.z);
        scene.add(bulb);

        lights.push({ light, flickering: Math.random() > 0.6, flickerTime: 0 });
    });
}

function createDebris() {
    // Scattered debris and destroyed cars
    for (let i = 0; i < 15; i++) {
        const debrisGeometry = new THREE.BoxGeometry(
            Math.random() * 2 + 0.5,
            Math.random() * 1 + 0.3,
            Math.random() * 2 + 0.5
        );
        const debrisMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a3a3f,
            roughness: 0.9
        });
        const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);
        debris.position.set(
            (Math.random() - 0.5) * 80,
            0.5,
            (Math.random() - 0.5) * 80
        );
        debris.rotation.y = Math.random() * Math.PI;
        debris.castShadow = true;
        debris.receiveShadow = true;
        scene.add(debris);
    }

    // Add destroyed cars
    for (let i = 0; i < 5; i++) {
        const carGeometry = new THREE.BoxGeometry(4, 1.5, 2);
        const carMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2f,
            roughness: 0.8
        });
        const car = new THREE.Mesh(carGeometry, carMaterial);
        car.position.set(
            (Math.random() - 0.5) * 60,
            0.75,
            (Math.random() - 0.5) * 60
        );
        car.rotation.y = Math.random() * Math.PI * 2;
        car.castShadow = true;
        car.receiveShadow = true;
        scene.add(car);
    }
}

function spawnZombie() {
    if (!zombieModel) {
        return;
    }

    const zombieGroup = THREE.SkeletonUtils
        ? THREE.SkeletonUtils.clone(zombieModel)
        : zombieModel.clone(true);

    const unscaledBounds = new THREE.Box3().setFromObject(zombieGroup);
    const unscaledHeight = Math.max(0.01, unscaledBounds.max.y - unscaledBounds.min.y);
    const scale = targetZombieHeight / unscaledHeight;
    zombieGroup.scale.setScalar(scale);
    const zombieBounds = new THREE.Box3().setFromObject(zombieGroup);
    const groundOffset = -zombieBounds.min.y;

    // Spawn at random position away from player
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 20;
    zombieGroup.position.set(
        Math.cos(angle) * distance,
        groundOffset,
        Math.sin(angle) * distance
    );
    zombieGroup.groundOffset = groundOffset;

    zombieGroup.health = 1;
    zombieGroup.maxHealth = zombieGroup.health;
    zombieGroup.speed = (0.03 + (round * 0.005)) * 0.3;
    if (zombieAnimations.length > 0) {
        const mixer = new THREE.AnimationMixer(zombieGroup);
        const action = mixer.clipAction(zombieAnimations[0]);
        action.reset();
        action.setLoop(THREE.LoopRepeat);
        action.clampWhenFinished = false;
        action.play();
        zombieGroup.mixer = mixer;
    }

    scene.add(zombieGroup);
    zombies.push(zombieGroup);
    zombiesSpawned++;
}

function shoot() {
    const now = performance.now();
    if (now - lastShotTime < fireCooldownMs) {
        return;
    }

    let hitPoint = null;
    let hitZombie = null;
    let hitObject = null;
    if (currentAmmo > 0 && !reloading) {
        lastShotTime = now;
        currentAmmo--;
        updateAmmoDisplay();

        // Raycast from camera
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.intersectObjects(zombies, true);

        if (intersects.length > 0) {
            hitObject = intersects[0].object;
            let zombie = hitObject;
            hitPoint = intersects[0].point.clone();
            while (zombie && !zombies.includes(zombie)) {
                zombie = zombie.parent;
            }
            hitZombie = zombie || null;
        }

        if (hitZombie) {
            hitZombie.health--;

            // Flash zombie when hit
            if (hitObject && hitObject.material) {
                hitObject.material.emissiveIntensity = 1;
            }
            setTimeout(() => {
                if (hitObject && hitObject.material) {
                    hitObject.material.emissiveIntensity = 0.2;
                }
            }, 100);

            if (hitZombie.health <= 0) {
                spawnGibs(hitZombie.position);
                scene.remove(hitZombie);
                zombies = zombies.filter(z => z !== hitZombie);
                kills++;
                zombiesKilled++;
                document.getElementById('killCount').textContent = kills;

                if (zombiesKilled >= zombiesThisRound) {
                    nextRound();
                }
            }
        }

        // Muzzle flash
        createMuzzleFlash();
        createTracer(hitPoint);
        if (gunshotAudio) {
            gunshotAudio.currentTime = 0;
            gunshotAudio.play().catch(() => {});
        }
    }
}

function createMuzzleFlash() {
    const flashLight = new THREE.PointLight(0xffcc88, 2, 6);
    if (weaponBarrel) {
        weaponBarrel.getWorldPosition(flashLight.position);
    } else {
        flashLight.position.copy(camera.position);
        flashLight.position.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.6));
    }
    scene.add(flashLight);

    setTimeout(() => scene.remove(flashLight), 50);
}

function createTracer(hitPoint) {
    const direction = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const start = new THREE.Vector3();
    if (weaponBarrel) {
        weaponBarrel.getWorldPosition(start);
    } else {
        start.copy(camera.position).add(direction.clone().multiplyScalar(0.6));
    }
    let end = start.clone().add(direction.clone().multiplyScalar(24));
    if (hitPoint) {
        end = hitPoint.clone();
    }
    const tracerGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const tracerMaterial = new THREE.LineBasicMaterial({
        color: 0xffdd88,
        transparent: true,
        opacity: 0.9
    });
    const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
    scene.add(tracer);

    setTimeout(() => scene.remove(tracer), 140);
}

function reload() {
    if (reserveAmmo > 0 && currentAmmo < 30 && !reloading) {
        reloading = true;
        setTimeout(() => {
            const ammoNeeded = 30 - currentAmmo;
            const ammoToReload = Math.min(ammoNeeded, reserveAmmo);
            currentAmmo += ammoToReload;
            reserveAmmo -= ammoToReload;
            reloading = false;
            updateAmmoDisplay();
        }, 2000);
    }
}

function nextRound() {
    round++;
    zombiesKilled = 0;
    zombiesSpawned = 0;
    zombiesThisRound = Math.floor(6 + (round * 1.5));
    document.getElementById('roundNumber').textContent = round;

    health = Math.min(maxHealth, health + 20);
}

function updateZombies(delta) {
    zombies.forEach(zombie => {
        if (zombie.mixer) {
            zombie.mixer.update(delta);
        }
        const direction = new THREE.Vector3();
        direction.subVectors(camera.position, zombie.position);
        direction.y = 0;
        direction.normalize();

        // Check collision with player
        const distance = zombie.position.distanceTo(camera.position);
        if (distance < 2.1) {

            health -= 19.5;

            if (health <= 0) {
                endGame();
            }
            return;
        }

        zombie.position.add(direction.multiplyScalar(zombie.speed));
        zombie.position.y = zombie.groundOffset ?? 0;
        const lookTarget = new THREE.Vector3(camera.position.x, zombie.position.y, camera.position.z);
        zombie.lookAt(lookTarget);
    });

    // Spawn zombies
    if (zombiesSpawned < zombiesThisRound && zombies.length < 24) {
        if (Math.random() < 0.02) {
            spawnZombie();
        }
    }
}

function updateLights() {
    lights.forEach(lightObj => {
        if (lightObj.flickering) {
            lightObj.flickerTime += 0.1;
            lightObj.light.intensity = 1.5 + Math.sin(lightObj.flickerTime) * 0.5 + Math.random() * 0.3;
        }
    });
}

function spawnGibs(position) {
    const gibCount = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < gibCount; i++) {
        const gibGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const gibMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a0f0f,
            emissive: 0x120000,
            roughness: 0.8,
            metalness: 0.1
        });
        const gib = new THREE.Mesh(gibGeometry, gibMaterial);
        gib.position.set(position.x, 0.8 + Math.random() * 0.6, position.z);
        gib.castShadow = true;
        gib.receiveShadow = true;
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            2 + Math.random() * 3,
            (Math.random() - 0.5) * 4
        );
        gibs.push({ mesh: gib, velocity, life: 1.2 + Math.random() * 0.6 });
        scene.add(gib);
    }
}

function updateGibs(delta) {
    gibs = gibs.filter(gib => {
        gib.velocity.y -= 9.8 * delta;
        gib.mesh.position.addScaledVector(gib.velocity, delta);
        if (gib.mesh.position.y < 0.05) {
            gib.mesh.position.y = 0.05;
            gib.velocity.y *= -0.3;
            gib.velocity.x *= 0.6;
            gib.velocity.z *= 0.6;
        }
        gib.life -= delta;
        if (gib.life <= 0) {
            scene.remove(gib.mesh);
            return false;
        }
        return true;
    });
}

function updateMovement(delta) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 6.5 * 10.0 * delta;

    const moveZ = Number(moveBackward) - Number(moveForward);
    const moveX = Number(moveRight) - Number(moveLeft);
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, up).normalize();

    direction.set(0, 0, 0);
    direction.addScaledVector(forward, moveZ);
    direction.addScaledVector(right, moveX);
    if (direction.lengthSq() > 0) {
        direction.normalize();
    }

    if (moveForward || moveBackward || moveLeft || moveRight) {
        const speedMultiplier = sprinting ? sprintMultiplier : 1;
        velocity.z -= direction.z * 40.0 * speedMultiplier * delta;
        velocity.x -= direction.x * 40.0 * speedMultiplier * delta;
    }

    camera.position.x += velocity.x * delta;
    camera.position.z += velocity.z * delta;

    camera.position.y += velocity.y * delta;

    if (camera.position.y < 1.6) {
        velocity.y = 0;
        camera.position.y = 1.6;
        canJump = true;
    }
}

const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function onMouseMove(event) {
    if (document.pointerLockElement === renderer.domElement) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        euler.setFromQuaternion(camera.quaternion);
        euler.y -= movementX * 0.002;
        euler.x -= movementY * 0.002;
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
        camera.quaternion.setFromEuler(euler);
    }
}

function onMouseClick() {
    if (gameStarted && !gameOver && document.pointerLockElement === renderer.domElement) {
        shoot();
    }
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW':
            moveForward = true;
            break;
        case 'KeyS':
            moveBackward = true;
            break;
        case 'KeyA':
            moveLeft = true;
            break;
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            if (canJump) {
                velocity.y += 14;
                canJump = false;
            }
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            sprinting = true;
            break;
        case 'KeyR':
            reload();
            break;
        default:
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
            moveForward = false;
            break;
        case 'KeyS':
            moveBackward = false;
            break;
        case 'KeyA':
            moveLeft = false;
            break;
        case 'KeyD':
            moveRight = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            sprinting = false;
            break;
        default:
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateAmmoDisplay() {
    document.getElementById('currentAmmo').textContent = currentAmmo;
    document.getElementById('reserveAmmo').textContent = reserveAmmo;
}

function endGame() {
    gameOver = true;
    document.getElementById('finalRound').textContent = round;
    document.getElementById('finalKills').textContent = kills;
    document.getElementById('gameOver').classList.add('show');
    document.exitPointerLock();
}

function startGame() {
    document.getElementById('instructions').style.display = 'none';
    gameStarted = true;
    animate();
}

function updateDamageOverlay() {
    const damageRatio = Math.min(1, Math.max(0, (maxHealth - health) / maxHealth));
    const overlayOpacity = overlayMinOpacity + damageRatio * (overlayMaxOpacity - overlayMinOpacity);
    document.getElementById('damageOverlay').style.background = `rgba(255, 0, 0, ${overlayOpacity.toFixed(3)})`;
}

function updateHealthRegen(delta) {
    if (health <= 0 || health >= maxHealth) {
        return;
    }

    health = Math.min(maxHealth, health + healthRegenRate * delta);
}

function animate() {
    if (!gameStarted || gameOver) return;

    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    updateMovement(delta);
    updateZombies(delta);
    updateLights();
    updateGibs(delta);
    updateHealthRegen(delta);
    updateDamageOverlay();

    renderer.render(scene, camera);
}

init();
