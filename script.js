let scene, camera, renderer;
let zombies = [];
let buildings = [];
let bullets = [];
let lights = [];
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let raycaster = new THREE.Raycaster();

// Game state
let gameStarted = false;
let gameOver = false;
let round = 1;
let kills = 0;
let zombiesThisRound = 6;
let zombiesSpawned = 0;
let zombiesKilled = 0;
let health = 100;
let currentAmmo = 30;
let reserveAmmo = 120;
let reloading = false;

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
    const zombieGeometry = new THREE.BoxGeometry(1, 2, 1);
    const zombieMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a5a3a,
        emissive: 0x2a4a2a,
        emissiveIntensity: 0.2
    });
    const zombie = new THREE.Mesh(zombieGeometry, zombieMaterial);

    // Spawn at random position away from player
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 20;
    zombie.position.set(
        Math.cos(angle) * distance,
        1,
        Math.sin(angle) * distance
    );

    zombie.castShadow = true;
    zombie.health = 3 + Math.floor(round * 0.5);
    zombie.maxHealth = zombie.health;
    zombie.speed = 0.03 + (round * 0.005);

    scene.add(zombie);
    zombies.push(zombie);
    zombiesSpawned++;
}

function shoot() {
    if (currentAmmo > 0 && !reloading) {
        currentAmmo--;
        updateAmmoDisplay();

        // Raycast from camera
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.intersectObjects(zombies);

        if (intersects.length > 0) {
            const zombie = intersects[0].object;
            zombie.health--;

            // Flash zombie when hit
            zombie.material.emissiveIntensity = 1;
            setTimeout(() => {
                if (zombie.material) zombie.material.emissiveIntensity = 0.2;
            }, 100);

            if (zombie.health <= 0) {
                scene.remove(zombie);
                zombies = zombies.filter(z => z !== zombie);
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
    }
}

function createMuzzleFlash() {
    const flashGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 1
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(camera.position);
    flash.position.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1));
    scene.add(flash);

    setTimeout(() => scene.remove(flash), 50);
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

    health = Math.min(100, health + 20);
    document.getElementById('healthValue').textContent = Math.floor(health);
}

function updateZombies() {
    zombies.forEach(zombie => {
        const direction = new THREE.Vector3();
        direction.subVectors(camera.position, zombie.position);
        direction.y = 0;
        direction.normalize();

        // Check collision with player
        const distance = zombie.position.distanceTo(camera.position);
        if (distance < 1.8) {
            const pushDirection = new THREE.Vector3();
            pushDirection.subVectors(zombie.position, camera.position);
            pushDirection.y = 0;
            if (pushDirection.lengthSq() > 0) {
                pushDirection.normalize();
                zombie.position.copy(camera.position).add(pushDirection.multiplyScalar(1.8));
            }

            health -= 0.3;
            document.getElementById('healthValue').textContent = Math.floor(health);

            if (health <= 0) {
                endGame();
            }
            return;
        }

        zombie.position.add(direction.multiplyScalar(zombie.speed));
        zombie.lookAt(camera.position);
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

function updateMovement() {
    const delta = clock.getDelta();
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 9.8 * 10.0 * delta;

    const moveZ = Number(moveForward) - Number(moveBackward);
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
        velocity.z -= direction.z * 40.0 * delta;
        velocity.x -= direction.x * 40.0 * delta;
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
                velocity.y += 5;
                canJump = false;
            }
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

function animate() {
    if (!gameStarted || gameOver) return;

    requestAnimationFrame(animate);

    updateMovement();
    updateZombies();
    updateLights();

    renderer.render(scene, camera);
}

init();
